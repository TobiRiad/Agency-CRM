"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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
  getEmailSendsForContact,
  setContactFollowUp,
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
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Send,
  Check,
  AlertCircle,
  Mail,
  Layers,
  Eye,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Reply,
  Filter,
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
  EmailSend,
} from "@/types";
import { interpolateTemplate } from "@/lib/utils";

type SendStep = "select" | "preview" | "sending" | "complete";

// Stages to exclude from follow-up list by default
const EXCLUDED_STAGE_NAMES = [
  "out of office",
  "replied",
  "bounced",
  "not interested",
];

interface PreparedFollowUp {
  contactId: string;
  contact: Contact;
  templateId: string;
  templateSubject: string;
  to: string;
  subject: string; // Will be "Re: <original subject>"
  body: string;
  approved: boolean;
  expanded: boolean;
  // Threading data from the last email sent
  lastEmailThreadId?: string;
  lastEmailMessageId?: string;
}

export default function FollowUpPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const campaignId = params.id as string;
  const contactsParam = searchParams.get("contacts");

  const preselectedContacts = useMemo(
    () => contactsParam?.split(",").filter(Boolean) || [],
    [contactsParam]
  );

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [templateGroups, setTemplateGroups] = useState<EmailTemplateGroup[]>([]);
  const [allTemplates, setAllTemplates] = useState<EmailTemplate[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [fieldValues, setFieldValues] = useState<Map<string, Map<string, string>>>(new Map());
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);
  const [contactStageMap, setContactStageMap] = useState<Map<string, string>>(new Map());
  const [batches, setBatches] = useState<Batch[]>([]);
  const [lastEmailSends, setLastEmailSends] = useState<Map<string, EmailSend>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("follow_up_eligible");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  // Selection state
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(
    new Set(preselectedContacts)
  );

  // Provider settings
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
  const [preparedEmails, setPreparedEmails] = useState<PreparedFollowUp[]>([]);

  const loadData = useCallback(async () => {
    try {
      const pb = getClientPB();
      const [
        campaignData,
        contactsData,
        groupsData,
        fieldsData,
        stagesData,
        contactStagesData,
        batchesData,
      ] = await Promise.all([
        getCampaign(pb, campaignId),
        getContacts(pb, campaignId),
        getEmailTemplateGroups(pb, campaignId),
        getCustomFields(pb, campaignId),
        getFunnelStages(pb, campaignId),
        getContactStages(pb, campaignId),
        getBatches(pb, campaignId),
      ]);

      setCampaign(campaignData);
      setAllContacts(contactsData);
      setBatches(batchesData);
      setFunnelStages(stagesData.sort((a, b) => a.order - b.order));
      setCustomFields(fieldsData);

      // Load all templates
      const templates: EmailTemplate[] = [];
      for (const group of groupsData) {
        const groupTemplates = await getEmailTemplates(pb, group.id);
        templates.push(...groupTemplates);
      }
      setTemplateGroups(groupsData);
      setAllTemplates(templates);

      // Build contact -> stage mapping
      const stageMap = new Map<string, string>();
      contactStagesData.forEach((cs: ContactStage) => {
        stageMap.set(cs.contact, cs.stage);
      });
      setContactStageMap(stageMap);

      // Load last email send for each contact (for threading)
      const emailSendMap = new Map<string, EmailSend>();
      for (const contact of contactsData) {
        try {
          const sends = await getEmailSendsForContact(pb, contact.id);
          if (sends.length > 0) {
            const sorted = sends.sort(
              (a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
            );
            emailSendMap.set(contact.id, sorted[0]);
          }
        } catch {
          // Skip if error
        }
      }
      setLastEmailSends(emailSendMap);

      // Load field values
      if (contactsData.length > 0) {
        const contactIds = contactsData.map((c) => c.id);
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
  }, [campaignId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load email provider settings
  useEffect(() => {
    const loadEmailProvider = async () => {
      try {
        const pb = getClientPB();
        const settings = await pb
          .collection("app_settings")
          .getList<AppSetting>(1, 10, {
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
      } catch {
        setEmailProvider("resend");
      }
    };
    loadEmailProvider();
  }, []);

  // Filter contacts based on batch, stage, and preselection
  useEffect(() => {
    let contacts = allContacts;

    // If preselected, limit to those contacts
    if (preselectedContacts.length > 0) {
      contacts = contacts.filter((c) => preselectedContacts.includes(c.id));
    }

    // Only show contacts that have been emailed before
    contacts = contacts.filter((c) => lastEmailSends.has(c.id));

    // Filter by batch
    if (batchFilter !== "all") {
      if (batchFilter === "no_batch") {
        contacts = contacts.filter((c) => !c.batch);
      } else {
        contacts = contacts.filter((c) => c.batch === batchFilter);
      }
    }

    // Filter by stage
    if (stageFilter === "follow_up_eligible") {
      // Exclude contacts in OOO, Replied, Bounced, Not Interested stages
      contacts = contacts.filter((c) => {
        const stageId = contactStageMap.get(c.id);
        if (!stageId) return true; // No stage = eligible
        const stage = funnelStages.find((s) => s.id === stageId);
        if (!stage) return true;
        return !EXCLUDED_STAGE_NAMES.includes(stage.name.toLowerCase());
      });

      // Also exclude contacts that are already marked follow_up_cancelled
      contacts = contacts.filter((c) => !c.follow_up_cancelled);
    } else if (stageFilter !== "all") {
      // Filter to a specific stage
      contacts = contacts.filter((c) => contactStageMap.get(c.id) === stageFilter);
    }

    setFilteredContacts(contacts);
  }, [allContacts, batchFilter, stageFilter, contactStageMap, funnelStages, lastEmailSends, preselectedContacts]);

  const getContactStage = (contactId: string): FunnelStage | undefined => {
    const stageId = contactStageMap.get(contactId);
    if (!stageId) return undefined;
    return funnelStages.find((s) => s.id === stageId);
  };

  const getContactBatch = (contact: Contact): Batch | undefined => {
    if (!contact.batch) return undefined;
    return batches.find((b) => b.id === contact.batch);
  };

  const getContactData = (contact: Contact): Record<string, string> => {
    const company = contact.expand?.company;
    const sourceCompany = contact.expand?.source_company;
    const data: Record<string, string> = {
      first_name: contact.first_name || "",
      last_name: contact.last_name || "",
      email: contact.email,
      title: contact.title || "",
      company_name: (sourceCompany || company)?.name || "",
      company_website: (sourceCompany || company)?.website || "",
      company_industry: (sourceCompany || company)?.industry || "",
      company: (sourceCompany || company)?.name || "",
      ai_opener: contact.ai_opener || "",
    };

    const contactFieldValues = fieldValues.get(contact.id);
    if (contactFieldValues) {
      customFields.forEach((field) => {
        const key = field.name.toLowerCase().replace(/\s+/g, "_");
        data[key] = contactFieldValues.get(field.id) || "";
      });
    }

    return data;
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedContacts(new Set(filteredContacts.map((c) => c.id)));
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

  const prepareFollowUps = () => {
    if (selectedContacts.size === 0) {
      toast({
        title: "No contacts selected",
        description: "Please select at least one contact to follow up with.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedTemplateId) {
      toast({
        title: "No template selected",
        description: "Please select an email template for the follow-ups.",
        variant: "destructive",
      });
      return;
    }

    const template = allTemplates.find((t) => t.id === selectedTemplateId);
    if (!template) {
      toast({
        title: "Template not found",
        description: "The selected template could not be found.",
        variant: "destructive",
      });
      return;
    }

    const selectedContactsList = filteredContacts.filter((c) =>
      selectedContacts.has(c.id)
    );

    const prepared: PreparedFollowUp[] = selectedContactsList.map((contact) => {
      const contactData = getContactData(contact);
      const lastSend = lastEmailSends.get(contact.id);

      // Build "Re: <original subject>" for threading
      const originalSubject = lastSend?.expand?.template?.subject || template.subject;
      const subject = originalSubject.toLowerCase().startsWith("re:")
        ? interpolateTemplate(originalSubject, contactData)
        : `Re: ${interpolateTemplate(originalSubject, contactData)}`;

      return {
        contactId: contact.id,
        contact,
        templateId: template.id,
        templateSubject: template.subject,
        to: contact.email,
        subject,
        body: interpolateTemplate(template.body, contactData),
        approved: true,
        expanded: false,
        lastEmailThreadId: lastSend?.thread_id || undefined,
        lastEmailMessageId: lastSend?.message_id || undefined,
      };
    });

    setPreparedEmails(prepared);
    setStep("preview");
  };

  const updatePreparedEmail = (index: number, updates: Partial<PreparedFollowUp>) => {
    setPreparedEmails((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...updates };
      return updated;
    });
  };

  const toggleAllApproved = (approved: boolean) => {
    setPreparedEmails((prev) => prev.map((email) => ({ ...email, approved })));
  };

  const toggleAllExpanded = (expanded: boolean) => {
    setPreparedEmails((prev) => prev.map((email) => ({ ...email, expanded })));
  };

  const sendFollowUps = async () => {
    const approvedEmails = preparedEmails.filter((e) => e.approved);

    if (approvedEmails.length === 0) {
      toast({
        title: "No follow-ups approved",
        description: "Please approve at least one follow-up to send.",
        variant: "destructive",
      });
      return;
    }

    setStep("sending");
    const total = approvedEmails.length;
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < approvedEmails.length; i++) {
      const email = approvedEmails[i];
      setSendProgress({ current: i + 1, total });

      try {
        const response = await fetch("/api/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactId: email.contactId,
            templateId: email.templateId,
            campaignId,
            to: email.to,
            subject: email.subject,
            html: email.body,
            // Threading: send in the same thread as the original email
            threadId: email.lastEmailThreadId || undefined,
            inReplyTo: email.lastEmailMessageId || undefined,
            references: email.lastEmailMessageId || undefined,
            isFollowUp: true,
            ...(emailProvider === "gmail"
              ? {}
              : {
                  from: undefined,
                  replyTo: undefined,
                }),
          }),
        });

        const result = await response.json();

        if (result.success) {
          success++;
        } else {
          failed++;
          errors.push(`${email.to}: ${result.error}`);
        }
      } catch (error: unknown) {
        failed++;
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        errors.push(`${email.to}: ${errorMessage}`);
      }

      // Rate limiting delay
      if (i < approvedEmails.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    setSendResults({ success, failed, errors: errors.slice(0, 10) });
    setStep("complete");
  };

  const hasPreselection = preselectedContacts.length > 0;
  const emailedContactCount = allContacts.filter((c) => lastEmailSends.has(c.id)).length;

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
          <h1 className="text-2xl font-bold">Send Follow-ups</h1>
          <p className="text-muted-foreground">
            {campaign.name} — Follow-ups are sent in the same email thread
          </p>
        </div>
      </div>

      {/* Select Step */}
      {step === "select" && (
        <div className="space-y-6">
          {/* Info banner */}
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3 text-sm">
                <Reply className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <p className="text-muted-foreground">
                  Follow-ups are sent as replies in the same email thread as the original outreach.
                  Only contacts who have been emailed before are shown.
                  Contacts in <span className="font-medium text-foreground">Out of Office</span>,{" "}
                  <span className="font-medium text-foreground">Replied</span>,{" "}
                  <span className="font-medium text-foreground">Bounced</span>, or{" "}
                  <span className="font-medium text-foreground">Not Interested</span> stages are excluded by default.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Follow-up Template */}
          <Card>
            <CardHeader>
              <CardTitle>Follow-up Template</CardTitle>
              <CardDescription>
                Select the email template to use for all follow-ups
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {emailProvider === "gmail" && (
                <div className="rounded-lg border p-4 bg-slate-50 dark:bg-slate-900">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">Sending via Google Workspace</p>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    Follow-ups will be sent from{" "}
                    <span className="font-medium text-foreground">
                      {configuredGmailEmail || "your connected Gmail account"}
                    </span>{" "}
                    and will appear in the same thread.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Template</Label>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a follow-up template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templateGroups.map((group) => {
                      const groupTemplates = allTemplates.filter(
                        (t) => t.group === group.id && t.is_active
                      );
                      if (groupTemplates.length === 0) return null;
                      return groupTemplates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {group.name} — {template.subject}
                        </SelectItem>
                      ));
                    })}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filter Contacts
              </CardTitle>
              <CardDescription>
                {emailedContactCount} contacts have been emailed — {filteredContacts.length} match current filters
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="space-y-2 flex-1">
                  <Label>Batch</Label>
                  <Select value={batchFilter} onValueChange={setBatchFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Batches</SelectItem>
                      <SelectItem value="no_batch">No Batch</SelectItem>
                      {batches.map((batch) => (
                        <SelectItem key={batch.id} value={batch.id}>
                          {batch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 flex-1">
                  <Label>Funnel Stage</Label>
                  <Select value={stageFilter} onValueChange={setStageFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="follow_up_eligible">
                        Follow-up Eligible (excludes OOO, Replied, Bounced)
                      </SelectItem>
                      <SelectItem value="all">All Stages</SelectItem>
                      {funnelStages.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stage.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Contact Selection */}
          <Card>
            <CardHeader>
              <CardTitle>
                {hasPreselection ? "Selected Contacts" : "Select Contacts to Follow Up"}
              </CardTitle>
              <CardDescription>
                {filteredContacts.length} contacts shown — {selectedContacts.size} selected
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
                            filteredContacts.length > 0 &&
                            selectedContacts.size === filteredContacts.length
                          }
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead>Funnel Stage</TableHead>
                      <TableHead>Last Emailed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredContacts.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-center py-8 text-muted-foreground"
                        >
                          No contacts match the current filters. Try changing the batch or stage filter.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredContacts.map((contact) => {
                        const stage = getContactStage(contact.id);
                        const batch = getContactBatch(contact);
                        const lastSend = lastEmailSends.get(contact.id);
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
                                <Badge variant="secondary" className="gap-1.5">
                                  <span
                                    className="w-2 h-2 rounded-full"
                                    style={{
                                      backgroundColor: stage.color || "#6b7280",
                                    }}
                                  />
                                  {stage.name}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {lastSend
                                ? new Date(lastSend.sent_at).toLocaleDateString()
                                : "-"}
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

          {/* Preview Button */}
          <div className="flex justify-end">
            <Button
              size="lg"
              onClick={prepareFollowUps}
              disabled={selectedContacts.size === 0 || !selectedTemplateId}
            >
              <Eye className="mr-2 h-4 w-4" />
              Preview & Approve ({selectedContacts.size} follow-ups)
            </Button>
          </div>
        </div>
      )}

      {/* Preview Step */}
      {step === "preview" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Review & Approve Follow-ups</CardTitle>
                  <CardDescription>
                    Each follow-up will be sent as a reply in the same email thread.
                    You can edit the subject and body before sending.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleAllExpanded(true)}
                  >
                    <ChevronDown className="h-4 w-4 mr-1" />
                    Expand All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleAllExpanded(false)}
                  >
                    <ChevronUp className="h-4 w-4 mr-1" />
                    Collapse All
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Bulk actions */}
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium">
                    {preparedEmails.filter((e) => e.approved).length} of{" "}
                    {preparedEmails.length} approved
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleAllApproved(true)}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1 text-green-600" />
                    Approve All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleAllApproved(false)}
                  >
                    <XCircle className="h-4 w-4 mr-1 text-red-600" />
                    Reject All
                  </Button>
                </div>
              </div>

              {/* Follow-up previews */}
              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                {preparedEmails.map((email, index) => (
                  <div
                    key={email.contactId}
                    className={`border rounded-lg transition-colors ${
                      email.approved
                        ? "border-green-200 bg-green-50/50 dark:bg-green-900/10"
                        : "border-red-200 bg-red-50/50 dark:bg-red-900/10"
                    }`}
                  >
                    {/* Header */}
                    <div
                      className="flex items-center justify-between p-3 cursor-pointer"
                      onClick={() =>
                        updatePreparedEmail(index, { expanded: !email.expanded })
                      }
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={email.approved}
                          onCheckedChange={(checked) => {
                            updatePreparedEmail(index, {
                              approved: checked as boolean,
                            });
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div>
                          <p className="font-medium text-sm">
                            {email.contact.first_name} {email.contact.last_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {email.to}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {email.lastEmailThreadId && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Reply className="h-3 w-3" />
                            Same Thread
                          </Badge>
                        )}
                        {email.approved ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-400" />
                        )}
                        {email.expanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {/* Expanded content */}
                    {email.expanded && (
                      <div
                        className="border-t p-4 space-y-4"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="space-y-2">
                          <Label className="text-xs font-medium text-muted-foreground">
                            Subject
                          </Label>
                          <Input
                            value={email.subject}
                            onChange={(e) =>
                              updatePreparedEmail(index, { subject: e.target.value })
                            }
                            className="font-medium"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-medium text-muted-foreground">
                            Body (HTML)
                          </Label>
                          <Textarea
                            value={email.body}
                            onChange={(e) =>
                              updatePreparedEmail(index, { body: e.target.value })
                            }
                            rows={8}
                            className="font-mono text-sm"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-medium text-muted-foreground">
                            Preview
                          </Label>
                          <div
                            className="border rounded-lg p-4 bg-white dark:bg-slate-950 prose prose-sm max-w-none dark:prose-invert"
                            dangerouslySetInnerHTML={{ __html: email.body }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Action buttons */}
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => {
                setStep("select");
                setPreparedEmails([]);
              }}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Selection
            </Button>
            <Button
              size="lg"
              onClick={sendFollowUps}
              disabled={preparedEmails.filter((e) => e.approved).length === 0}
            >
              <Send className="mr-2 h-4 w-4" />
              Send {preparedEmails.filter((e) => e.approved).length} Follow-ups
            </Button>
          </div>
        </div>
      )}

      {/* Sending Step */}
      {step === "sending" && (
        <Card>
          <CardHeader>
            <CardTitle>Sending Follow-ups...</CardTitle>
            <CardDescription>
              Please wait while we send your follow-up emails
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress
              value={(sendProgress.current / sendProgress.total) * 100}
            />
            <p className="text-center text-muted-foreground">
              {sendProgress.current} of {sendProgress.total} follow-ups sent
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
              {sendResults.failed > 0
                ? "Follow-ups Sent (with errors)"
                : "Follow-ups Sent Successfully"}
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
                <p className="text-sm text-red-700 dark:text-red-300">
                  Failed to send
                </p>
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
                  setPreparedEmails([]);
                }}
              >
                Send More Follow-ups
              </Button>
              <Button asChild>
                <Link href={`/campaigns/${campaignId}/dashboard`}>
                  View Dashboard
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
