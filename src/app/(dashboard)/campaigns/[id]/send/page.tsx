"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  getClientPB,
  getCampaign,
  getContacts,
  getEmailTemplateGroups,
  getEmailTemplates,
  getCustomFields,
  getFieldValuesForContacts,
  getFunnelStages,
  getContactStages,
  getBatches,
} from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/components/ui/use-toast";
import {
  ArrowLeft,
  Send,
  Check,
  AlertCircle,
  Mail,
  Layers,
} from "lucide-react";
import type {
  Campaign,
  Contact,
  EmailTemplateGroup,
  EmailTemplate,
  CustomField,
  ContactFieldValue,
  FunnelStage,
  ContactStage,
  EmailProvider,
  AppSetting,
  Batch,
} from "@/types";
import { interpolateTemplate } from "@/lib/utils";

type SendStep = "select" | "sending" | "complete";

export default function SendEmailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const campaignId = params.id as string;
  const preselectedContacts = searchParams.get("contacts")?.split(",").filter(Boolean) || [];

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [templateGroups, setTemplateGroups] = useState<EmailTemplateGroup[]>([]);
  const [templates, setTemplates] = useState<Map<string, EmailTemplate[]>>(new Map());
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [fieldValues, setFieldValues] = useState<Map<string, Map<string, string>>>(new Map());
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);
  const [contactStageMap, setContactStageMap] = useState<Map<string, string>>(new Map());
  const [batches, setBatches] = useState<Batch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Selection state
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(
    new Set(preselectedContacts)
  );
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [fromEmail, setFromEmail] = useState("noreply@yourdomain.com");
  const [replyTo, setReplyTo] = useState("");

  // Provider settings (global)
  const [emailProvider, setEmailProvider] = useState<EmailProvider>("resend");
  const [configuredGmailEmail, setConfiguredGmailEmail] = useState<string>("");

  // Send state
  const [step, setStep] = useState<SendStep>("select");
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0 });
  const [sendResults, setSendResults] = useState({
    success: 0,
    failed: 0,
    errors: [] as string[],
  });

  const loadData = useCallback(async () => {
    try {
      const pb = getClientPB();
      const [campaignData, contactsData, groupsData, fieldsData, stagesData, contactStagesData, batchesData] = await Promise.all([
        getCampaign(pb, campaignId),
        getContacts(pb, campaignId),
        getEmailTemplateGroups(pb, campaignId),
        getCustomFields(pb, campaignId),
        getFunnelStages(pb, campaignId),
        getContactStages(pb, campaignId),
        getBatches(pb, campaignId),
      ]);

      setCampaign(campaignData);
      setBatches(batchesData);
      
      // If there are preselected contacts, filter to only show those
      let filteredContacts = contactsData;
      if (preselectedContacts.length > 0) {
        filteredContacts = contactsData.filter(c => preselectedContacts.includes(c.id));
      }
      setContacts(filteredContacts);
      
      setTemplateGroups(groupsData);
      setCustomFields(fieldsData);
      setFunnelStages(stagesData.sort((a, b) => a.order - b.order));

      // Create contact -> stage mapping
      const stageMap = new Map<string, string>();
      contactStagesData.forEach((cs: ContactStage) => {
        stageMap.set(cs.contact, cs.stage);
      });
      setContactStageMap(stageMap);

      // Load templates for each group
      const templatesMap = new Map<string, EmailTemplate[]>();
      for (const group of groupsData) {
        const groupTemplates = await getEmailTemplates(pb, group.id);
        templatesMap.set(group.id, groupTemplates.filter(t => t.is_active));
      }
      setTemplates(templatesMap);

      // Load field values
      if (filteredContacts.length > 0) {
        const contactIds = filteredContacts.map((c) => c.id);
        const values = await getFieldValuesForContacts(pb, contactIds);
        const valueMap = new Map<string, Map<string, string>>();
        values.forEach((v: ContactFieldValue) => {
          if (!valueMap.has(v.contact)) {
            valueMap.set(v.contact, new Map());
          }
          valueMap.get(v.contact)!.set(v.custom_field, v.value);
        });
        setFieldValues(valueMap);
      }

      // Select first group by default
      if (groupsData.length > 0) {
        setSelectedGroup(groupsData[0].id);
      }
    } catch (error) {
      console.error("Failed to load data:", error);
      toast({
        title: "Error",
        description: "Failed to load campaign data.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [campaignId, preselectedContacts]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    // Load global email provider settings so we can tailor the UI
    const loadEmailProvider = async () => {
      try {
        const pb = getClientPB();
        const settings = await pb.collection("app_settings").getList<AppSetting>(1, 10, {
          filter: 'key = "email_provider" || key = "gmail_email"',
        });

        let provider: EmailProvider = "resend";
        let gmailEmail = "";

        for (const s of settings.items) {
          if (s.key === "email_provider") {
            provider = (s.value as { provider: EmailProvider })?.provider || "resend";
          }
          if (s.key === "gmail_email") {
            gmailEmail = (s.value as { email: string })?.email || "";
          }
        }

        setEmailProvider(provider);
        setConfiguredGmailEmail(gmailEmail);

        // When Gmail is selected, auto-fill local state (but we won't show inputs)
        if (provider === "gmail" && gmailEmail) {
          setFromEmail(gmailEmail);
          setReplyTo(gmailEmail);
        }
      } catch (e) {
        // If settings aren't available, just fall back to resend behavior.
        setEmailProvider("resend");
      }
    };

    loadEmailProvider();
  }, []);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedContacts(new Set(contacts.map((c) => c.id)));
    } else {
      setSelectedContacts(new Set());
    }
  };

  const handleSelectContact = (contactId: string, checked: boolean) => {
    const newSelection = new Set(selectedContacts);
    if (checked) {
      newSelection.add(contactId);
    } else {
      newSelection.delete(contactId);
    }
    setSelectedContacts(newSelection);
  };

  const getContactData = (contact: Contact): Record<string, string> => {
    const company = contact.expand?.company;
    const sourceCompany = contact.expand?.source_company;
    const data: Record<string, string> = {
      first_name: contact.first_name || "",
      last_name: contact.last_name || "",
      email: contact.email,
      title: contact.title || "",
      // Company fields with company_ prefix (use source company for outreach, regular company for leads)
      company_name: (sourceCompany || company)?.name || "",
      company_website: (sourceCompany || company)?.website || "",
      company_industry: (sourceCompany || company)?.industry || "",
      // Keep legacy "company" for backward compatibility
      company: (sourceCompany || company)?.name || "",
      // AI opener (for outreach campaigns)
      ai_opener: contact.ai_opener || "",
    };

    // Add custom field values
    const contactFieldValues = fieldValues.get(contact.id);
    if (contactFieldValues) {
      customFields.forEach((field) => {
        const key = field.name.toLowerCase().replace(/\s+/g, "_");
        data[key] = contactFieldValues.get(field.id) || "";
      });
    }

    return data;
  };

  const getActiveTemplates = (): EmailTemplate[] => {
    if (!selectedGroup) return [];
    return templates.get(selectedGroup)?.filter(t => t.is_active) || [];
  };

  const getContactStage = (contactId: string): FunnelStage | undefined => {
    const stageId = contactStageMap.get(contactId);
    if (!stageId) return undefined;
    return funnelStages.find((s) => s.id === stageId);
  };

  const getContactBatch = (contact: Contact): Batch | undefined => {
    if (!contact.batch) return undefined;
    return batches.find((b) => b.id === contact.batch);
  };

  const sendEmails = async () => {
    if (selectedContacts.size === 0) {
      toast({
        title: "No contacts selected",
        description: "Please select at least one contact to send emails to.",
        variant: "destructive",
      });
      return;
    }

    const activeTemplates = getActiveTemplates();
    if (activeTemplates.length === 0) {
      toast({
        title: "No active templates",
        description: "Please select a template group with active templates.",
        variant: "destructive",
      });
      return;
    }

    setStep("sending");
    const selectedContactsList = contacts.filter((c) => selectedContacts.has(c.id));
    const total = selectedContactsList.length;
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < selectedContactsList.length; i++) {
      const contact = selectedContactsList[i];
      setSendProgress({ current: i + 1, total });

      try {
        // Randomly select a template for A/B testing
        const template = activeTemplates[Math.floor(Math.random() * activeTemplates.length)];
        const contactData = getContactData(contact);

        const response = await fetch("/api/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactId: contact.id,
            templateId: template.id,
            campaignId,
            to: contact.email,
            subject: interpolateTemplate(template.subject, contactData),
            html: interpolateTemplate(template.body, contactData),
            // If Gmail is configured as the provider, the server will use the configured Gmail address.
            ...(emailProvider === "gmail"
              ? {}
              : {
                  from: fromEmail,
                  replyTo: replyTo || undefined,
                }),
          }),
        });

        const result = await response.json();

        if (result.success) {
          success++;
        } else {
          failed++;
          errors.push(`${contact.email}: ${result.error}`);
        }
      } catch (error: any) {
        failed++;
        errors.push(`${contact.email}: ${error.message || "Unknown error"}`);
      }

      // Small delay between emails to avoid rate limiting
      if (i < selectedContactsList.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    setSendResults({ success, failed, errors: errors.slice(0, 10) });
    setStep("complete");
  };

  const selectedGroup_ = templateGroups.find((g) => g.id === selectedGroup);
  const activeTemplateCount = getActiveTemplates().length;
  const hasPreselection = preselectedContacts.length > 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Campaign not found</h2>
        <Button asChild className="mt-4">
          <Link href="/campaigns">Back to Campaigns</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/campaigns/${campaignId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Send Emails</h1>
          <p className="text-muted-foreground">{campaign.name}</p>
        </div>
      </div>

      {/* Select Step */}
      {step === "select" && (
        <div className="space-y-6">
          {/* Email Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Email Settings</CardTitle>
              <CardDescription>Configure your sending options</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {emailProvider === "gmail" ? (
                <div className="rounded-lg border p-4 bg-slate-50 dark:bg-slate-900">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">Sending via Google Workspace</p>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    Emails will be sent from <span className="font-medium text-foreground">{configuredGmailEmail || "your connected Gmail account"}</span>.
                    From/Reply-To are managed automatically.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="from">From Email</Label>
                    <Input
                      id="from"
                      type="email"
                      value={fromEmail}
                      onChange={(e) => setFromEmail(e.target.value)}
                      placeholder="noreply@yourdomain.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="replyTo">Reply-To (optional)</Label>
                    <Input
                      id="replyTo"
                      type="email"
                      value={replyTo}
                      onChange={(e) => setReplyTo(e.target.value)}
                      placeholder="you@yourdomain.com"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Template Group</Label>
                <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template group..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templateGroups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name} ({templates.get(group.id)?.filter(t => t.is_active).length || 0} active)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedGroup_ && activeTemplateCount > 1 && (
                  <p className="text-sm text-muted-foreground">
                    A/B Testing: {activeTemplateCount} templates will be randomly selected for each recipient
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Contact Selection */}
          <Card>
            <CardHeader>
              <CardTitle>
                {hasPreselection ? "Selected Recipients" : "Select Recipients"}
              </CardTitle>
              <CardDescription>
                {hasPreselection 
                  ? `${contacts.length} contacts preselected (${selectedContacts.size} will receive emails)`
                  : `Choose contacts to receive this email (${selectedContacts.size} selected)`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={
                            contacts.length > 0 && selectedContacts.size === contacts.length
                          }
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead>Funnel Stage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contacts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          {hasPreselection 
                            ? "No contacts found with the provided IDs"
                            : "No contacts in this campaign"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      contacts.map((contact) => {
                        const stage = getContactStage(contact.id);
                        const batch = getContactBatch(contact);
                        return (
                          <TableRow key={contact.id}>
                            <TableCell>
                              <Checkbox
                                checked={selectedContacts.has(contact.id)}
                                onCheckedChange={(checked) =>
                                  handleSelectContact(contact.id, checked as boolean)
                                }
                              />
                            </TableCell>
                            <TableCell className="font-medium">
                              {contact.first_name} {contact.last_name}
                            </TableCell>
                            <TableCell>{contact.email}</TableCell>
                            <TableCell>{contact.expand?.company?.name || "-"}</TableCell>
                            <TableCell>
                              {batch ? (
                                <Badge variant="secondary" className="gap-1.5">
                                  <Layers className="h-3 w-3" />
                                  {batch.name}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {stage ? (
                                <Badge 
                                  variant="secondary"
                                  className="gap-1.5"
                                >
                                  <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: stage.color || '#6b7280' }}
                                  />
                                  {stage.name}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Send Button */}
          <div className="flex justify-end">
            <Button
              size="lg"
              onClick={sendEmails}
              disabled={selectedContacts.size === 0 || !selectedGroup || activeTemplateCount === 0}
            >
              <Send className="mr-2 h-4 w-4" />
              Send to {selectedContacts.size} contacts
            </Button>
          </div>
        </div>
      )}

      {/* Sending Step */}
      {step === "sending" && (
        <Card>
          <CardHeader>
            <CardTitle>Sending Emails...</CardTitle>
            <CardDescription>Please wait while we send your emails</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={(sendProgress.current / sendProgress.total) * 100} />
            <p className="text-center text-muted-foreground">
              {sendProgress.current} of {sendProgress.total} emails sent
            </p>
          </CardContent>
        </Card>
      )}

      {/* Complete Step */}
      {step === "complete" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {sendResults.failed > 0 ? (
                <AlertCircle className="h-5 w-5 text-amber-500" />
              ) : (
                <Check className="h-5 w-5 text-green-500" />
              )}
              {sendResults.failed > 0 ? "Sending Finished (with errors)" : "Sending Complete"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-green-600" />
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {sendResults.success}
                  </p>
                </div>
                <p className="text-sm text-green-700 dark:text-green-300">
                  Successfully sent
                </p>
              </div>
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                    {sendResults.failed}
                  </p>
                </div>
                <p className="text-sm text-red-700 dark:text-red-300">Failed to send</p>
              </div>
            </div>

            {sendResults.errors.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium">Errors:</h4>
                <div className="text-sm space-y-1 text-red-700 dark:text-red-300 max-h-40 overflow-y-auto">
                  {sendResults.errors.map((error, i) => (
                    <p key={i}>{error}</p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setStep("select");
                  setSelectedContacts(new Set());
                }}
              >
                Send More
              </Button>
              <Button asChild>
                <Link href={`/campaigns/${campaignId}/dashboard`}>View Dashboard</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
