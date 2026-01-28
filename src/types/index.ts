// PocketBase Record Types
export interface BaseRecord {
  id: string;
  created: string;
  updated: string;
  collectionId: string;
  collectionName: string;
}

export interface User extends BaseRecord {
  email: string;
  name: string;
  avatar?: string;
}

export type IndustryType = 'text' | 'dropdown';

export interface Campaign extends BaseRecord {
  user: string;
  name: string;
  description: string;
  industry_type: IndustryType;
  industry_options: string[]; // For dropdown type
  // Expanded relations
  expand?: {
    user?: User;
  };
}

export interface Company extends BaseRecord {
  campaign: string;
  name: string;
  website: string;
  industry: string;
  created_by?: string;
  // Expanded relations
  expand?: {
    campaign?: Campaign;
    created_by?: User;
  };
}

export interface Batch extends BaseRecord {
  campaign: string;
  name: string;
  // Expanded relations
  expand?: {
    campaign?: Campaign;
  };
}

export interface Contact extends BaseRecord {
  company: string;
  campaign: string;
  batch?: string;
  email: string;
  first_name: string;
  last_name: string;
  title: string;
  created_by?: string;
  // Expanded relations
  expand?: {
    company?: Company;
    campaign?: Campaign;
    batch?: Batch;
    created_by?: User;
    contact_field_values_via_contact?: ContactFieldValue[];
  };
}

export type CustomFieldType = 'text' | 'number' | 'boolean' | 'select';

export interface CustomField extends BaseRecord {
  campaign: string;
  name: string;
  field_type: CustomFieldType;
  options: string[]; // For select type
  order: number;
  // Expanded relations
  expand?: {
    campaign?: Campaign;
  };
}

export interface ContactFieldValue extends BaseRecord {
  contact: string;
  custom_field: string;
  value: string;
  // Expanded relations
  expand?: {
    contact?: Contact;
    custom_field?: CustomField;
  };
}

export interface EmailTemplateGroup extends BaseRecord {
  campaign: string;
  name: string;
  // Expanded relations
  expand?: {
    campaign?: Campaign;
    email_templates_via_group?: EmailTemplate[];
  };
}

export interface EmailTemplate extends BaseRecord {
  group: string;
  subject: string;
  body: string;
  is_active: boolean;
  // Expanded relations
  expand?: {
    group?: EmailTemplateGroup;
  };
}

export type EmailStatus = 'pending' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed';

export interface EmailSend extends BaseRecord {
  contact: string;
  template: string;
  campaign: string;
  resend_id: string;
  status: EmailStatus;
  sent_at: string;
  delivered_at?: string;
  opened_at?: string;
  clicked_at?: string;
  bounced_at?: string;
  error_message?: string;
  // Expanded relations
  expand?: {
    contact?: Contact;
    template?: EmailTemplate;
    campaign?: Campaign;
  };
}

export interface FunnelStage extends BaseRecord {
  campaign: string;
  name: string;
  order: number;
  color: string;
  // Expanded relations
  expand?: {
    campaign?: Campaign;
  };
}

export interface ContactStage extends BaseRecord {
  contact: string;
  stage: string;
  moved_at: string;
  // Expanded relations
  expand?: {
    contact?: Contact;
    stage?: FunnelStage;
  };
}

export interface FollowUpSequence extends BaseRecord {
  campaign: string;
  name: string;
  is_active: boolean;
  // Expanded relations
  expand?: {
    campaign?: Campaign;
    follow_up_steps_via_sequence?: FollowUpStep[];
  };
}

export interface FollowUpStep extends BaseRecord {
  sequence: string;
  template_group: string;
  delay_days: number;
  order: number;
  // Expanded relations
  expand?: {
    sequence?: FollowUpSequence;
    template_group?: EmailTemplateGroup;
  };
}

// Dashboard metrics types
export interface CampaignMetrics {
  total_contacts: number;
  total_companies: number;
  emails_sent: number;
  emails_delivered: number;
  emails_opened: number;
  emails_clicked: number;
  emails_bounced: number;
  open_rate: number;
  click_rate: number;
  bounce_rate: number;
}

export interface TemplateMetrics {
  template_id: string;
  subject: string;
  sent: number;
  opened: number;
  clicked: number;
  bounced: number;
  open_rate: number;
  click_rate: number;
}

export interface DailyMetrics {
  date: string;
  sent: number;
  opened: number;
  clicked: number;
  bounced: number;
}

export interface FunnelMetrics {
  stage_id: string;
  stage_name: string;
  count: number;
  color: string;
}

// CSV Import types
export interface CSVColumn {
  index: number;
  header: string;
  sampleValues: string[];
}

export interface ColumnMapping {
  csvColumn: string;
  targetField: string | null;
  isCustomField: boolean;
  customFieldId?: string;
  createNewField?: boolean;
  newFieldType?: CustomFieldType;
}

// Form types
export interface CampaignFormData {
  name: string;
  description: string;
}

export interface ContactFormData {
  email: string;
  first_name: string;
  last_name: string;
  title: string;
  company: string;
  customFields: Record<string, string>;
}

export interface CompanyFormData {
  name: string;
  website: string;
  industry: string;
}

export interface EmailTemplateFormData {
  subject: string;
  body: string;
  is_active: boolean;
}

export interface CustomFieldFormData {
  name: string;
  field_type: CustomFieldType;
  options: string[];
}
