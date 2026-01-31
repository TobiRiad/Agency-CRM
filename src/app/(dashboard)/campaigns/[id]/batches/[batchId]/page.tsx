"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  getClientPB,
  getCampaign,
  getBatch,
  getContactsByBatch,
  getCompaniesByBatch,
  getCompanies,
  getCustomFields,
  getFieldValuesForContacts,
  createContact,
  deleteContact,
  createCompany,
  getFunnelStages,
  getContactStages,
  setContactStage,
  getCurrentUser,
  getContactsByCompany,
  getAIScoringConfigs,
} from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import {
  Plus,
  MoreVertical,
  Trash2,
  Edit,
  Search,
  Filter,
  Send,
  ArrowLeft,
  ChevronRight,
  FileText,
  Users,
  Mail,
  ExternalLink,
  Star,
  Sparkles,
  Loader2,
} from "lucide-react";
import type { Campaign, Contact, Company, CustomField, ContactFieldValue, FunnelStage, ContactStage, Batch, AIScoringConfig } from "@/types";

export default function BatchDetailPage() {
  const params = useParams();
  const campaignId = params.id as string;
  const batchId = params.batchId as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [fieldValues, setFieldValues] = useState<Map<string, Map<string, string>>>(new Map());
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);
  const [contactStageMap, setContactStageMap] = useState<Map<string, string>>(new Map());
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [isAddCompanyOpen, setIsAddCompanyOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // For leads campaigns
  const [companyContacts, setCompanyContacts] = useState<Map<string, Contact[]>>(new Map());
  const [aiConfigs, setAiConfigs] = useState<AIScoringConfig[]>([]);
  const [scoringCompanyId, setScoringCompanyId] = useState<string | null>(null);

  const [newContact, setNewContact] = useState({
    email: "",
    first_name: "",
    last_name: "",
    title: "",
    company: "",
  });

  const [newCompany, setNewCompany] = useState({
    name: "",
    website: "",
    industry: "",
    email: "",
    description: "",
  });

  // State for inline company creation during contact creation
  const [isCreatingNewCompany, setIsCreatingNewCompany] = useState(false);
  const [inlineNewCompany, setInlineNewCompany] = useState({
    name: "",
    website: "",
    industry: "",
  });

  const loadData = useCallback(async () => {
    try {
      const pb = getClientPB();
      const [campaignData, batchData] = await Promise.all([
        getCampaign(pb, campaignId),
        getBatch(pb, batchId),
      ]);

      setCampaign(campaignData);
      setBatch(batchData);

      if (campaignData.kind === 'leads') {
        // Leads campaign: load companies in this batch
        const [companiesData, allCompaniesData, configs] = await Promise.all([
          getCompaniesByBatch(pb, batchId),
          getCompanies(pb, campaignId),
          getAIScoringConfigs(pb, campaignId),
        ]);
        
        setCompanies(companiesData);
        setAllCompanies(allCompaniesData);
        setAiConfigs(configs);

        // Load contacts for each company
        const contactsByCompany = new Map<string, Contact[]>();
        for (const company of companiesData) {
          const companyPeople = await getContactsByCompany(pb, company.id);
          contactsByCompany.set(company.id, companyPeople);
        }
        setCompanyContacts(contactsByCompany);
      } else {
        // Outreach campaign: load contacts in this batch
        const [contactsData, companiesData, fieldsData, stagesData, contactStagesData] = await Promise.all([
          getContactsByBatch(pb, batchId),
          getCompanies(pb, campaignId),
          getCustomFields(pb, campaignId),
          getFunnelStages(pb, campaignId),
          getContactStages(pb, campaignId),
        ]);

        setContacts(contactsData);
        setAllCompanies(companiesData);
        setCustomFields(fieldsData);
        setFunnelStages(stagesData.sort((a, b) => a.order - b.order));

        // Create contact -> stage mapping
        const stageMap = new Map<string, string>();
        contactStagesData.forEach((cs: ContactStage) => {
          stageMap.set(cs.contact, cs.stage);
        });
        setContactStageMap(stageMap);

        // Load field values for all contacts
        if (contactsData.length > 0) {
          const contactIds = contactsData.map((c) => c.id);
          const values = await getFieldValuesForContacts(pb, contactIds);

          // Organize field values by contact -> field -> value
          const valueMap = new Map<string, Map<string, string>>();
          values.forEach((v: ContactFieldValue) => {
            if (!valueMap.has(v.contact)) {
              valueMap.set(v.contact, new Map());
            }
            valueMap.get(v.contact)!.set(v.custom_field, v.value);
          });
          setFieldValues(valueMap);
        }
      }
    } catch (error) {
      console.error("Failed to load batch data:", error);
      toast({
        title: "Error",
        description: "Failed to load batch data.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [campaignId, batchId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Outreach: Add contact handler
  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContact.email.trim()) return;

    setIsCreating(true);
    try {
      const pb = getClientPB();
      
      let companyId = newContact.company;
      
      // If creating a new company inline, create it first
      if (isCreatingNewCompany && inlineNewCompany.name.trim()) {
        const currentUser = getCurrentUser(pb);
        const newCompanyData = await createCompany(pb, {
          name: inlineNewCompany.name,
          website: inlineNewCompany.website,
          industry: inlineNewCompany.industry,
          campaign: campaignId,
          created_by: currentUser?.id,
        });
        companyId = newCompanyData.id;
      }
      
      const currentUser = getCurrentUser(pb);
      await createContact(pb, {
        email: newContact.email,
        first_name: newContact.first_name,
        last_name: newContact.last_name,
        title: newContact.title,
        company: companyId || undefined,
        batch: batchId, // Auto-assign to this batch
        campaign: campaignId,
        created_by: currentUser?.id,
      });

      toast({
        title: "Contact added",
        description: isCreatingNewCompany && inlineNewCompany.name.trim() 
          ? "Contact and company have been added to this batch."
          : "The contact has been added to this batch.",
        variant: "success",
      });

      setNewContact({
        email: "",
        first_name: "",
        last_name: "",
        title: "",
        company: "",
      });
      setIsCreatingNewCompany(false);
      setInlineNewCompany({ name: "", website: "", industry: "" });
      setIsAddContactOpen(false);
      loadData();
    } catch (error) {
      console.error("Failed to add contact:", error);
      toast({
        title: "Error",
        description: "Failed to add contact. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  // Leads: Add company handler
  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompany.name.trim()) return;

    setIsCreating(true);
    try {
      const pb = getClientPB();
      const currentUser = getCurrentUser(pb);
      await createCompany(pb, {
        name: newCompany.name,
        website: newCompany.website,
        industry: newCompany.industry,
        email: newCompany.email || undefined,
        description: newCompany.description || undefined,
        batch: batchId, // Auto-assign to this batch
        campaign: campaignId,
        created_by: currentUser?.id,
      });

      toast({
        title: "Company added",
        description: "The company has been added to this batch.",
        variant: "success",
      });

      setNewCompany({
        name: "",
        website: "",
        industry: "",
        email: "",
        description: "",
      });
      setIsAddCompanyOpen(false);
      loadData();
    } catch (error) {
      console.error("Failed to add company:", error);
      toast({
        title: "Error",
        description: "Failed to add company. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!confirm("Are you sure you want to delete this contact?")) {
      return;
    }

    try {
      const pb = getClientPB();
      await deleteContact(pb, contactId);
      toast({
        title: "Contact deleted",
        description: "The contact has been removed.",
      });
      loadData();
    } catch (error) {
      console.error("Failed to delete contact:", error);
      toast({
        title: "Error",
        description: "Failed to delete contact.",
        variant: "destructive",
      });
    }
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

  const handleStageChange = async (contactId: string, newStageId: string) => {
    // Optimistically update UI
    const previousStageId = contactStageMap.get(contactId);
    const newStageMap = new Map(contactStageMap);
    newStageMap.set(contactId, newStageId);
    setContactStageMap(newStageMap);

    try {
      const pb = getClientPB();
      await setContactStage(pb, contactId, newStageId);
      toast({
        title: "Stage updated",
        description: "Contact stage has been updated.",
      });
    } catch (error) {
      // Revert on error
      const revertMap = new Map(contactStageMap);
      if (previousStageId) {
        revertMap.set(contactId, previousStageId);
      } else {
        revertMap.delete(contactId);
      }
      setContactStageMap(revertMap);
      toast({
        title: "Error",
        description: "Failed to update contact stage.",
        variant: "destructive",
      });
    }
  };

  const handleScoreLead = async (companyId: string) => {
    if (aiConfigs.length === 0) {
      toast({
        title: "No AI Config",
        description: "Please set up an AI scoring config in campaign settings first.",
        variant: "destructive",
      });
      return;
    }

    setScoringCompanyId(companyId);
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
      setScoringCompanyId(null);
    }
  };

  const getContactStageId = (contactId: string): string | undefined => {
    return contactStageMap.get(contactId);
  };

  const filteredContacts = contacts.filter((contact) => {
    // Apply stage filter
    if (stageFilter !== "all") {
      const contactStageId = contactStageMap.get(contact.id);
      if (contactStageId !== stageFilter) return false;
    }

    // Apply search filter
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      contact.email.toLowerCase().includes(query) ||
      contact.first_name?.toLowerCase().includes(query) ||
      contact.last_name?.toLowerCase().includes(query) ||
      contact.title?.toLowerCase().includes(query) ||
      contact.expand?.company?.name.toLowerCase().includes(query)
    );
  });

  const filteredCompanies = companies.filter((company) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      company.name.toLowerCase().includes(query) ||
      company.email?.toLowerCase().includes(query) ||
      company.website?.toLowerCase().includes(query) ||
      company.industry?.toLowerCase().includes(query)
    );
  });

  const getFieldValue = (contactId: string, fieldId: string): string => {
    return fieldValues.get(contactId)?.get(fieldId) || "";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!campaign || !batch) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Batch not found</h2>
        <p className="text-muted-foreground mt-2">This batch may have been deleted.</p>
        <Button asChild className="mt-4">
          <Link href={`/campaigns/${campaignId}`}>Back to Campaign</Link>
        </Button>
      </div>
    );
  }

  // LEADS CAMPAIGN VIEW
  if (campaign.kind === 'leads') {
    return (
      <div className="space-y-6">
        {/* Breadcrumb & Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href={`/campaigns/${campaignId}`} className="hover:text-foreground">
              {campaign.name}
            </Link>
            <ChevronRight className="h-4 w-4" />
            <span className="text-foreground font-medium">{batch.name}</span>
          </div>

          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/campaigns/${campaignId}`}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">{batch.name}</h1>
              <p className="text-muted-foreground">
                {companies.length} companies in this batch
              </p>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search companies..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <Dialog open={isAddCompanyOpen} onOpenChange={setIsAddCompanyOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Company
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <form onSubmit={handleAddCompany}>
                <DialogHeader>
                  <DialogTitle>Add Company to {batch.name}</DialogTitle>
                  <DialogDescription>
                    Add a new lead company to this batch.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="company_name">Company Name *</Label>
                    <Input
                      id="company_name"
                      value={newCompany.name}
                      onChange={(e) =>
                        setNewCompany({ ...newCompany, name: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="website">Website</Label>
                      <Input
                        id="website"
                        type="url"
                        placeholder="https://example.com"
                        value={newCompany.website}
                        onChange={(e) =>
                          setNewCompany({ ...newCompany, website: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Company Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="sales@company.com"
                        value={newCompany.email}
                        onChange={(e) =>
                          setNewCompany({ ...newCompany, email: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      placeholder="Brief description of the company..."
                      value={newCompany.description}
                      onChange={(e) =>
                        setNewCompany({ ...newCompany, description: e.target.value })
                      }
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="industry">Industry</Label>
                    {campaign?.industry_type === "dropdown" && campaign.industry_options?.length > 0 ? (
                      <Select
                        value={newCompany.industry}
                        onValueChange={(value) =>
                          setNewCompany({ ...newCompany, industry: value })
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
                        placeholder="e.g., SaaS, Agency"
                        value={newCompany.industry}
                        onChange={(e) =>
                          setNewCompany({ ...newCompany, industry: e.target.value })
                        }
                      />
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAddCompanyOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isCreating}>
                    {isCreating ? "Adding..." : "Add Company"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Companies Table */}
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Website</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>People</TableHead>
                <TableHead>AI Score</TableHead>
                <TableHead>Classification</TableHead>
                {aiConfigs.length > 0 && aiConfigs[0].custom_outputs?.map((output) => (
                  <TableHead key={output.id}>{output.label}</TableHead>
                ))}
                <TableHead className="w-32">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCompanies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7 + (aiConfigs[0]?.custom_outputs?.length || 0)} className="text-center py-12 text-muted-foreground">
                    {searchQuery
                      ? "No companies match your search"
                      : "No companies in this batch yet. Add your first company."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredCompanies.map((company) => {
                  const people = companyContacts.get(company.id) || [];
                  return (
                    <Fragment key={company.id}>
                      <TableRow className="bg-slate-50 dark:bg-slate-900/50">
                        <TableCell className="font-medium">
                          <Link 
                            href={`/campaigns/${campaignId}/companies/${company.id}`}
                            className="flex items-center gap-2 hover:text-primary hover:underline"
                          >
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            {company.name}
                          </Link>
                          {company.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                              {company.description}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          {company.website ? (
                            <a
                              href={company.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline flex items-center gap-1"
                            >
                              {company.website}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>{company.email || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{people.length}</Badge>
                        </TableCell>
                        <TableCell>
                          {company.ai_score !== undefined ? (
                            <div className="flex items-center gap-2">
                              <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                              <span className="font-medium">{company.ai_score}</span>
                              {company.ai_confidence && (
                                <span className="text-xs text-muted-foreground">
                                  ({Math.round(company.ai_confidence * 100)}%)
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">Not scored</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {company.ai_classification ? (
                            <Badge>{company.ai_classification}</Badge>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        {aiConfigs.length > 0 && aiConfigs[0].custom_outputs?.map((output) => {
                          const fieldName = `ai_custom_${output.name}`;
                          const value = (company as Record<string, unknown>)[fieldName];
                          return (
                            <TableCell key={output.id}>
                              {value !== undefined && value !== null ? (
                                output.type === "boolean" ? (
                                  <Badge variant={value === "true" ? "default" : value === "false" ? "secondary" : "outline"}>
                                    {String(value)}
                                  </Badge>
                                ) : (
                                  <span className="text-sm">{String(value)}</span>
                                )
                              ) : (
                                <span className="text-muted-foreground text-sm">-</span>
                              )}
                            </TableCell>
                          );
                        })}
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {aiConfigs.length > 0 && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleScoreLead(company.id)}
                                disabled={scoringCompanyId === company.id}
                              >
                                {scoringCompanyId === company.id ? (
                                  <>
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                    Running...
                                  </>
                                ) : (
                                  <>
                                    <Sparkles className="h-3 w-3 mr-1" />
                                    Run AI
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {/* People under company */}
                      {people.length > 0 && people.map((person) => (
                        <TableRow key={person.id} className="bg-white dark:bg-slate-800">
                          <TableCell className="pl-8">
                            <div className="flex items-center gap-2">
                              <Users className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm">
                                {person.first_name} {person.last_name}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell colSpan={2}>
                            <div className="flex items-center gap-2 text-sm">
                              <Mail className="h-3 w-3 text-muted-foreground" />
                              {person.email}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">{person.title || "-"}</span>
                          </TableCell>
                          <TableCell colSpan={3 + (aiConfigs[0]?.custom_outputs?.length || 0)}></TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="text-sm text-muted-foreground">
          Showing {filteredCompanies.length} of {companies.length} companies
        </div>
      </div>
    );
  }

  // OUTREACH CAMPAIGN VIEW (contacts)
  return (
    <div className="space-y-6">
      {/* Breadcrumb & Header */}
      <div className="space-y-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href={`/campaigns/${campaignId}`} className="hover:text-foreground">
            {campaign.name}
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-foreground font-medium">{batch.name}</span>
        </div>

        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/campaigns/${campaignId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{batch.name}</h1>
            <p className="text-muted-foreground">
              {contacts.length} contacts in this batch
            </p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-[200px]">
              <div className="flex items-center gap-2 min-w-0">
                <Filter className="h-4 w-4 flex-shrink-0" />
                {(() => {
                  if (stageFilter === "all") {
                    return <span className="truncate">All Stages</span>;
                  }
                  const stage = funnelStages.find(s => s.id === stageFilter);
                  if (stage) {
                    return (
                      <>
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: stage.color || '#6b7280' }}
                        />
                        <span className="truncate">{stage.name}</span>
                      </>
                    );
                  }
                  return <span className="truncate">Filter by stage</span>;
                })()}
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {funnelStages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id}>
                  <span className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: stage.color || '#6b7280' }}
                    />
                    <span className="truncate">{stage.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          {selectedContacts.size > 0 && (
            <Button variant="default" asChild>
              <Link href={`/campaigns/${campaignId}/send?contacts=${Array.from(selectedContacts).join(",")}`}>
                <Send className="mr-2 h-4 w-4" />
                Send to {selectedContacts.size} selected
              </Link>
            </Button>
          )}
          <Dialog open={isAddContactOpen} onOpenChange={setIsAddContactOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Contact
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleAddContact}>
                <DialogHeader>
                  <DialogTitle>Add Contact to {batch.name}</DialogTitle>
                  <DialogDescription>
                    Add a new contact to this batch.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="first_name">First Name</Label>
                      <Input
                        id="first_name"
                        value={newContact.first_name}
                        onChange={(e) =>
                          setNewContact({ ...newContact, first_name: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="last_name">Last Name</Label>
                      <Input
                        id="last_name"
                        value={newContact.last_name}
                        onChange={(e) =>
                          setNewContact({ ...newContact, last_name: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={newContact.email}
                      onChange={(e) =>
                        setNewContact({ ...newContact, email: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="title">Title</Label>
                    <Input
                      id="title"
                      placeholder="e.g., CEO, Marketing Manager"
                      value={newContact.title}
                      onChange={(e) =>
                        setNewContact({ ...newContact, title: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company">Company</Label>
                    {!isCreatingNewCompany ? (
                      <div className="space-y-2">
                        <Select
                          value={newContact.company}
                          onValueChange={(value) => {
                            if (value === "__create_new__") {
                              setIsCreatingNewCompany(true);
                              setNewContact({ ...newContact, company: "" });
                            } else {
                              setNewContact({ ...newContact, company: value });
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a company" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__create_new__">
                              <span className="flex items-center gap-2 text-primary">
                                <Plus className="h-4 w-4" />
                                Create new company
                              </span>
                            </SelectItem>
                            {allCompanies.map((company) => (
                              <SelectItem key={company.id} value={company.id}>
                                {company.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="space-y-3 p-3 border rounded-lg bg-muted/50">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">New Company</p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setIsCreatingNewCompany(false);
                              setInlineNewCompany({ name: "", website: "", industry: "" });
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                        <Input
                          placeholder="Company name *"
                          value={inlineNewCompany.name}
                          onChange={(e) =>
                            setInlineNewCompany({ ...inlineNewCompany, name: e.target.value })
                          }
                        />
                        <Input
                          placeholder="Website (optional)"
                          value={inlineNewCompany.website}
                          onChange={(e) =>
                            setInlineNewCompany({ ...inlineNewCompany, website: e.target.value })
                          }
                        />
                        {campaign?.industry_type === "dropdown" && campaign.industry_options?.length > 0 ? (
                          <Select
                            value={inlineNewCompany.industry}
                            onValueChange={(value) =>
                              setInlineNewCompany({ ...inlineNewCompany, industry: value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select an industry (optional)" />
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
                            placeholder="Industry (optional)"
                            value={inlineNewCompany.industry}
                            onChange={(e) =>
                              setInlineNewCompany({ ...inlineNewCompany, industry: e.target.value })
                            }
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAddContactOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isCreating}>
                    {isCreating ? "Adding..." : "Add Contact"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Contacts Table */}
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
              <TableHead>Title</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Funnel Stage</TableHead>
              <TableHead>Created By</TableHead>
              {customFields.map((field) => (
                <TableHead key={field.id}>{field.name}</TableHead>
              ))}
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredContacts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8 + customFields.length}
                  className="text-center py-8 text-muted-foreground"
                >
                  {searchQuery || stageFilter !== "all"
                    ? "No contacts match your filters"
                    : "No contacts in this batch yet. Add your first contact."}
                </TableCell>
              </TableRow>
            ) : (
              filteredContacts.map((contact) => (
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
                    <Link 
                      href={`/campaigns/${campaignId}/contacts/${contact.id}`}
                      className="hover:underline"
                    >
                      {contact.first_name} {contact.last_name}
                    </Link>
                  </TableCell>
                  <TableCell>{contact.email}</TableCell>
                  <TableCell>{contact.title || "-"}</TableCell>
                  <TableCell>
                    {contact.expand?.company?.name || "-"}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={getContactStageId(contact.id) || ""}
                      onValueChange={(value) => {
                        if (value) {
                          handleStageChange(contact.id, value);
                        }
                      }}
                    >
                      <SelectTrigger className="w-[160px] h-8 text-sm">
                        <SelectValue placeholder="Select stage">
                          {(() => {
                            const stageId = getContactStageId(contact.id);
                            const stage = funnelStages.find(s => s.id === stageId);
                            if (stage) {
                              return (
                                <span className="flex items-center gap-2">
                                  <span
                                    className="w-2 h-2 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: stage.color || '#6b7280' }}
                                  />
                                  <span className="truncate">{stage.name}</span>
                                </span>
                              );
                            }
                            return "Select stage";
                          })()}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {funnelStages.map((stage) => (
                          <SelectItem key={stage.id} value={stage.id}>
                            <span className="flex items-center gap-2">
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: stage.color || '#6b7280' }}
                              />
                              {stage.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {contact.expand?.created_by?.name || contact.expand?.created_by?.email || "-"}
                  </TableCell>
                  {customFields.map((field) => (
                    <TableCell key={field.id}>
                      {field.field_type === "boolean" ? (
                        <Badge
                          variant={
                            getFieldValue(contact.id, field.id) === "true"
                              ? "success"
                              : "secondary"
                          }
                        >
                          {getFieldValue(contact.id, field.id) === "true"
                            ? "Yes"
                            : "No"}
                        </Badge>
                      ) : (
                        getFieldValue(contact.id, field.id) || "-"
                      )}
                    </TableCell>
                  ))}
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/campaigns/${campaignId}/contacts/${contact.id}`}>
                            <Edit className="mr-2 h-4 w-4" />
                            View Details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDeleteContact(contact.id)}
                          className="text-red-600"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-sm text-muted-foreground">
        Showing {filteredContacts.length} of {contacts.length} contacts
        {selectedContacts.size > 0 && ` • ${selectedContacts.size} selected`}
      </div>
    </div>
  );
}
