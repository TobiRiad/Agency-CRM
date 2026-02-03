// PocketBase Record Types
export interface BaseRecord {
  id: string;
  created: string;
  updated: string;
  collectionId: string;
  collectionName: string;
}

export type UserRole = 'admin' | 'team';

export interface User extends BaseRecord {
  email: string;
  name: string;
  avatar?: string;
  role?: UserRole;
}

export interface Invite extends BaseRecord {
  email: string;
  token: string;
  used: boolean;
  used_at?: string;
  used_by?: string;
  expires_at?: string;
  created_by?: string;
  // Expanded relations
  expand?: {
    used_by?: User;
    created_by?: User;
  };
}

export type EmailProvider = 'resend' | 'gmail';

export interface AppSetting extends BaseRecord {
  key: string;
  value: Record<string, unknown>;
}

export type IndustryType = 'text' | 'dropdown';
export type CampaignKind = 'leads' | 'outreach';

// Firecrawl page types that can be scraped
export type FirecrawlPageType = 'homepage' | 'about' | 'pricing' | 'careers' | 'blog' | 'products' | 'services' | 'contact';

export interface Campaign extends BaseRecord {
  user: string;
  name: string;
  description: string;
  kind?: CampaignKind; // 'leads' or 'outreach'
  industry_type: IndustryType;
  industry_options: string[]; // For dropdown type
  ai_opener_prompt?: string; // System prompt for generating AI openers (outreach campaigns)
  // Firecrawl settings (for leads campaigns)
  enable_firecrawl?: boolean; // Enable website scraping
  firecrawl_pages?: FirecrawlPageType[]; // Which pages to scrape
  // Expanded relations
  expand?: {
    user?: User;
  };
}

// Firecrawl discovered URLs for a company
export interface FirecrawlUrls {
  homepage?: string;
  about?: string;
  pricing?: string;
  careers?: string;
  blog?: string;
  products?: string;
  services?: string;
  contact?: string;
}

// Cached scraped content from Firecrawl
export interface FirecrawlContent {
  homepage?: string;
  about?: string;
  pricing?: string;
  careers?: string;
  blog?: string;
  products?: string;
  services?: string;
  contact?: string;
}

export interface Company extends BaseRecord {
  campaign: string;
  name: string;
  website: string;
  industry: string;
  email?: string; // For lead companies
  description?: string; // For lead companies
  batch?: string; // For organizing lead companies into batches
  created_by?: string;
  // AI scoring fields (for lead companies)
  ai_score?: number;
  ai_classification?: string;
  ai_confidence?: number;
  ai_reasons?: string[];
  ai_scored_at?: string;
  ai_config_version?: string;
  ai_data?: Record<string, unknown>; // Full AI response JSON
  // Firecrawl fields (for website scraping)
  firecrawl_urls?: FirecrawlUrls; // Discovered URLs for each page type
  firecrawl_content?: FirecrawlContent; // Cached scraped content
  firecrawl_mapped_at?: string; // When URLs were discovered
  firecrawl_scraped_at?: string; // When content was last scraped
  // Custom output fields (dynamically added based on AI config)
  [key: `ai_custom_${string}`]: unknown; // e.g., ai_custom_industry_fit, ai_custom_tags, etc.
  // Expanded relations
  expand?: {
    campaign?: Campaign;
    batch?: Batch;
    created_by?: User;
    contacts_via_company?: Contact[]; // People under this company (for leads)
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
  // Source tracking (for contacts pushed from leads to outreach)
  source_company?: string; // Lead company this came from
  source_contact?: string; // Lead contact this came from
  ai_opener?: string; // AI-generated opener (for outreach campaigns)
  // Expanded relations
  expand?: {
    company?: Company;
    campaign?: Campaign;
    batch?: Batch;
    created_by?: User;
    source_company?: Company;
    source_contact?: Contact;
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

export type CustomOutputType = 'text' | 'number' | 'boolean' | 'list' | 'nested_json';

export interface CustomOutputField {
  id: string; // Unique ID for this custom output
  name: string; // Field name (e.g., "industry_fit")
  label: string; // Display label
  description: string; // Description for AI on what to return
  type: CustomOutputType;
  // For 'list' type
  list_options?: string[]; // Options to choose from
  list_description?: string; // How to pick from the list
  // For 'nested_json' type
  nested_json_max_pairs?: number; // Max key-value pairs
  nested_json_description?: string; // What the JSON should contain
  // For 'boolean' type
  boolean_options?: ('true' | 'false' | 'unknown')[]; // Default: ['true', 'false', 'unknown']
}

export interface AIScoringConfig extends BaseRecord {
  campaign: string;
  name: string;
  system_prompt: string;
  enable_score: boolean;
  score_min?: number;
  score_max?: number;
  enable_classification: boolean;
  classification_label?: string;
  classification_options?: string[];
  custom_outputs?: CustomOutputField[]; // Custom output fields
  model?: string;
  temperature?: number;
  // Expanded relations
  expand?: {
    campaign?: Campaign;
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
