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
} from "lucide-react";
import type { Contact, Company, FunnelStage, ContactStage, EmailSend } from "@/types";
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
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

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
      const [contactData, companiesData, stagesData, contactStagesData, emailSendsData] = await Promise.all([
        getContact(pb, contactId),
        getCompanies(pb, campaignId),
        getFunnelStages(pb, campaignId),
        getContactStages(pb, campaignId),
        getEmailSendsForContact(pb, contactId),
      ]);

      setContact(contactData);
      setCompanies(companiesData);
      setFunnelStages(stagesData.sort((a, b) => a.order - b.order));
      setEmailSends(emailSendsData.sort((a, b) => 
        new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
      ));

      // Find current stage for this contact
      const contactStage = contactStagesData.find((cs: ContactStage) => cs.contact === contactId);
      setCurrentStageId(contactStage?.stage || null);

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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "delivered":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "opened":
        return <Eye className="h-4 w-4 text-blue-500" />;
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
