"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  getClientPB,
  getContact,
  updateContact,
  getCompanies,
  getFunnelStages,
  getContactStages,
  setContactStage,
  getEmailSendsForContact,
  getEmailTemplateGroups,
  getEmailTemplates,
  setContactFollowUp,
  cancelContactFollowUp,
} from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import {
  ArrowLeft,
  Mail,
  Building,
  User,
  Briefcase,
  Calendar,
  CheckCircle,
  Clock,
  XCircle,
  Eye,
  Save,
  CalendarClock,
  Ban,
  Reply,
} from "lucide-react";
import type { Contact, Company, FunnelStage, ContactStage, EmailSend, EmailTemplate, EmailTemplateGroup } from "@/types";
import { formatDateTime } from "@/lib/utils";

export default function ContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;
  const contactId = params.contactId as string;

  const [contact, setContact] = useState<Contact | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);
  const [currentStageId, setCurrentStageId] = useState<string | null>(null);
  const [emailSends, setEmailSends] = useState<EmailSend[]>([]);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingFollowUp, setIsSavingFollowUp] = useState(false);

  // Follow-up state
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpTemplateId, setFollowUpTemplateId] = useState("");
  const [followUpCancelled, setFollowUpCancelled] = useState(false);

  const [editedContact, setEditedContact] = useState({
    first_name: "",
    last_name: "",
    email: "",
    title: "",
    company: "",
  });

  const loadData = useCallback(async () => {
    try {
      const pb = getClientPB();
      const [contactData, companiesData, stagesData, contactStagesData, emailSendsData, templateGroups] = await Promise.all([
        getContact(pb, contactId),
        getCompanies(pb, campaignId),
        getFunnelStages(pb, campaignId),
        getContactStages(pb, campaignId),
        getEmailSendsForContact(pb, contactId),
        getEmailTemplateGroups(pb, campaignId),
      ]);

      // Load all templates across all groups
      const allTemplates: EmailTemplate[] = [];
      for (const group of templateGroups) {
        const templates = await getEmailTemplates(pb, group.id);
        allTemplates.push(...templates);
      }

      setContact(contactData);
      setCompanies(companiesData);
      setFunnelStages(stagesData.sort((a, b) => a.order - b.order));
      setEmailSends(emailSendsData.sort((a, b) => 
        new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
      ));
      setEmailTemplates(allTemplates);

      // Find current stage for this contact
      const contactStage = contactStagesData.find((cs: ContactStage) => cs.contact === contactId);
      setCurrentStageId(contactStage?.stage || null);

      // Set follow-up state
      setFollowUpDate(contactData.follow_up_date ? contactData.follow_up_date.split("T")[0] : "");
      setFollowUpTemplateId(contactData.follow_up_template || "");
      setFollowUpCancelled(contactData.follow_up_cancelled || false);

      // Set editable fields
      setEditedContact({
        first_name: contactData.first_name || "",
        last_name: contactData.last_name || "",
        email: contactData.email || "",
        title: contactData.title || "",
        company: contactData.company || "",
      });
    } catch (error) {
      console.error("Failed to load contact data:", error);
      toast({
        title: "Error",
        description: "Failed to load contact details.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [campaignId, contactId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveContact = async () => {
    setIsSaving(true);
    try {
      const pb = getClientPB();
      await updateContact(pb, contactId, {
        first_name: editedContact.first_name,
        last_name: editedContact.last_name,
        email: editedContact.email,
        title: editedContact.title,
        company: editedContact.company || undefined,
      });
      
      toast({
        title: "Contact updated",
        description: "Contact details have been saved.",
        variant: "success",
      });
      
      loadData();
    } catch (error) {
      console.error("Failed to update contact:", error);
      toast({
        title: "Error",
        description: "Failed to save contact details.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleStageChange = async (newStageId: string) => {
    const previousStageId = currentStageId;
    setCurrentStageId(newStageId);

    try {
      const pb = getClientPB();
      await setContactStage(pb, contactId, newStageId);
      toast({
        title: "Stage updated",
        description: "Contact funnel stage has been updated.",
      });
    } catch (error) {
      // Revert on error
      setCurrentStageId(previousStageId);
      toast({
        title: "Error",
        description: "Failed to update contact stage.",
        variant: "destructive",
      });
    }
  };

  const handleSaveFollowUp = async () => {
    setIsSavingFollowUp(true);
    try {
      const pb = getClientPB();
      await setContactFollowUp(pb, contactId, {
        follow_up_date: followUpDate ? new Date(followUpDate).toISOString() : "",
        follow_up_template: followUpTemplateId || "",
        follow_up_cancelled: false,
      });

      setFollowUpCancelled(false);
      toast({
        title: "Follow-up saved",
        description: followUpDate
          ? `Follow-up scheduled for ${new Date(followUpDate).toLocaleDateString()}`
          : "Follow-up date cleared",
      });
      loadData();
    } catch (error) {
      console.error("Failed to save follow-up:", error);
      toast({
        title: "Error",
        description: "Failed to save follow-up settings.",
        variant: "destructive",
      });
    } finally {
      setIsSavingFollowUp(false);
    }
  };

  const handleCancelFollowUp = async () => {
    setIsSavingFollowUp(true);
    try {
      const pb = getClientPB();
      await cancelContactFollowUp(pb, contactId);
      setFollowUpDate("");
      setFollowUpTemplateId("");
      setFollowUpCancelled(true);
      toast({
        title: "Follow-ups cancelled",
        description: "No more follow-up emails will be sent to this contact.",
      });
      loadData();
    } catch (error) {
      console.error("Failed to cancel follow-up:", error);
      toast({
        title: "Error",
        description: "Failed to cancel follow-ups.",
        variant: "destructive",
      });
    } finally {
      setIsSavingFollowUp(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "delivered":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "opened":
        return <Eye className="h-4 w-4 text-blue-500" />;
      case "replied":
        return <Reply className="h-4 w-4 text-emerald-600" />;
      case "bounced":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "sent":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "success" | "secondary" | "destructive" | "default"> = {
      delivered: "success",
      opened: "default",
      replied: "success",
      bounced: "destructive",
      sent: "secondary",
    };
    return (
      <Badge variant={variants[status] || "secondary"}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Contact not found</h2>
        <Button asChild className="mt-4">
          <Link href={`/campaigns/${campaignId}`}>Back to Campaign</Link>
        </Button>
      </div>
    );
  }

  const currentStage = funnelStages.find((s) => s.id === currentStageId);
  const companyName = companies.find((c) => c.id === contact.company)?.name || contact.expand?.company?.name;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/campaigns/${campaignId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            {contact.first_name} {contact.last_name}
          </h1>
          <p className="text-muted-foreground">{contact.email}</p>
        </div>
        <Button onClick={handleSaveContact} loading={isSaving}>
          <Save className="mr-2 h-4 w-4" />
          Save Changes
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Contact Information */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Contact Information
            </CardTitle>
            <CardDescription>
              Edit contact details and information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">First Name</Label>
                <Input
                  id="first_name"
                  value={editedContact.first_name}
                  onChange={(e) =>
                    setEditedContact({ ...editedContact, first_name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Last Name</Label>
                <Input
                  id="last_name"
                  value={editedContact.last_name}
                  onChange={(e) =>
                    setEditedContact({ ...editedContact, last_name: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={editedContact.email}
                onChange={(e) =>
                  setEditedContact({ ...editedContact, email: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="e.g., CEO, Marketing Manager"
                value={editedContact.title}
                onChange={(e) =>
                  setEditedContact({ ...editedContact, title: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company">Company</Label>
              <Select
                value={editedContact.company || "__none__"}
                onValueChange={(value) =>
                  setEditedContact({ ...editedContact, company: value === "__none__" ? "" : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a company" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No company</SelectItem>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Funnel Stage Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Funnel Stage
            </CardTitle>
            <CardDescription>
              Current position in the sales funnel
            </CardDescription>
          </CardHeader>
          <CardContent>
            {currentStage && (
              <div className="mb-4">
                <div
                  className="w-full h-3 rounded-full mb-2"
                  style={{ backgroundColor: currentStage.color || '#6b7280' }}
                />
                <p className="text-sm font-medium">{currentStage.name}</p>
              </div>
            )}
            <Select
              value={currentStageId || "unassigned"}
              onValueChange={(value) => {
                if (value !== "unassigned") {
                  handleStageChange(value);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select stage" />
              </SelectTrigger>
              <SelectContent>
                {funnelStages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: stage.color || '#6b7280' }}
                      />
                      {stage.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {companyName && (
              <div className="mt-6 pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-1">Company</p>
                <Link 
                  href={`/campaigns/${campaignId}/companies/${contact.company}`}
                  className="flex items-center gap-2 text-primary hover:underline"
                >
                  <Building className="h-4 w-4" />
                  {companyName}
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Follow-up Scheduling */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" />
            Follow-up
          </CardTitle>
          <CardDescription>
            Schedule a follow-up email for this contact
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {followUpCancelled ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted p-3 rounded-md">
              <Ban className="h-4 w-4" />
              <span>Follow-ups are cancelled for this contact (they replied).</span>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="follow_up_date">Follow-up Date</Label>
            <Input
              id="follow_up_date"
              type="date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              disabled={followUpCancelled}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="follow_up_template">Email Template</Label>
            <Select
              value={followUpTemplateId || "__none__"}
              onValueChange={(value) =>
                setFollowUpTemplateId(value === "__none__" ? "" : value)
              }
              disabled={followUpCancelled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No template</SelectItem>
                {emailTemplates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.subject}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The follow-up will be sent in the same email thread as the last email.
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleSaveFollowUp}
              disabled={isSavingFollowUp || followUpCancelled}
              size="sm"
            >
              <CalendarClock className="mr-2 h-4 w-4" />
              {followUpDate ? "Save Follow-up" : "Clear Follow-up"}
            </Button>
            {!followUpCancelled && followUpDate && (
              <Button
                onClick={handleCancelFollowUp}
                disabled={isSavingFollowUp}
                variant="outline"
                size="sm"
              >
                <Ban className="mr-2 h-4 w-4" />
                Cancel Follow-ups
              </Button>
            )}
            {followUpCancelled && (
              <Button
                onClick={() => {
                  setFollowUpCancelled(false);
                  handleSaveFollowUp();
                }}
                disabled={isSavingFollowUp}
                variant="outline"
                size="sm"
              >
                Re-enable Follow-ups
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Email History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email History
          </CardTitle>
          <CardDescription>
            All emails sent to this contact ({emailSends.length} total)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {emailSends.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No emails sent to this contact yet.</p>
              <Button asChild className="mt-4" variant="outline">
                <Link href={`/campaigns/${campaignId}/send?contacts=${contactId}`}>
                  Send an Email
                </Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Sent Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emailSends.map((send) => (
                  <TableRow key={send.id}>
                    <TableCell className="font-medium">
                      {send.expand?.template?.subject || "Unknown template"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {formatDateTime(send.sent_at)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(send.status)}
                        {getStatusBadge(send.status)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
