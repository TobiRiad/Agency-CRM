/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  // 1. Create campaigns collection
  const campaigns = new Collection({
    name: "campaigns",
    type: "base",
    listRule: '@request.auth.id != "" && user = @request.auth.id',
    viewRule: '@request.auth.id != "" && user = @request.auth.id',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != "" && user = @request.auth.id',
    deleteRule: '@request.auth.id != "" && user = @request.auth.id',
  });
  campaigns.fields.add(new Field({
    name: "user",
    type: "relation",
    required: true,
    options: {
      collectionId: "_pb_users_auth_",
      cascadeDelete: false,
      maxSelect: 1,
    }
  }));
  campaigns.fields.add(new Field({
    name: "name",
    type: "text",
    required: true,
    options: { min: 1, max: 200 }
  }));
  campaigns.fields.add(new Field({
    name: "description",
    type: "text",
    required: false,
    options: { max: 2000 }
  }));
  app.save(campaigns);

  // 2. Create companies collection
  const companies = new Collection({
    name: "companies",
    type: "base",
    listRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    viewRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    deleteRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
  });
  companies.fields.add(new Field({
    name: "campaign",
    type: "relation",
    required: true,
    options: {
      collectionId: campaigns.id,
      cascadeDelete: true,
      maxSelect: 1,
    }
  }));
  companies.fields.add(new Field({
    name: "name",
    type: "text",
    required: true,
    options: { min: 1, max: 200 }
  }));
  companies.fields.add(new Field({
    name: "website",
    type: "url",
    required: false,
  }));
  companies.fields.add(new Field({
    name: "industry",
    type: "text",
    required: false,
    options: { max: 100 }
  }));
  app.save(companies);

  // 3. Create contacts collection
  const contacts = new Collection({
    name: "contacts",
    type: "base",
    listRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    viewRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    deleteRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
  });
  contacts.fields.add(new Field({
    name: "campaign",
    type: "relation",
    required: true,
    options: {
      collectionId: campaigns.id,
      cascadeDelete: true,
      maxSelect: 1,
    }
  }));
  contacts.fields.add(new Field({
    name: "company",
    type: "relation",
    required: false,
    options: {
      collectionId: companies.id,
      cascadeDelete: false,
      maxSelect: 1,
    }
  }));
  contacts.fields.add(new Field({
    name: "email",
    type: "email",
    required: true,
  }));
  contacts.fields.add(new Field({
    name: "first_name",
    type: "text",
    required: false,
    options: { max: 100 }
  }));
  contacts.fields.add(new Field({
    name: "last_name",
    type: "text",
    required: false,
    options: { max: 100 }
  }));
  contacts.fields.add(new Field({
    name: "title",
    type: "text",
    required: false,
    options: { max: 100 }
  }));
  app.save(contacts);

  // 4. Create custom_fields collection
  const customFields = new Collection({
    name: "custom_fields",
    type: "base",
    listRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    viewRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    deleteRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
  });
  customFields.fields.add(new Field({
    name: "campaign",
    type: "relation",
    required: true,
    options: {
      collectionId: campaigns.id,
      cascadeDelete: true,
      maxSelect: 1,
    }
  }));
  customFields.fields.add(new Field({
    name: "name",
    type: "text",
    required: true,
    options: { min: 1, max: 100 }
  }));
  customFields.fields.add(new Field({
    name: "field_type",
    type: "select",
    required: true,
    options: {
      maxSelect: 1,
      values: ["text", "number", "boolean", "select"]
    }
  }));
  customFields.fields.add(new Field({
    name: "options",
    type: "json",
    required: false,
  }));
  customFields.fields.add(new Field({
    name: "order",
    type: "number",
    required: false,
    options: { min: 0, noDecimal: true }
  }));
  app.save(customFields);

  // 5. Create contact_field_values collection
  const contactFieldValues = new Collection({
    name: "contact_field_values",
    type: "base",
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != ""',
    deleteRule: '@request.auth.id != ""',
  });
  contactFieldValues.fields.add(new Field({
    name: "contact",
    type: "relation",
    required: true,
    options: {
      collectionId: contacts.id,
      cascadeDelete: true,
      maxSelect: 1,
    }
  }));
  contactFieldValues.fields.add(new Field({
    name: "custom_field",
    type: "relation",
    required: true,
    options: {
      collectionId: customFields.id,
      cascadeDelete: true,
      maxSelect: 1,
    }
  }));
  contactFieldValues.fields.add(new Field({
    name: "value",
    type: "text",
    required: false,
    options: { max: 5000 }
  }));
  app.save(contactFieldValues);

  // 6. Create email_template_groups collection
  const emailTemplateGroups = new Collection({
    name: "email_template_groups",
    type: "base",
    listRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    viewRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    deleteRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
  });
  emailTemplateGroups.fields.add(new Field({
    name: "campaign",
    type: "relation",
    required: true,
    options: {
      collectionId: campaigns.id,
      cascadeDelete: true,
      maxSelect: 1,
    }
  }));
  emailTemplateGroups.fields.add(new Field({
    name: "name",
    type: "text",
    required: true,
    options: { min: 1, max: 200 }
  }));
  app.save(emailTemplateGroups);

  // 7. Create email_templates collection
  const emailTemplates = new Collection({
    name: "email_templates",
    type: "base",
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != ""',
    deleteRule: '@request.auth.id != ""',
  });
  emailTemplates.fields.add(new Field({
    name: "group",
    type: "relation",
    required: true,
    options: {
      collectionId: emailTemplateGroups.id,
      cascadeDelete: true,
      maxSelect: 1,
    }
  }));
  emailTemplates.fields.add(new Field({
    name: "subject",
    type: "text",
    required: true,
    options: { min: 1, max: 500 }
  }));
  emailTemplates.fields.add(new Field({
    name: "body",
    type: "text",
    required: true,
    options: { min: 1, max: 50000 }
  }));
  emailTemplates.fields.add(new Field({
    name: "is_active",
    type: "bool",
    required: false,
  }));
  app.save(emailTemplates);

  // 8. Create email_sends collection
  const emailSends = new Collection({
    name: "email_sends",
    type: "base",
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != ""',
    deleteRule: '@request.auth.id != ""',
  });
  emailSends.fields.add(new Field({
    name: "contact",
    type: "relation",
    required: true,
    options: {
      collectionId: contacts.id,
      cascadeDelete: false,
      maxSelect: 1,
    }
  }));
  emailSends.fields.add(new Field({
    name: "template",
    type: "relation",
    required: true,
    options: {
      collectionId: emailTemplates.id,
      cascadeDelete: false,
      maxSelect: 1,
    }
  }));
  emailSends.fields.add(new Field({
    name: "campaign",
    type: "relation",
    required: true,
    options: {
      collectionId: campaigns.id,
      cascadeDelete: false,
      maxSelect: 1,
    }
  }));
  emailSends.fields.add(new Field({
    name: "resend_id",
    type: "text",
    required: false,
    options: { max: 100 }
  }));
  emailSends.fields.add(new Field({
    name: "status",
    type: "select",
    required: true,
    options: {
      maxSelect: 1,
      values: ["pending", "sent", "delivered", "opened", "clicked", "bounced", "failed"]
    }
  }));
  emailSends.fields.add(new Field({
    name: "sent_at",
    type: "date",
    required: false,
  }));
  emailSends.fields.add(new Field({
    name: "delivered_at",
    type: "date",
    required: false,
  }));
  emailSends.fields.add(new Field({
    name: "opened_at",
    type: "date",
    required: false,
  }));
  emailSends.fields.add(new Field({
    name: "clicked_at",
    type: "date",
    required: false,
  }));
  emailSends.fields.add(new Field({
    name: "bounced_at",
    type: "date",
    required: false,
  }));
  emailSends.fields.add(new Field({
    name: "error_message",
    type: "text",
    required: false,
    options: { max: 1000 }
  }));
  app.save(emailSends);

  // 9. Create funnel_stages collection
  const funnelStages = new Collection({
    name: "funnel_stages",
    type: "base",
    listRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    viewRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    deleteRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
  });
  funnelStages.fields.add(new Field({
    name: "campaign",
    type: "relation",
    required: true,
    options: {
      collectionId: campaigns.id,
      cascadeDelete: true,
      maxSelect: 1,
    }
  }));
  funnelStages.fields.add(new Field({
    name: "name",
    type: "text",
    required: true,
    options: { min: 1, max: 100 }
  }));
  funnelStages.fields.add(new Field({
    name: "order",
    type: "number",
    required: false,
    options: { min: 0, noDecimal: true }
  }));
  funnelStages.fields.add(new Field({
    name: "color",
    type: "text",
    required: false,
    options: { max: 20 }
  }));
  app.save(funnelStages);

  // 10. Create contact_stages collection
  const contactStages = new Collection({
    name: "contact_stages",
    type: "base",
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != ""',
    deleteRule: '@request.auth.id != ""',
  });
  contactStages.fields.add(new Field({
    name: "contact",
    type: "relation",
    required: true,
    options: {
      collectionId: contacts.id,
      cascadeDelete: true,
      maxSelect: 1,
    }
  }));
  contactStages.fields.add(new Field({
    name: "stage",
    type: "relation",
    required: true,
    options: {
      collectionId: funnelStages.id,
      cascadeDelete: true,
      maxSelect: 1,
    }
  }));
  contactStages.fields.add(new Field({
    name: "moved_at",
    type: "date",
    required: false,
  }));
  app.save(contactStages);

  // 11. Create follow_up_sequences collection
  const followUpSequences = new Collection({
    name: "follow_up_sequences",
    type: "base",
    listRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    viewRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    deleteRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
  });
  followUpSequences.fields.add(new Field({
    name: "campaign",
    type: "relation",
    required: true,
    options: {
      collectionId: campaigns.id,
      cascadeDelete: true,
      maxSelect: 1,
    }
  }));
  followUpSequences.fields.add(new Field({
    name: "name",
    type: "text",
    required: true,
    options: { min: 1, max: 200 }
  }));
  followUpSequences.fields.add(new Field({
    name: "is_active",
    type: "bool",
    required: false,
  }));
  app.save(followUpSequences);

  // 12. Create follow_up_steps collection
  const followUpSteps = new Collection({
    name: "follow_up_steps",
    type: "base",
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != ""',
    deleteRule: '@request.auth.id != ""',
  });
  followUpSteps.fields.add(new Field({
    name: "sequence",
    type: "relation",
    required: true,
    options: {
      collectionId: followUpSequences.id,
      cascadeDelete: true,
      maxSelect: 1,
    }
  }));
  followUpSteps.fields.add(new Field({
    name: "template_group",
    type: "relation",
    required: true,
    options: {
      collectionId: emailTemplateGroups.id,
      cascadeDelete: false,
      maxSelect: 1,
    }
  }));
  followUpSteps.fields.add(new Field({
    name: "delay_days",
    type: "number",
    required: true,
    options: { min: 1, max: 365, noDecimal: true }
  }));
  followUpSteps.fields.add(new Field({
    name: "order",
    type: "number",
    required: false,
    options: { min: 0, noDecimal: true }
  }));
  app.save(followUpSteps);

}, (app) => {
  // Revert - delete collections in reverse order
  const collections = [
    "follow_up_steps",
    "follow_up_sequences", 
    "contact_stages",
    "funnel_stages",
    "email_sends",
    "email_templates",
    "email_template_groups",
    "contact_field_values",
    "custom_fields",
    "contacts",
    "companies",
    "campaigns"
  ];
  
  for (const name of collections) {
    const col = app.findCollectionByNameOrId(name);
    if (col) {
      app.delete(col);
    }
  }
});
