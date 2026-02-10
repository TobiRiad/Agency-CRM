import PocketBase, { ClientResponseError } from 'pocketbase';
import type {
  User,
  Campaign,
  Company,
  Contact,
  Batch,
  CustomField,
  ContactFieldValue,
  EmailTemplateGroup,
  EmailTemplate,
  EmailSend,
  FunnelStage,
  ContactStage,
  FollowUpSequence,
  FollowUpStep,
  AIScoringConfig,
  CustomOutputField,
  CampaignKind,
  FirecrawlUrls,
  InboxMessage,
} from '@/types';

const POCKETBASE_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://localhost:8090';

export function isClientResponseError(error: unknown): error is ClientResponseError {
  return typeof error === 'object' && error !== null && 'status' in error;
}

// Create a PocketBase instance
export function createPocketBase() {
  const pb = new PocketBase(POCKETBASE_URL);
  // Disable auto-cancellation to avoid request conflicts
  pb.autoCancellation(false);
  return pb;
}

// Singleton for client-side usage
let clientPB: PocketBase | null = null;

export function getClientPB(): PocketBase {
  if (typeof window === 'undefined') {
    throw new Error('getClientPB should only be called on the client side');
  }

  if (!clientPB) {
    clientPB = createPocketBase();

    // Load auth from localStorage
    const authData = localStorage.getItem('pocketbase_auth');
    if (authData) {
      try {
        const { token, model } = JSON.parse(authData);
        clientPB.authStore.save(token, model);
      } catch (e) {
        console.error('Failed to restore auth:', e);
        localStorage.removeItem('pocketbase_auth');
      }
    }

    // Save auth changes to localStorage
    clientPB.authStore.onChange((token, model) => {
      if (token && model) {
        localStorage.setItem('pocketbase_auth', JSON.stringify({ token, model }));
      } else {
        localStorage.removeItem('pocketbase_auth');
      }
    });
  }

  return clientPB;
}

// Server-side PocketBase instance (creates new instance each time)
export function getServerPB(): PocketBase {
  return createPocketBase();
}

// Server-side PocketBase instance authenticated as superuser/admin (for server routes)
export async function getServerAdminPB(): Promise<PocketBase> {
  const pb = createPocketBase();

  const email = process.env.POCKETBASE_ADMIN_EMAIL;
  const password = process.env.POCKETBASE_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error('Missing POCKETBASE_ADMIN_EMAIL/POCKETBASE_ADMIN_PASSWORD env vars');
  }

  // PocketBase SDK supports admin auth via pb.admins in most versions.
  // If unavailable, this will throw and surface a clear error.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyPb = pb as any;
  if (!anyPb.admins?.authWithPassword) {
    throw new Error('PocketBase admin auth API not available in this SDK version');
  }

  await anyPb.admins.authWithPassword(email, password);
  return pb;
}

// Auth functions
export async function login(pb: PocketBase, email: string, password: string) {
  return pb.collection('users').authWithPassword(email, password);
}

export async function register(pb: PocketBase, email: string, password: string, name: string) {
  const user = await pb.collection('users').create({
    email,
    password,
    passwordConfirm: password,
    name,
  });
  // Auto login after registration
  await login(pb, email, password);
  return user;
}

export function logout(pb: PocketBase) {
  pb.authStore.clear();
  if (typeof window !== 'undefined') {
    localStorage.removeItem('pocketbase_auth');
  }
}

export function getCurrentUser(pb: PocketBase): User | null {
  if (!pb.authStore.isValid) return null;
  return pb.authStore.model as User;
}

export function isAuthenticated(pb: PocketBase): boolean {
  return pb.authStore.isValid;
}

// Campaign functions
export async function getCampaigns(pb: PocketBase, userId: string): Promise<Campaign[]> {
  const result = await pb.collection('campaigns').getList<Campaign>(1, 100);
  return result.items;
}

export async function getCampaign(pb: PocketBase, id: string): Promise<Campaign> {
  return pb.collection('campaigns').getOne<Campaign>(id);
}

export async function createCampaign(pb: PocketBase, data: { name: string; description: string; user: string; kind?: CampaignKind }): Promise<Campaign> {
  // Create the campaign
  const campaign = await pb.collection('campaigns').create<Campaign>(data);

  // Auto-create "Uncategorized" funnel stage only for outreach campaigns
  if (!data.kind || data.kind === 'outreach') {
    await pb.collection('funnel_stages').create({
      name: 'Uncategorized',
      order: 0,
      color: 'gray',
      campaign: campaign.id,
    });
  }

  return campaign;
}

export async function updateCampaign(pb: PocketBase, id: string, data: Partial<Campaign>): Promise<Campaign> {
  return pb.collection('campaigns').update<Campaign>(id, data);
}

export async function deleteCampaign(pb: PocketBase, id: string): Promise<boolean> {
  return pb.collection('campaigns').delete(id);
}

// Company functions
export async function getCompanies(pb: PocketBase, campaignId: string): Promise<Company[]> {
  const result = await pb.collection('companies').getList<Company>(1, 500, {
    filter: pb.filter('campaign = {:campaignId}', { campaignId }),
    expand: 'created_by,batch',
  });
  return result.items;
}

export async function getCompaniesByBatch(pb: PocketBase, batchId: string): Promise<Company[]> {
  const result = await pb.collection('companies').getList<Company>(1, 500, {
    filter: pb.filter('batch = {:batchId}', { batchId }),
    expand: 'created_by,batch',
  });
  return result.items;
}

export async function getCompany(pb: PocketBase, id: string): Promise<Company> {
  return pb.collection('companies').getOne<Company>(id, {
    expand: 'created_by',
  });
}

export async function getContactsByCompany(pb: PocketBase, companyId: string): Promise<Contact[]> {
  const result = await pb.collection('contacts').getList<Contact>(1, 500, {
    filter: pb.filter('company = {:companyId}', { companyId }),
    expand: 'created_by',
  });
  return result.items;
}

// Get all outreach campaigns (for push-to-outreach dropdown)
export async function getOutreachCampaigns(pb: PocketBase, userId: string): Promise<Campaign[]> {
  const result = await pb.collection('campaigns').getList<Campaign>(1, 100, {
    filter: pb.filter('user = {:userId} && (kind = "outreach" || kind = "")', { userId }),
  });
  return result.items;
}

export async function createCompany(pb: PocketBase, data: {
  name: string;
  website: string;
  industry: string;
  campaign: string;
  email?: string;
  description?: string;
  batch?: string;
  created_by?: string;
  firecrawl_urls?: FirecrawlUrls;
  firecrawl_mapped_at?: string;
}): Promise<Company> {
  return pb.collection('companies').create<Company>(data);
}

export async function updateCompany(pb: PocketBase, id: string, data: Partial<Company>): Promise<Company> {
  return pb.collection('companies').update<Company>(id, data);
}

export async function deleteCompany(pb: PocketBase, id: string): Promise<boolean> {
  return pb.collection('companies').delete(id);
}

// Batch functions
// List batches via our API route: the route uses admin auth and filters by campaign in code.
// This avoids PocketBase 400s from client-side list + filter on the batches collection.
export async function getBatches(_pb: PocketBase, campaignId: string): Promise<Batch[]> {
  try {
    const base = typeof window !== "undefined" ? "" : process.env.NEXT_PUBLIC_APP_URL || "";
    const res = await fetch(`${base}/api/campaigns/${campaignId}/batches`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
      },
    });
    if (!res.ok) return [];
    const items = (await res.json()) as Batch[];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

export async function getBatch(pb: PocketBase, id: string): Promise<Batch> {
  return pb.collection('batches').getOne<Batch>(id);
}

export async function createBatch(pb: PocketBase, data: { name: string; campaign: string }): Promise<Batch> {
  return pb.collection('batches').create<Batch>(data);
}

export async function updateBatch(pb: PocketBase, id: string, data: { name: string }): Promise<Batch> {
  return pb.collection('batches').update<Batch>(id, data);
}

export async function deleteBatch(pb: PocketBase, id: string): Promise<boolean> {
  return pb.collection('batches').delete(id);
}

export async function getContactsByBatch(pb: PocketBase, batchId: string): Promise<Contact[]> {
  const result = await pb.collection('contacts').getList<Contact>(1, 500, {
    filter: pb.filter('batch = {:batchId}', { batchId }),
    expand: 'company,batch,created_by',
  });
  return result.items;
}

// Contact functions
export async function getContacts(pb: PocketBase, campaignId: string): Promise<Contact[]> {
  try {
    const result = await pb.collection('contacts').getList<Contact>(1, 500, {
      filter: pb.filter('campaign = {:campaignId}', { campaignId }),
      expand: 'company,batch,created_by,source_company',
    });
    return result.items;
  } catch (error) {
    // Fallback if the contacts collection doesn't have the batch relation yet.
    if (isClientResponseError(error) && error.status === 400) {
      const result = await pb.collection('contacts').getList<Contact>(1, 500, {
        filter: pb.filter('campaign = {:campaignId}', { campaignId }),
        expand: 'company,created_by,source_company',
      });
      return result.items;
    }
    throw error;
  }
}

export async function getContact(pb: PocketBase, id: string): Promise<Contact> {
  try {
    return await pb.collection('contacts').getOne<Contact>(id, {
      expand: 'company,batch,created_by',
    });
  } catch (error) {
    // Fallback if the contacts collection doesn't have the batch relation yet.
    if (isClientResponseError(error) && error.status === 400) {
      return await pb.collection('contacts').getOne<Contact>(id, {
        expand: 'company,created_by',
      });
    }
    throw error;
  }
}

export async function createContact(pb: PocketBase, data: {
  email: string;
  first_name: string;
  last_name: string;
  title: string;
  company?: string;
  batch?: string;
  campaign: string;
  created_by?: string;
}): Promise<Contact> {
  // Create the contact
  const contact = await pb.collection('contacts').create<Contact>(data);

  // Auto-assign to "Uncategorized" funnel stage
  try {
    const uncategorizedStage = await getOrCreateUncategorizedStage(pb, data.campaign);
    await pb.collection('contact_stages').create({
      contact: contact.id,
      stage: uncategorizedStage.id,
      moved_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Failed to assign contact to Uncategorized stage:', e);
  }

  return contact;
}

// Helper to get or create the "Uncategorized" stage for a campaign
export async function getOrCreateUncategorizedStage(pb: PocketBase, campaignId: string): Promise<FunnelStage> {
  try {
    // Try to find existing "Uncategorized" stage
    return await pb.collection('funnel_stages').getFirstListItem<FunnelStage>(
      pb.filter('campaign = {:campaignId} && name = {:name}', { campaignId, name: 'Uncategorized' })
    );
  } catch {
    // Create it if it doesn't exist
    return await pb.collection('funnel_stages').create<FunnelStage>({
      name: 'Uncategorized',
      order: 0,
      color: 'gray',
      campaign: campaignId,
    });
  }
}

export async function updateContact(pb: PocketBase, id: string, data: Partial<Contact>): Promise<Contact> {
  return pb.collection('contacts').update<Contact>(id, data);
}

export async function deleteContact(pb: PocketBase, id: string): Promise<boolean> {
  // First, delete related contact_stages (required relation blocks direct delete)
  try {
    const contactStages = await pb.collection('contact_stages').getList(1, 100, {
      filter: pb.filter('contact = {:contactId}', { contactId: id }),
    });
    for (const stage of contactStages.items) {
      await pb.collection('contact_stages').delete(stage.id);
    }
  } catch (e) {
    console.error('Failed to delete contact stages:', e);
  }

  // Delete related contact_field_values
  try {
    const fieldValues = await pb.collection('contact_field_values').getList(1, 100, {
      filter: pb.filter('contact = {:contactId}', { contactId: id }),
    });
    for (const value of fieldValues.items) {
      await pb.collection('contact_field_values').delete(value.id);
    }
  } catch (e) {
    console.error('Failed to delete contact field values:', e);
  }

  // Delete related email_sends
  try {
    const emailSends = await pb.collection('email_sends').getList(1, 100, {
      filter: pb.filter('contact = {:contactId}', { contactId: id }),
    });
    for (const send of emailSends.items) {
      await pb.collection('email_sends').delete(send.id);
    }
  } catch (e) {
    console.error('Failed to delete email sends:', e);
  }

  // Now delete the contact
  return pb.collection('contacts').delete(id);
}

export async function bulkCreateContacts(pb: PocketBase, contacts: Array<{
  email: string;
  first_name: string;
  last_name: string;
  title: string;
  company?: string;
  batch?: string;
  campaign: string;
  created_by?: string;
}>): Promise<Contact[]> {
  const results: Contact[] = [];

  // Group contacts by campaign to efficiently get uncategorized stages
  const campaignIds = Array.from(new Set(contacts.map(c => c.campaign)));
  const uncategorizedStages = new Map<string, FunnelStage>();

  for (const campaignId of campaignIds) {
    const stage = await getOrCreateUncategorizedStage(pb, campaignId);
    uncategorizedStages.set(campaignId, stage);
  }

  for (const contact of contacts) {
    const created = await pb.collection('contacts').create<Contact>(contact);
    results.push(created);

    // Auto-assign to "Uncategorized" stage
    const uncategorizedStage = uncategorizedStages.get(contact.campaign);
    if (uncategorizedStage) {
      try {
        await pb.collection('contact_stages').create({
          contact: created.id,
          stage: uncategorizedStage.id,
          moved_at: new Date().toISOString(),
        });
      } catch (e) {
        console.error('Failed to assign contact to Uncategorized stage:', e);
      }
    }
  }
  return results;
}

// Custom Field functions
export async function getCustomFields(pb: PocketBase, campaignId: string): Promise<CustomField[]> {
  const result = await pb.collection('custom_fields').getList<CustomField>(1, 100, {
    filter: pb.filter('campaign = {:campaignId}', { campaignId }),
  });
  return result.items;
}

export async function createCustomField(pb: PocketBase, data: {
  name: string;
  field_type: string;
  options?: string[];
  order: number;
  campaign: string;
}): Promise<CustomField> {
  return pb.collection('custom_fields').create<CustomField>(data);
}

export async function updateCustomField(pb: PocketBase, id: string, data: Partial<CustomField>): Promise<CustomField> {
  return pb.collection('custom_fields').update<CustomField>(id, data);
}

export async function deleteCustomField(pb: PocketBase, id: string): Promise<boolean> {
  return pb.collection('custom_fields').delete(id);
}

// Contact Field Value functions
export async function getContactFieldValues(pb: PocketBase, contactId: string): Promise<ContactFieldValue[]> {
  const result = await pb.collection('contact_field_values').getList<ContactFieldValue>(1, 500, {
    filter: pb.filter('contact = {:contactId}', { contactId }),
    expand: 'custom_field',
  });
  return result.items;
}

export async function getFieldValuesForContacts(pb: PocketBase, contactIds: string[]): Promise<ContactFieldValue[]> {
  if (contactIds.length === 0) return [];

  // Batch contacts to avoid URL length limits (max ~30 IDs per request)
  const BATCH_SIZE = 30;
  const allResults: ContactFieldValue[] = [];

  for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
    const batchIds = contactIds.slice(i, i + BATCH_SIZE);
    const filter = batchIds.map((id, idx) => `contact = {:id${idx}}`).join(' || ');
    const params = batchIds.reduce((acc, id, idx) => ({ ...acc, [`id${idx}`]: id }), {});

    const result = await pb.collection('contact_field_values').getList<ContactFieldValue>(1, 1000, {
      filter: pb.filter(filter, params),
      expand: 'custom_field',
    });
    allResults.push(...result.items);
  }

  return allResults;
}

export async function setContactFieldValue(pb: PocketBase, data: {
  contact: string;
  custom_field: string;
  value: string;
}): Promise<ContactFieldValue> {
  // Check if value already exists
  try {
    const existing = await pb.collection('contact_field_values').getFirstListItem<ContactFieldValue>(
      pb.filter('contact = {:contact} && custom_field = {:field}', { contact: data.contact, field: data.custom_field })
    );
    return pb.collection('contact_field_values').update<ContactFieldValue>(existing.id, { value: data.value });
  } catch {
    // Create new value
    return pb.collection('contact_field_values').create<ContactFieldValue>(data);
  }
}

// Email Template Group functions
export async function getEmailTemplateGroups(pb: PocketBase, campaignId: string): Promise<EmailTemplateGroup[]> {
  const result = await pb.collection('email_template_groups').getList<EmailTemplateGroup>(1, 100, {
    filter: pb.filter('campaign = {:campaignId}', { campaignId }),
  });
  return result.items;
}

export async function createEmailTemplateGroup(pb: PocketBase, data: {
  name: string;
  campaign: string;
}): Promise<EmailTemplateGroup> {
  return pb.collection('email_template_groups').create<EmailTemplateGroup>(data);
}

export async function deleteEmailTemplateGroup(pb: PocketBase, id: string): Promise<boolean> {
  return pb.collection('email_template_groups').delete(id);
}

// Email Template functions
export async function getEmailTemplates(pb: PocketBase, groupId: string): Promise<EmailTemplate[]> {
  const result = await pb.collection('email_templates').getList<EmailTemplate>(1, 100, {
    filter: pb.filter('group = {:groupId}', { groupId }),
  });
  return result.items;
}

export async function getEmailTemplatesForCampaign(pb: PocketBase, campaignId: string): Promise<EmailTemplate[]> {
  const result = await pb.collection('email_templates').getList<EmailTemplate>(1, 500, {
    filter: pb.filter('group.campaign = {:campaignId}', { campaignId }),
    expand: 'group',
  });
  return result.items;
}

export async function createEmailTemplate(pb: PocketBase, data: {
  subject: string;
  body: string;
  is_active: boolean;
  group: string;
}): Promise<EmailTemplate> {
  return pb.collection('email_templates').create<EmailTemplate>(data);
}

export async function updateEmailTemplate(pb: PocketBase, id: string, data: Partial<EmailTemplate>): Promise<EmailTemplate> {
  return pb.collection('email_templates').update<EmailTemplate>(id, data);
}

export async function deleteEmailTemplate(pb: PocketBase, id: string): Promise<boolean> {
  return pb.collection('email_templates').delete(id);
}

// Email Send functions
export async function getEmailSends(pb: PocketBase, campaignId: string): Promise<EmailSend[]> {
  const result = await pb.collection('email_sends').getList<EmailSend>(1, 500, {
    filter: pb.filter('campaign = {:campaignId}', { campaignId }),
    expand: 'contact,template',
  });
  return result.items;
}

export async function getEmailSendsForContact(pb: PocketBase, contactId: string): Promise<EmailSend[]> {
  const result = await pb.collection('email_sends').getList<EmailSend>(1, 500, {
    filter: pb.filter('contact = {:contactId}', { contactId }),
    expand: 'template',
  });
  return result.items;
}

export async function createEmailSend(pb: PocketBase, data: {
  contact: string;
  template: string;
  campaign: string;
  resend_id: string;
  status: string;
  sent_at: string;
}): Promise<EmailSend> {
  return pb.collection('email_sends').create<EmailSend>(data);
}

export async function updateEmailSend(pb: PocketBase, id: string, data: Partial<EmailSend>): Promise<EmailSend> {
  return pb.collection('email_sends').update<EmailSend>(id, data);
}

export async function getEmailSendByResendId(pb: PocketBase, resendId: string): Promise<EmailSend | null> {
  try {
    return await pb.collection('email_sends').getFirstListItem<EmailSend>(
      pb.filter('resend_id = {:resendId}', { resendId })
    );
  } catch {
    return null;
  }
}

// Funnel Stage functions
export async function getFunnelStages(pb: PocketBase, campaignId: string): Promise<FunnelStage[]> {
  const result = await pb.collection('funnel_stages').getList<FunnelStage>(1, 100, {
    filter: pb.filter('campaign = {:campaignId}', { campaignId }),
  });
  return result.items;
}

export async function createFunnelStage(pb: PocketBase, data: {
  name: string;
  order: number;
  color: string;
  campaign: string;
}): Promise<FunnelStage> {
  return pb.collection('funnel_stages').create<FunnelStage>(data);
}

export async function updateFunnelStage(pb: PocketBase, id: string, data: Partial<FunnelStage>): Promise<FunnelStage> {
  return pb.collection('funnel_stages').update<FunnelStage>(id, data);
}

export async function deleteFunnelStage(pb: PocketBase, id: string): Promise<boolean> {
  return pb.collection('funnel_stages').delete(id);
}

// Contact Stage functions
export async function getContactStages(pb: PocketBase, campaignId: string): Promise<ContactStage[]> {
  const result = await pb.collection('contact_stages').getList<ContactStage>(1, 500, {
    filter: pb.filter('stage.campaign = {:campaignId}', { campaignId }),
    expand: 'contact,stage',
  });
  return result.items;
}

export async function setContactStage(pb: PocketBase, contactId: string, stageId: string): Promise<ContactStage> {
  // Check if contact already has a stage
  try {
    const existing = await pb.collection('contact_stages').getFirstListItem<ContactStage>(
      pb.filter('contact = {:contactId}', { contactId })
    );
    return pb.collection('contact_stages').update<ContactStage>(existing.id, {
      stage: stageId,
      moved_at: new Date().toISOString(),
    });
  } catch {
    return pb.collection('contact_stages').create<ContactStage>({
      contact: contactId,
      stage: stageId,
      moved_at: new Date().toISOString(),
    });
  }
}

// Follow Up Sequence functions
export async function getFollowUpSequences(pb: PocketBase, campaignId: string): Promise<FollowUpSequence[]> {
  const result = await pb.collection('follow_up_sequences').getList<FollowUpSequence>(1, 100, {
    filter: pb.filter('campaign = {:campaignId}', { campaignId }),
  });
  return result.items;
}

export async function createFollowUpSequence(pb: PocketBase, data: {
  name: string;
  is_active: boolean;
  campaign: string;
}): Promise<FollowUpSequence> {
  return pb.collection('follow_up_sequences').create<FollowUpSequence>(data);
}

// Follow Up Step functions
export async function getFollowUpSteps(pb: PocketBase, sequenceId: string): Promise<FollowUpStep[]> {
  const result = await pb.collection('follow_up_steps').getList<FollowUpStep>(1, 100, {
    filter: pb.filter('sequence = {:sequenceId}', { sequenceId }),
    expand: 'template_group',
  });
  return result.items;
}

export async function createFollowUpStep(pb: PocketBase, data: {
  sequence: string;
  template_group: string;
  delay_days: number;
  order: number;
}): Promise<FollowUpStep> {
  return pb.collection('follow_up_steps').create<FollowUpStep>(data);
}

// AI Scoring Config functions
export async function getAIScoringConfigs(pb: PocketBase, campaignId: string): Promise<AIScoringConfig[]> {
  const result = await pb.collection('ai_scoring_configs').getList<AIScoringConfig>(1, 100, {
    filter: pb.filter('campaign = {:campaignId}', { campaignId }),
  });
  return result.items;
}

export async function getAIScoringConfig(pb: PocketBase, id: string): Promise<AIScoringConfig> {
  return pb.collection('ai_scoring_configs').getOne<AIScoringConfig>(id);
}

export async function createAIScoringConfig(pb: PocketBase, data: {
  campaign: string;
  name: string;
  system_prompt: string;
  enable_score: boolean;
  score_min?: number;
  score_max?: number;
  enable_classification: boolean;
  classification_label?: string;
  classification_options?: string[];
  custom_outputs?: CustomOutputField[];
  model?: string;
  temperature?: number;
}): Promise<AIScoringConfig> {
  return pb.collection('ai_scoring_configs').create<AIScoringConfig>(data);
}

export async function updateAIScoringConfig(pb: PocketBase, id: string, data: Partial<AIScoringConfig>): Promise<AIScoringConfig> {
  return pb.collection('ai_scoring_configs').update<AIScoringConfig>(id, data);
}

export async function deleteAIScoringConfig(pb: PocketBase, id: string): Promise<boolean> {
  return pb.collection('ai_scoring_configs').delete(id);
}

// Inbox Message functions
export async function createInboxMessage(pb: PocketBase, data: {
  from_email: string;
  subject?: string;
  body_text?: string;
  gmail_message_id?: string;
  gmail_thread_id?: string;
  contact?: string;
  campaign?: string;
  classification?: string;
  ai_summary?: string;
  action_taken?: string;
  processed_at?: string;
  received_at?: string;
}): Promise<InboxMessage> {
  return pb.collection('inbox_messages').create<InboxMessage>(data);
}

export async function getInboxMessages(pb: PocketBase, campaignId?: string): Promise<InboxMessage[]> {
  const filter = campaignId
    ? pb.filter('campaign = {:campaignId}', { campaignId })
    : '';
  const result = await pb.collection('inbox_messages').getList<InboxMessage>(1, 200, {
    filter,
    sort: '-received_at',
    expand: 'contact,campaign',
  });
  return result.items;
}

export async function getInboxMessageByGmailId(pb: PocketBase, gmailMessageId: string): Promise<InboxMessage | null> {
  try {
    return await pb.collection('inbox_messages').getFirstListItem<InboxMessage>(
      pb.filter('gmail_message_id = {:gmailMessageId}', { gmailMessageId })
    );
  } catch {
    return null;
  }
}

// Contact follow-up helpers
export async function getContactsDueForFollowUp(pb: PocketBase): Promise<Contact[]> {
  const now = new Date().toISOString();
  const result = await pb.collection('contacts').getList<Contact>(1, 200, {
    filter: pb.filter(
      'follow_up_date != "" && follow_up_date <= {:now} && follow_up_cancelled != true',
      { now }
    ),
    expand: 'company,campaign,follow_up_template',
  });
  return result.items;
}

export async function setContactFollowUp(pb: PocketBase, contactId: string, data: {
  follow_up_date?: string;
  follow_up_template?: string;
  follow_up_cancelled?: boolean;
}): Promise<Contact> {
  return pb.collection('contacts').update<Contact>(contactId, data);
}

export async function cancelContactFollowUp(pb: PocketBase, contactId: string): Promise<Contact> {
  return pb.collection('contacts').update<Contact>(contactId, {
    follow_up_cancelled: true,
    follow_up_date: '',
  });
}

// Find contact by email across all outreach campaigns (case-insensitive)
export async function findContactByEmail(pb: PocketBase, email: string): Promise<Contact | null> {
  const normalizedEmail = email.toLowerCase().trim();
  console.log(`findContactByEmail: searching for "${normalizedEmail}"`);

  try {
    // Try exact match first using getList (doesn't throw on empty results)
    const exactResult = await pb.collection('contacts').getList<Contact>(1, 1, {
      filter: pb.filter('email = {:email}', { email: normalizedEmail }),
      expand: 'company,campaign',
      sort: '-created',
    });

    if (exactResult.items.length > 0) {
      console.log(`findContactByEmail: found exact match — contact ${exactResult.items[0].id} (${exactResult.items[0].email})`);
      return exactResult.items[0];
    }

    console.log(`findContactByEmail: no exact match, trying case-insensitive search...`);

    // Fallback: case-insensitive search using ~ operator
    const fuzzyResult = await pb.collection('contacts').getList<Contact>(1, 1, {
      filter: pb.filter('email ~ {:email}', { email: normalizedEmail }),
      expand: 'company,campaign',
      sort: '-created',
    });

    if (fuzzyResult.items.length > 0) {
      console.log(`findContactByEmail: found fuzzy match — contact ${fuzzyResult.items[0].id} (${fuzzyResult.items[0].email})`);
      return fuzzyResult.items[0];
    }

    console.log(`findContactByEmail: no contact found for "${normalizedEmail}"`);
    return null;
  } catch (error) {
    console.error(`findContactByEmail: error searching for "${normalizedEmail}":`, error);
    return null;
  }
}

// Get the most recent email send for a contact (for threading)
export async function getLatestEmailSendForContact(pb: PocketBase, contactId: string): Promise<EmailSend | null> {
  try {
    return await pb.collection('email_sends').getFirstListItem<EmailSend>(
      pb.filter('contact = {:contactId}', { contactId }),
      { sort: '-sent_at', expand: 'template' }
    );
  } catch {
    return null;
  }
}

// Check if a contact has already been marked as replied
export async function hasContactReplied(pb: PocketBase, contactId: string): Promise<boolean> {
  try {
    const result = await pb.collection('email_sends').getList(1, 1, {
      filter: pb.filter('contact = {:contactId} && status = "replied"', { contactId }),
    });
    return result.items.length > 0;
  } catch {
    return false;
  }
}

// Mark all email sends for a contact as replied
export async function markContactEmailsAsReplied(pb: PocketBase, contactId: string): Promise<void> {
  const result = await pb.collection('email_sends').getList<EmailSend>(1, 100, {
    filter: pb.filter('contact = {:contactId} && status != "replied" && status != "bounced" && status != "failed"', { contactId }),
  });

  for (const send of result.items) {
    await pb.collection('email_sends').update(send.id, { status: 'replied' });
  }
}

// Get or set an app setting value
export async function getAppSetting(pb: PocketBase, key: string): Promise<Record<string, unknown> | null> {
  try {
    const setting = await pb.collection('app_settings').getFirstListItem(
      pb.filter('key = {:key}', { key })
    );
    return setting.value as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function setAppSetting(pb: PocketBase, key: string, value: Record<string, unknown>): Promise<void> {
  try {
    const existing = await pb.collection('app_settings').getFirstListItem(
      pb.filter('key = {:key}', { key })
    );
    await pb.collection('app_settings').update(existing.id, { value });
  } catch {
    await pb.collection('app_settings').create({ key, value });
  }
}

// Push company to outreach (creates contacts from lead company)
export async function pushCompanyToOutreach(
  pb: PocketBase,
  leadCompanyId: string,
  outreachCampaignId: string,
  funnelStageId?: string,
  batchId?: string
): Promise<Contact[]> {
  // Get the lead company with its contacts (people)
  const leadCompany = await pb.collection('companies').getOne<Company>(leadCompanyId, {
    expand: 'contacts_via_company',
  });

  // Get people under this company (contacts in the leads campaign)
  const leadContacts = await pb.collection('contacts').getList<Contact>(1, 500, {
    filter: pb.filter('company = {:companyId}', { companyId: leadCompanyId }),
  });

  const createdContacts: Contact[] = [];

  if (leadContacts.items.length > 0) {
    // Push each person as a contact in the outreach campaign
    for (const leadContact of leadContacts.items) {
      // Check if contact already exists in outreach campaign
      const existing = await pb.collection('contacts').getList(1, 1, {
        filter: pb.filter('campaign = {:campaignId} && email = {:email}', {
          campaignId: outreachCampaignId,
          email: leadContact.email,
        }),
      });

      if (existing.items.length === 0) {
        const outreachContact = await pb.collection('contacts').create<Contact>({
          campaign: outreachCampaignId,
          company: '', // No company in outreach
          email: leadContact.email,
          first_name: leadContact.first_name,
          last_name: leadContact.last_name,
          title: leadContact.title,
          source_company: leadCompanyId,
          source_contact: leadContact.id,
          batch: batchId || undefined,
        });
        createdContacts.push(outreachContact);

        // Set funnel stage if provided
        if (funnelStageId) {
          await setContactStage(pb, outreachContact.id, funnelStageId);
        }
      }
    }
  } else {
    // No people under company - create a company-level contact if email exists
    if (leadCompany.email) {
      const existing = await pb.collection('contacts').getList(1, 1, {
        filter: pb.filter('campaign = {:campaignId} && email = {:email}', {
          campaignId: outreachCampaignId,
          email: leadCompany.email,
        }),
      });

      if (existing.items.length === 0) {
        const outreachContact = await pb.collection('contacts').create<Contact>({
          campaign: outreachCampaignId,
          company: '',
          email: leadCompany.email,
          first_name: leadCompany.name,
          last_name: '',
          title: '',
          source_company: leadCompanyId,
          batch: batchId || undefined,
        });
        createdContacts.push(outreachContact);

        // Set funnel stage if provided
        if (funnelStageId) {
          await setContactStage(pb, outreachContact.id, funnelStageId);
        }
      }
    }
  }

  // Track which campaigns this company has been pushed to
  if (createdContacts.length > 0) {
    const existingPushedTo = leadCompany.pushed_to_campaigns || [];
    if (!existingPushedTo.includes(outreachCampaignId)) {
      await pb.collection('companies').update(leadCompanyId, {
        pushed_to_campaigns: [...existingPushedTo, outreachCampaignId],
      });
    }
  }

  return createdContacts;
}
