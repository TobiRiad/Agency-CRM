import OpenAI from 'openai';
import type PocketBase from 'pocketbase';
import type { Contact, FunnelStage } from '@/types';
import {
  findContactByEmail,
  hasContactReplied,
  markContactEmailsAsReplied,
  cancelContactFollowUp,
  setContactFollowUp,
  setContactStage,
  getFunnelStages,
  createInboxMessage,
  getLatestEmailSendForContact,
} from '@/lib/pocketbase';
import { notifyAgentAction } from '@/lib/notifications';
import type { GmailMessage } from '@/lib/gmail';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ==========================================
// Tool definitions for the AI agent
// ==========================================

const FOLLOW_UP_RULES = `
Follow-up date rules:
- If the person is OUT OF OFFICE and mentions a specific return date, set the follow-up to 2 business days after their return date.
- If the person is OUT OF OFFICE but does NOT mention a return date, set the follow-up to 14 days from today.
- If the person sends a generic auto-reply (not OOO), set the follow-up to 7 days from today.
- If the person actually replied to the email (a real human response), do NOT set a follow-up — mark them as replied instead.
- Never set a follow-up date in the past. If the extracted date is in the past, use 3 days from today.
`;

const AGENT_SYSTEM_PROMPT = `You are an AI email inbox agent for a CRM outreach system. You analyze incoming emails and take appropriate actions.

When you receive an email, you must:
1. Classify the email as one of: out_of_office, reply, bounce, or unrelated
2. Provide a brief summary of the email content
3. Take the appropriate action using the tools available to you

Classification guidelines:
- "out_of_office": Auto-replies indicating the person is away, on vacation, parental leave, etc. Look for phrases like "out of office", "away from", "on vacation", "will return", "auto-reply", "automatic reply", "currently unavailable"
- "reply": A real human response to the outreach email. The person is engaging with the content, asking questions, expressing interest, or declining.
- "bounce": Delivery failure notices, "address not found", mailbox full, etc.
- "unrelated": Newsletters, spam, or emails not related to outreach campaigns

${FOLLOW_UP_RULES}

IMPORTANT:
- Always call the appropriate action tool after classifying
- For out_of_office: call set_follow_up_date with the calculated date
- For reply: call mark_as_replied to stop follow-ups
- For bounce or unrelated: call set_funnel_stage if appropriate, but no other action is needed
- Be precise about extracting return dates from OOO messages
`;

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'classify_and_summarize',
      description: 'Classify the email and provide a summary. This must always be called first.',
      parameters: {
        type: 'object',
        properties: {
          classification: {
            type: 'string',
            enum: ['out_of_office', 'reply', 'bounce', 'unrelated'],
            description: 'The classification of the email',
          },
          summary: {
            type: 'string',
            description: 'A brief 1-2 sentence summary of the email content',
          },
        },
        required: ['classification', 'summary'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mark_as_replied',
      description: 'Mark the contact as having replied. This cancels all pending follow-ups and moves them to the Replied funnel stage.',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: 'Brief reason for marking as replied',
          },
        },
        required: ['reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_follow_up_date',
      description: 'Set a follow-up date for the contact. Use the follow-up rules to determine the correct date.',
      parameters: {
        type: 'object',
        properties: {
          follow_up_date: {
            type: 'string',
            description: 'The follow-up date in ISO 8601 format (YYYY-MM-DD)',
          },
          reason: {
            type: 'string',
            description: 'Brief reason for this follow-up date (e.g., "OOO until March 15, following up 2 business days after")',
          },
        },
        required: ['follow_up_date', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_funnel_stage',
      description: 'Move the contact to a specific funnel stage.',
      parameters: {
        type: 'object',
        properties: {
          stage_name: {
            type: 'string',
            description: 'The name of the funnel stage to move the contact to (e.g., "Out of Office", "Replied", "Bounced")',
          },
        },
        required: ['stage_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_follow_up_rules',
      description: 'Get the rules for determining follow-up dates',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
];

// ==========================================
// Agent execution
// ==========================================

export interface InboxAgentResult {
  classification: string;
  summary: string;
  actionTaken: string;
  followUpDate?: string;
  funnelStage?: string;
  skipped: boolean;
  skipReason?: string;
}

/**
 * Process an incoming email through the AI agent.
 * 
 * Flow:
 * 1. Match the sender to a contact in the database
 * 2. Check if the contact has already been marked as replied
 * 3. Pass the email to the AI agent for classification
 * 4. Execute the agent's tool calls (set stage, set follow-up, mark replied)
 * 5. Record the inbox message
 * 6. Send notification to admin
 */
export async function processIncomingEmail(
  pb: PocketBase,
  message: GmailMessage
): Promise<InboxAgentResult> {
  const { extractEmailAddress } = await import('@/lib/gmail');
  const senderEmail = extractEmailAddress(message.from);

  // 1. Find the contact
  const contact = await findContactByEmail(pb, senderEmail);

  if (!contact) {
    // Not from anyone we've emailed — store it as unrelated
    await createInboxMessage(pb, {
      from_email: senderEmail,
      subject: message.subject,
      body_text: message.bodyText.slice(0, 5000), // Truncate very long emails
      gmail_message_id: message.id,
      gmail_thread_id: message.threadId,
      classification: 'unrelated',
      ai_summary: 'Sender not found in contacts database',
      action_taken: 'No action — sender not a known contact',
      processed_at: new Date().toISOString(),
      received_at: message.date ? new Date(message.date).toISOString() : new Date().toISOString(),
    });

    return {
      classification: 'unrelated',
      summary: 'Sender not found in contacts database',
      actionTaken: 'No action — sender not a known contact',
      skipped: true,
      skipReason: 'Sender not in contacts',
    };
  }

  // 2. Check if already replied
  const alreadyReplied = await hasContactReplied(pb, contact.id);
  if (alreadyReplied) {
    await createInboxMessage(pb, {
      from_email: senderEmail,
      subject: message.subject,
      body_text: message.bodyText.slice(0, 5000),
      gmail_message_id: message.id,
      gmail_thread_id: message.threadId,
      contact: contact.id,
      campaign: contact.campaign,
      classification: 'reply',
      ai_summary: 'Follow-up reply from contact already marked as replied',
      action_taken: 'No action — contact already marked as replied',
      processed_at: new Date().toISOString(),
      received_at: message.date ? new Date(message.date).toISOString() : new Date().toISOString(),
    });

    return {
      classification: 'reply',
      summary: 'Follow-up reply from contact already marked as replied',
      actionTaken: 'No action — contact already marked as replied',
      skipped: true,
      skipReason: 'Contact already marked as replied',
    };
  }

  // 3. Run the AI agent
  const agentResult = await runAgent(pb, contact, message);

  // 4. Record inbox message
  await createInboxMessage(pb, {
    from_email: senderEmail,
    subject: message.subject,
    body_text: message.bodyText.slice(0, 5000),
    gmail_message_id: message.id,
    gmail_thread_id: message.threadId,
    contact: contact.id,
    campaign: contact.campaign,
    classification: agentResult.classification,
    ai_summary: agentResult.summary,
    action_taken: agentResult.actionTaken,
    processed_at: new Date().toISOString(),
    received_at: message.date ? new Date(message.date).toISOString() : new Date().toISOString(),
  });

  // 5. Send notification to admin
  const campaignName = contact.expand?.campaign?.name || 'Unknown Campaign';
  const contactName = `${contact.first_name} ${contact.last_name}`.trim();

  await notifyAgentAction({
    contactName: contactName || senderEmail,
    contactEmail: senderEmail,
    campaignName,
    classification: agentResult.classification,
    summary: agentResult.summary,
    actionTaken: agentResult.actionTaken,
    followUpDate: agentResult.followUpDate,
    originalSubject: message.subject,
  });

  return agentResult;
}

/**
 * Run the OpenAI agent with tool calling to classify and act on an email.
 */
async function runAgent(
  pb: PocketBase,
  contact: Contact,
  message: GmailMessage
): Promise<InboxAgentResult> {
  const result: InboxAgentResult = {
    classification: 'unrelated',
    summary: '',
    actionTaken: '',
    skipped: false,
  };

  const actions: string[] = [];

  // Build the user message with context
  const lastSend = await getLatestEmailSendForContact(pb, contact.id);
  const contextLines = [
    `Incoming email from: ${message.from}`,
    `Subject: ${message.subject}`,
    `Date: ${message.date}`,
    '',
    `--- Contact Context ---`,
    `Name: ${contact.first_name} ${contact.last_name}`,
    `Email: ${contact.email}`,
    `Title: ${contact.title || 'N/A'}`,
  ];

  if (lastSend) {
    contextLines.push(
      '',
      `--- Last Outreach Email We Sent ---`,
      `Subject: ${lastSend.expand?.template?.subject || 'Unknown'}`,
      `Sent: ${lastSend.sent_at}`,
      `Status: ${lastSend.status}`,
    );
  }

  contextLines.push(
    '',
    `--- Email Body ---`,
    message.bodyText.slice(0, 3000), // Limit to 3000 chars for the AI
  );

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: AGENT_SYSTEM_PROMPT },
    { role: 'user', content: contextLines.join('\n') },
  ];

  // Run the agent loop (max 5 iterations to prevent infinite loops)
  for (let i = 0; i < 5; i++) {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      messages,
      tools,
      tool_choice: i === 0 ? 'required' : 'auto',
    });

    const assistantMessage = completion.choices[0]?.message;
    if (!assistantMessage) break;

    messages.push(assistantMessage);

    // If no tool calls, the agent is done
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      break;
    }

    // Execute each tool call
    for (const toolCall of assistantMessage.tool_calls) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tc = toolCall as any;
      const args = JSON.parse(tc.function.arguments);
      let toolResult = '';

      switch (tc.function.name as string) {
        case 'classify_and_summarize': {
          result.classification = args.classification;
          result.summary = args.summary;
          toolResult = `Classified as: ${args.classification}. Summary recorded.`;
          break;
        }

        case 'mark_as_replied': {
          try {
            // Cancel follow-ups
            await cancelContactFollowUp(pb, contact.id);
            // Mark email sends as replied
            await markContactEmailsAsReplied(pb, contact.id);
            // Move to "Replied" funnel stage
            await moveToStage(pb, contact, 'Replied');
            actions.push(`Marked as replied: ${args.reason}. Cancelled follow-ups. Moved to Replied stage.`);
            result.funnelStage = 'Replied';
            toolResult = 'Successfully marked contact as replied, cancelled follow-ups, and moved to Replied stage.';
          } catch (error) {
            toolResult = `Error marking as replied: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
          break;
        }

        case 'set_follow_up_date': {
          try {
            // Validate the date isn't in the past
            let followUpDate = new Date(args.follow_up_date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            if (followUpDate < today) {
              // Default to 3 days from now
              followUpDate = new Date();
              followUpDate.setDate(followUpDate.getDate() + 3);
            }

            const isoDate = followUpDate.toISOString();
            await setContactFollowUp(pb, contact.id, {
              follow_up_date: isoDate,
              follow_up_cancelled: false,
            });

            result.followUpDate = isoDate;
            actions.push(`Set follow-up for ${followUpDate.toDateString()}: ${args.reason}`);
            toolResult = `Follow-up date set to ${followUpDate.toDateString()}.`;
          } catch (error) {
            toolResult = `Error setting follow-up date: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
          break;
        }

        case 'set_funnel_stage': {
          try {
            await moveToStage(pb, contact, args.stage_name);
            result.funnelStage = args.stage_name;
            actions.push(`Moved to funnel stage: ${args.stage_name}`);
            toolResult = `Contact moved to "${args.stage_name}" stage.`;
          } catch (error) {
            toolResult = `Error setting funnel stage: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
          break;
        }

        case 'get_follow_up_rules': {
          toolResult = FOLLOW_UP_RULES;
          break;
        }

        default: {
          toolResult = `Unknown tool: ${tc.function.name}`;
        }
      }

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: toolResult,
      });
    }
  }

  result.actionTaken = actions.length > 0 ? actions.join(' | ') : 'No action taken';
  return result;
}

/**
 * Move a contact to a funnel stage by name. Creates the stage if it doesn't exist.
 */
async function moveToStage(pb: PocketBase, contact: Contact, stageName: string): Promise<void> {
  const stages = await getFunnelStages(pb, contact.campaign);

  // Find matching stage (case-insensitive)
  let stage = stages.find(
    (s: FunnelStage) => s.name.toLowerCase() === stageName.toLowerCase()
  );

  // If stage doesn't exist, create it
  if (!stage) {
    const maxOrder = stages.reduce((max: number, s: FunnelStage) => Math.max(max, s.order), 0);
    const stageColors: Record<string, string> = {
      'replied': '#22c55e',
      'out of office': '#f59e0b',
      'bounced': '#ef4444',
      'interested': '#3b82f6',
      'not interested': '#6b7280',
    };

    stage = await pb.collection('funnel_stages').create<FunnelStage>({
      name: stageName,
      order: maxOrder + 1,
      color: stageColors[stageName.toLowerCase()] || '#6b7280',
      campaign: contact.campaign,
    });
  }

  if (stage) {
    await setContactStage(pb, contact.id, stage.id);
  }
}
