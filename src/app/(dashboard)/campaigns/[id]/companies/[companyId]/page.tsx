"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  getClientPB,
  getCompany,
  updateCompany,
  getContactsByCompany,
  getFunnelStages,
  getContactStages,
  getCampaign,
  getBatches,
  getAIScoringConfigs,
} from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Building,
  Globe,
  Briefcase,
  Users,
  Mail,
  User,
  Save,
  ExternalLink,
  Star,
  Sparkles,
  Loader2,
  FileText,
  Layers,
} from "lucide-react";
import type { Company, Contact, FunnelStage, ContactStage, Campaign, Batch, AIScoringConfig } from "@/types";

export default function CompanyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;
  const companyId = params.companyId as string;

  const [company, setCompany] = useState<Company | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);
  const [contactStageMap, setContactStageMap] = useState<Map<string, string>>(new Map());
  const [aiConfigs, setAiConfigs] = useState<AIScoringConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isScoring, setIsScoring] = useState(false);

  const [editedCompany, setEditedCompany] = useState({
    name: "",
    website: "",
    industry: "",
    email: "",
    description: "",
    batch: "",
  });

  const loadData = useCallback(async () => {
    try {
      const pb = getClientPB();
      const [companyData, campaignData, contactsData, stagesData, contactStagesData, batchesData] = await Promise.all([
        getCompany(pb, companyId),
        getCampaign(pb, campaignId),
        getContactsByCompany(pb, companyId),
        getFunnelStages(pb, campaignId),
        getContactStages(pb, campaignId),
        getBatches(pb, campaignId),
      ]);

      setCompany(companyData);
      setCampaign(campaignData);
      setContacts(contactsData);
      setFunnelStages(stagesData);
      setBatches(batchesData);

      // Load AI configs for leads campaigns
      if (campaignData.kind === 'leads') {
        const configs = await getAIScoringConfigs(pb, campaignId);
        setAiConfigs(configs);
      }

      // Create contact -> stage mapping
      const stageMap = new Map<string, string>();
      contactStagesData.forEach((cs: ContactStage) => {
        stageMap.set(cs.contact, cs.stage);
      });
      setContactStageMap(stageMap);

      // Set editable fields
      setEditedCompany({
        name: companyData.name || "",
        website: companyData.website || "",
        industry: companyData.industry || "",
        email: companyData.email || "",
        description: companyData.description || "",
        batch: companyData.batch || "",
      });
    } catch (error) {
      console.error("Failed to load company data:", error);
      toast({
        title: "Error",
        description: "Failed to load company details.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [campaignId, companyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveCompany = async () => {
    setIsSaving(true);
    try {
      const pb = getClientPB();
      await updateCompany(pb, companyId, {
        name: editedCompany.name,
        website: editedCompany.website,
        industry: editedCompany.industry,
        email: editedCompany.email || undefined,
        description: editedCompany.description || undefined,
        batch: editedCompany.batch || undefined,
      });
      
      toast({
        title: "Company updated",
        description: "Company details have been saved.",
        variant: "success",
      });
      
      loadData();
    } catch (error) {
      console.error("Failed to update company:", error);
      toast({
        title: "Error",
        description: "Failed to save company details.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleScoreLead = async () => {
    if (aiConfigs.length === 0) {
      toast({
        title: "No AI Config",
        description: "Please set up an AI scoring config in campaign settings first.",
        variant: "destructive",
      });
      return;
    }

    setIsScoring(true);
    try {
      const config = aiConfigs[0];
      const response = await fetch("/api/ai/score-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          configId: config.id,
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "Lead Scored",
          description: `Score: ${result.result.score || "N/A"}, Classification: ${result.result.classification || "N/A"}`,
        });
        loadData();
      } else {
        throw new Error(result.error || "Failed to score lead");
      }
    } catch (error) {
      console.error("Failed to score lead:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to score lead",
        variant: "destructive",
      });
    } finally {
      setIsScoring(false);
    }
  };

  const getContactStageName = (contactId: string): string => {
    const stageId = contactStageMap.get(contactId);
    if (!stageId) return "Unassigned";
    const stage = funnelStages.find((s) => s.id === stageId);
    return stage?.name || "Unknown";
  };

  const getContactStageColor = (contactId: string): string => {
    const stageId = contactStageMap.get(contactId);
    if (!stageId) return "#6b7280";
    const stage = funnelStages.find((s) => s.id === stageId);
    return stage?.color || "#6b7280";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Company not found</h2>
        <Button asChild className="mt-4">
          <Link href={`/campaigns/${campaignId}`}>Back to Campaign</Link>
        </Button>
      </div>
    );
  }

  const isLeadsCampaign = campaign?.kind === 'leads';

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
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building className="h-6 w-6" />
            {company.name}
          </h1>
          {company.website && (
            <a
              href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline flex items-center gap-1"
            >
              <Globe className="h-4 w-4" />
              {company.website}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isLeadsCampaign && aiConfigs.length > 0 && (
            <Button variant="outline" onClick={handleScoreLead} disabled={isScoring}>
              {isScoring ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Scoring...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Run AI Score
                </>
              )}
            </Button>
          )}
          <Button onClick={handleSaveCompany} disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Company Information */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              Company Information
            </CardTitle>
            <CardDescription>
              Edit company details and information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Company Name</Label>
                <Input
                  id="name"
                  value={editedCompany.name}
                  onChange={(e) =>
                    setEditedCompany({ ...editedCompany, name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  type="url"
                  placeholder="https://example.com"
                  value={editedCompany.website}
                  onChange={(e) =>
                    setEditedCompany({ ...editedCompany, website: e.target.value })
                  }
                />
              </div>
            </div>
            
            {isLeadsCampaign && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email">Company Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="contact@company.com"
                    value={editedCompany.email}
                    onChange={(e) =>
                      setEditedCompany({ ...editedCompany, email: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="batch">Batch</Label>
                  <Select
                    value={editedCompany.batch || "__none__"}
                    onValueChange={(value) =>
                      setEditedCompany({ ...editedCompany, batch: value === "__none__" ? "" : value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a batch" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No batch</SelectItem>
                      {batches.map((batch) => (
                        <SelectItem key={batch.id} value={batch.id}>
                          {batch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              {campaign?.industry_type === "dropdown" && campaign.industry_options?.length > 0 ? (
                <Select
                  value={editedCompany.industry}
                  onValueChange={(value) =>
                    setEditedCompany({ ...editedCompany, industry: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an industry" />
                  </SelectTrigger>
                  <SelectContent>
                    {campaign.industry_options.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="industry"
                  placeholder="e.g., Technology, Finance"
                  value={editedCompany.industry}
                  onChange={(e) =>
                    setEditedCompany({ ...editedCompany, industry: e.target.value })
                  }
                />
              )}
            </div>

            {isLeadsCampaign && (
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Enter a description of this company..."
                  value={editedCompany.description}
                  onChange={(e) =>
                    setEditedCompany({ ...editedCompany, description: e.target.value })
                  }
                  rows={4}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Statistics / AI Scoring Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {isLeadsCampaign ? (
                <>
                  <Star className="h-5 w-5" />
                  AI Scoring
                </>
              ) : (
                <>
                  <Users className="h-5 w-5" />
                  Statistics
                </>
              )}
            </CardTitle>
            <CardDescription>
              {isLeadsCampaign ? "Lead qualification results" : "Company overview"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {isLeadsCampaign ? (
                <>
                  {/* AI Score */}
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-muted-foreground">AI Score</span>
                      {company.ai_score !== undefined ? (
                        <div className="flex items-center gap-2">
                          <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
                          <span className="text-2xl font-bold">{company.ai_score}</span>
                          {company.ai_confidence && (
                            <span className="text-sm text-muted-foreground">
                              ({Math.round(company.ai_confidence * 100)}%)
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Not scored</span>
                      )}
                    </div>
                    {company.ai_classification && (
                      <Badge variant="default" className="mt-2">
                        {company.ai_classification}
                      </Badge>
                    )}
                  </div>

                  {/* AI Reasons */}
                  {company.ai_reasons && company.ai_reasons.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">Reasons</p>
                      <ul className="text-sm space-y-1">
                        {company.ai_reasons.map((reason, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-primary">•</span>
                            <span>{reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Custom AI Outputs */}
                  {aiConfigs.length > 0 && aiConfigs[0].custom_outputs?.map((output) => {
                    const fieldName = `ai_custom_${output.name}`;
                    const value = (company as Record<string, unknown>)[fieldName];
                    if (value === undefined || value === null) return null;
                    return (
                      <div key={output.id} className="pt-2 border-t">
                        <p className="text-sm text-muted-foreground mb-1">{output.label}</p>
                        {output.type === "boolean" ? (
                          <Badge variant={value === "true" ? "default" : "secondary"}>
                            {String(value)}
                          </Badge>
                        ) : (
                          <p className="text-sm">{String(value)}</p>
                        )}
                      </div>
                    );
                  })}

                  {company.ai_scored_at && (
                    <p className="text-xs text-muted-foreground pt-2 border-t">
                      Last scored: {new Date(company.ai_scored_at).toLocaleString()}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary" />
                      <span className="text-sm font-medium">Total Contacts</span>
                    </div>
                    <span className="text-2xl font-bold">{contacts.length}</span>
                  </div>
                </>
              )}
              
              {company.industry && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground mb-1">Industry</p>
                  <Badge variant="secondary">
                    <Briefcase className="h-3 w-3 mr-1" />
                    {company.industry}
                  </Badge>
                </div>
              )}

              {company.batch && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground mb-1">Batch</p>
                  <Link 
                    href={`/campaigns/${campaignId}/batches/${company.batch}`}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <Layers className="h-3 w-3" />
                    {batches.find(b => b.id === company.batch)?.name || "View Batch"}
                  </Link>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contacts/People List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {isLeadsCampaign ? "People" : "Contacts"} at {company.name}
          </CardTitle>
          <CardDescription>
            All {isLeadsCampaign ? "people" : "contacts"} associated with this company ({contacts.length} total)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {contacts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No {isLeadsCampaign ? "people" : "contacts"} associated with this company yet.</p>
              <Button asChild className="mt-4" variant="outline">
                <Link href={`/campaigns/${campaignId}`}>
                  Add {isLeadsCampaign ? "People" : "Contacts"}
                </Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Title</TableHead>
                  {!isLeadsCampaign && <TableHead>Funnel Stage</TableHead>}
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        {contact.first_name} {contact.last_name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        {contact.email}
                      </div>
                    </TableCell>
                    <TableCell>{contact.title || "-"}</TableCell>
                    {!isLeadsCampaign && (
                      <TableCell>
                        <Badge 
                          variant="secondary"
                          style={{ 
                            backgroundColor: `${getContactStageColor(contact.id)}20`,
                            borderColor: getContactStageColor(contact.id),
                            borderWidth: 1,
                          }}
                        >
                          <div
                            className="w-2 h-2 rounded-full mr-2"
                            style={{ backgroundColor: getContactStageColor(contact.id) }}
                          />
                          {getContactStageName(contact.id)}
                        </Badge>
                      </TableCell>
                    )}
                    <TableCell>
                      {!isLeadsCampaign && (
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/campaigns/${campaignId}/contacts/${contact.id}`}>
                            View
                          </Link>
                        </Button>
                      )}
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
