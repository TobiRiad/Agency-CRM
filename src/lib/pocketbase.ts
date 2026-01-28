import PocketBase from 'pocketbase';
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
} from '@/types';

const POCKETBASE_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://localhost:8090';

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

export async function createCampaign(pb: PocketBase, data: { name: string; description: string; user: string }): Promise<Campaign> {
  // Create the campaign
  const campaign = await pb.collection('campaigns').create<Campaign>(data);
  
  // Auto-create "Uncategorized" funnel stage for this campaign
  await pb.collection('funnel_stages').create({
    name: 'Uncategorized',
    order: 0,
    color: 'gray',
    campaign: campaign.id,
  });
  
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
    expand: 'created_by',
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
  });
  return result.items;
}

export async function createCompany(pb: PocketBase, data: { name: string; website: string; industry: string; campaign: string; created_by?: string }): Promise<Company> {
  return pb.collection('companies').create<Company>(data);
}

export async function updateCompany(pb: PocketBase, id: string, data: Partial<Company>): Promise<Company> {
  return pb.collection('companies').update<Company>(id, data);
}

export async function deleteCompany(pb: PocketBase, id: string): Promise<boolean> {
  return pb.collection('companies').delete(id);
}

// Batch functions
export async function getBatches(pb: PocketBase, campaignId: string): Promise<Batch[]> {
  const result = await pb.collection('batches').getList<Batch>(1, 500, {
    filter: pb.filter('campaign = {:campaignId}', { campaignId }),
    sort: '-created',
  });
  return result.items;
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
  const result = await pb.collection('contacts').getList<Contact>(1, 500, {
    filter: pb.filter('campaign = {:campaignId}', { campaignId }),
    expand: 'company,batch,created_by',
  });
  return result.items;
}

export async function getContact(pb: PocketBase, id: string): Promise<Contact> {
  return pb.collection('contacts').getOne<Contact>(id, {
    expand: 'company,batch,created_by',
  });
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
  const campaignIds = [...new Set(contacts.map(c => c.campaign))];
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
  // Build filter for multiple contacts
  const filter = contactIds.map((id, i) => `contact = {:id${i}}`).join(' || ');
  const params = contactIds.reduce((acc, id, i) => ({ ...acc, [`id${i}`]: id }), {});
  const result = await pb.collection('contact_field_values').getList<ContactFieldValue>(1, 1000, {
    filter: pb.filter(filter, params),
    expand: 'custom_field',
  });
  return result.items;
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
