"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  getClientPB,
  getCampaign,
  getBatch,
  getBatches,
  getContactsByBatch,
  getCompaniesByBatch,
  getCompanies,
  getCustomFields,
  getFieldValuesForContacts,
  createContact,
  updateContact,
  deleteContact,
  createCompany,
  deleteCompany,
  getFunnelStages,
  getContactStages,
  setContactStage,
  getCurrentUser,
  getContactsByCompany,
  getAIScoringConfigs,
  pushCompanyToOutreach,
  getOutreachCampaigns,
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
  ArrowRight,
  ChevronRight,
  FileText,
  Users,
  Mail,
  ExternalLink,
  Star,
  Sparkles,
  Loader2,
  Copy,
} from "lucide-react";
import type { Campaign, Contact, Company, CustomField, ContactFieldValue, FunnelStage, ContactStage, Batch, AIScoringConfig, FirecrawlPageType, FirecrawlUrls } from "@/types";
import { Globe, AlertTriangle, Check } from "lucide-react";

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

  // People to add with new company
  const [newCompanyPeople, setNewCompanyPeople] = useState<Array<{
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    title: string;
  }>>([]);
  const [newPersonInput, setNewPersonInput] = useState({
    email: "",
    first_name: "",
    last_name: "",
    title: "",
  });

  // Firecrawl URL mapping state
  const [isMapping, setIsMapping] = useState(false);
  const [mapResult, setMapResult] = useState<{
    urls: FirecrawlUrls;
    found: FirecrawlPageType[];
    notFound: FirecrawlPageType[];
  } | null>(null);
  const [manualUrls, setManualUrls] = useState<Partial<FirecrawlUrls>>({});
  const [showUrlPreview, setShowUrlPreview] = useState(false);

  // State for inline company creation during contact creation
  const [isCreatingNewCompany, setIsCreatingNewCompany] = useState(false);
  const [inlineNewCompany, setInlineNewCompany] = useState({
    name: "",
    website: "",
    industry: "",
  });

  // State for duplicate company check
  const [duplicateCompany, setDuplicateCompany] = useState<Company | null>(null);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);

  // Real-time duplicate check state
  const [duplicateStatus, setDuplicateStatus] = useState<{
    checking: boolean;
    exists: boolean;
    matchType: 'name' | 'website' | null;
    companyName?: string;
  }>({ checking: false, exists: false, matchType: null });

  // Hunter.io state
  const [hunterPeople, setHunterPeople] = useState<Array<{
    email: string;
    first_name: string;
    last_name: string;
    position: string;
    confidence: number;
  }>>([]);
  const [selectedHunterPeople, setSelectedHunterPeople] = useState<Set<string>>(new Set());
  const [isSearchingHunter, setIsSearchingHunter] = useState(false);
  const [hunterSearched, setHunterSearched] = useState(false);

  // State for inline contact editing
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [editingContactData, setEditingContactData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    title: "",
  });

  // State for push to outreach
  const [outreachCampaigns, setOutreachCampaigns] = useState<Campaign[]>([]);
  const [pushingCompanyId, setPushingCompanyId] = useState<string | null>(null);
  const [selectedOutreachCampaign, setSelectedOutreachCampaign] = useState<string>("");
  const [selectedFunnelStage, setSelectedFunnelStage] = useState<string>("");
  const [selectedOutreachBatch, setSelectedOutreachBatch] = useState<string>("");
  const [isPushDialogOpen, setIsPushDialogOpen] = useState(false);
  const [outreachCampaignFunnelStages, setOutreachCampaignFunnelStages] = useState<FunnelStage[]>([]);
  const [outreachCampaignBatches, setOutreachCampaignBatches] = useState<Batch[]>([]);

  // State for adding person to company
  const [selectedCompanyForPerson, setSelectedCompanyForPerson] = useState<string>("");
  const [isAddPersonOpen, setIsAddPersonOpen] = useState(false);
  const [newPerson, setNewPerson] = useState({
    email: "",
    first_name: "",
    last_name: "",
    title: "",
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
        const user = getCurrentUser(pb);
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

        // Load outreach campaigns for push dropdown
        if (user) {
          const outreach = await getOutreachCampaigns(pb, user.id);
          setOutreachCampaigns(outreach);
        }
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

  // Debounced real-time duplicate check
  useEffect(() => {
    if (!newCompany.name.trim() && !newCompany.website.trim()) {
      setDuplicateStatus({ checking: false, exists: false, matchType: null });
      return;
    }

    if (!isAddCompanyOpen || showDuplicateWarning || showUrlPreview) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      setDuplicateStatus(prev => ({ ...prev, checking: true }));
      try {
        const response = await fetch('/api/companies/check-duplicate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newCompany.name.trim(),
            website: newCompany.website.trim(),
            campaignId,
          }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (data.success) {
          setDuplicateStatus({
            checking: false,
            exists: data.exists,
            matchType: data.matchType,
            companyName: data.companyName,
          });
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setDuplicateStatus({ checking: false, exists: false, matchType: null });
        }
      }
    }, 400);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [newCompany.name, newCompany.website, campaignId, isAddCompanyOpen, showDuplicateWarning, showUrlPreview]);

  // Hunter.io search function
  const handleHunterSearch = async () => {
    if (!newCompany.website.trim()) return;

    setIsSearchingHunter(true);
    setHunterPeople([]);
    setSelectedHunterPeople(new Set());

    try {
      const response = await fetch('/api/hunter/domain-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: newCompany.website }),
      });
      const data = await response.json();

      if (data.success && data.people?.length > 0) {
        setHunterPeople(data.people);
        toast({
          title: "People Found",
          description: `Found ${data.people.length} people at ${data.domain}`,
        });
      } else if (data.success) {
        toast({
          title: "No People Found",
          description: "Hunter.io didn't find any email addresses for this domain.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Search Failed",
          description: data.error || "Failed to search Hunter.io",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Hunter search error:", error);
      toast({
        title: "Error",
        description: "Failed to search Hunter.io",
        variant: "destructive",
      });
    } finally {
      setIsSearchingHunter(false);
      setHunterSearched(true);
    }
  };

  // Add selected Hunter people to the newCompanyPeople list
  const handleAddHunterPeople = () => {
    const selected = hunterPeople.filter(p => selectedHunterPeople.has(p.email));
    const newPeople = selected.map(p => ({
      id: crypto.randomUUID(),
      email: p.email,
      first_name: p.first_name,
      last_name: p.last_name,
      title: p.position,
    }));
    setNewCompanyPeople([...newCompanyPeople, ...newPeople]);
    setHunterPeople([]);
    setSelectedHunterPeople(new Set());
    toast({
      title: "People Added",
      description: `Added ${newPeople.length} people to the company`,
    });
  };

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

  // Run Firecrawl mapping to discover URLs
  const handleMapUrls = async () => {
    if (!newCompany.website) return;

    setIsMapping(true);
    try {
      const response = await fetch("/api/firecrawl/map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteUrl: newCompany.website,
          pages: campaign?.firecrawl_pages || ["homepage", "about"],
        }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to map URLs");
      }

      setMapResult({
        urls: data.urls,
        found: data.found,
        notFound: data.notFound,
      });
      setManualUrls({});
      setShowUrlPreview(true);
    } catch (error) {
      console.error("Failed to map URLs:", error);
      toast({
        title: "URL Discovery Failed",
        description: error instanceof Error ? error.message : "Failed to discover URLs. You can still save the company.",
        variant: "destructive",
      });
      // Allow saving without URLs
      setShowUrlPreview(true);
      setMapResult({ urls: { homepage: newCompany.website }, found: ["homepage"], notFound: [] });
    } finally {
      setIsMapping(false);
    }
  };

  // Helper to extract domain from URL
  const extractDomain = (url: string): string => {
    try {
      const urlObj = new URL(url.startsWith("http") ? url : `https://${url}`);
      return urlObj.hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  };

  // Check for duplicate companies by website or name
  const checkForDuplicates = async (): Promise<Company | null> => {
    const pb = getClientPB();

    // Check by website domain if provided
    if (newCompany.website) {
      const domain = extractDomain(newCompany.website);
      // Search all companies in the campaign
      const companiesList = await getCompanies(pb, campaignId);

      for (const company of companiesList) {
        if (company.website) {
          const existingDomain = extractDomain(company.website);
          if (existingDomain === domain) {
            return company;
          }
        }
      }
    }

    // Also check by similar name (case-insensitive exact match)
    const nameLower = newCompany.name.trim().toLowerCase();
    const companiesList = await getCompanies(pb, campaignId);

    for (const company of companiesList) {
      if (company.name.toLowerCase() === nameLower) {
        return company;
      }
    }

    return null;
  };

  // Handle form submission - either map URLs or save directly
  const handleAddCompanySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompany.name.trim()) return;

    // Check for duplicates first (only if not already showing duplicate warning)
    if (!showDuplicateWarning) {
      const duplicate = await checkForDuplicates();
      if (duplicate) {
        setDuplicateCompany(duplicate);
        setShowDuplicateWarning(true);
        return;
      }
    }

    // If Firecrawl is enabled, has a website, and we haven't mapped yet, map first
    if (campaign?.enable_firecrawl && newCompany.website && !showUrlPreview) {
      await handleMapUrls();
      return;
    }

    // Otherwise, save the company
    await handleSaveCompany();
  };

  // Handle proceeding despite duplicate warning
  const handleProceedWithDuplicate = async () => {
    setShowDuplicateWarning(false);
    setDuplicateCompany(null);

    // If Firecrawl is enabled, has a website, and we haven't mapped yet, map first
    if (campaign?.enable_firecrawl && newCompany.website && !showUrlPreview) {
      await handleMapUrls();
      return;
    }

    await handleSaveCompany();
  };

  // Actually save the company (after URL preview or directly if Firecrawl disabled)
  const handleSaveCompany = async () => {
    setIsCreating(true);
    try {
      const pb = getClientPB();
      const currentUser = getCurrentUser(pb);

      // Merge discovered URLs with manual URLs
      const firecrawlUrls = mapResult?.urls
        ? { ...mapResult.urls, ...manualUrls }
        : undefined;

      const newCompanyRecord = await createCompany(pb, {
        name: newCompany.name,
        website: newCompany.website,
        industry: newCompany.industry,
        email: newCompany.email || undefined,
        description: newCompany.description || undefined,
        batch: batchId, // Auto-assign to this batch
        campaign: campaignId,
        created_by: currentUser?.id,
        firecrawl_urls: firecrawlUrls,
        firecrawl_mapped_at: firecrawlUrls ? new Date().toISOString() : undefined,
      });

      // Create people if any were added
      let peopleCreated = 0;
      if (newCompanyPeople.length > 0) {
        for (const person of newCompanyPeople) {
          try {
            await createContact(pb, {
              email: person.email,
              first_name: person.first_name,
              last_name: person.last_name,
              title: person.title,
              company: newCompanyRecord.id,
              campaign: campaignId,
              created_by: currentUser?.id,
            });
            peopleCreated++;
          } catch (err) {
            console.error("Failed to create person:", err);
          }
        }
      }

      toast({
        title: "Company added",
        description: peopleCreated > 0
          ? `Company added with ${peopleCreated} contact(s).`
          : "The company has been added to this batch.",
        variant: "success",
      });

      // Reset all state
      setNewCompany({
        name: "",
        website: "",
        industry: "",
        email: "",
        description: "",
      });
      setNewCompanyPeople([]);
      setNewPersonInput({ email: "", first_name: "", last_name: "", title: "" });
      setMapResult(null);
      setManualUrls({});
      setShowUrlPreview(false);
      setShowDuplicateWarning(false);
      setDuplicateCompany(null);
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

  // Reset Firecrawl state when dialog closes
  const handleCompanyDialogClose = (open: boolean) => {
    setIsAddCompanyOpen(open);
    if (!open) {
      setMapResult(null);
      setManualUrls({});
      setShowUrlPreview(false);
      setShowDuplicateWarning(false);
      setDuplicateCompany(null);
      setNewCompanyPeople([]);
      setNewPersonInput({ email: "", first_name: "", last_name: "", title: "" });
    }
  };

  // Add person to the list (for new company)
  const handleAddPersonToList = () => {
    if (!newPersonInput.email.trim()) return;
    setNewCompanyPeople([
      ...newCompanyPeople,
      { ...newPersonInput, id: crypto.randomUUID() },
    ]);
    setNewPersonInput({ email: "", first_name: "", last_name: "", title: "" });
  };

  // Remove person from the list
  const handleRemovePersonFromList = (id: string) => {
    setNewCompanyPeople(newCompanyPeople.filter((p) => p.id !== id));
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

  // Start editing a contact
  const handleStartEditContact = (contact: Contact) => {
    setEditingContactId(contact.id);
    setEditingContactData({
      first_name: contact.first_name || "",
      last_name: contact.last_name || "",
      email: contact.email || "",
      title: contact.title || "",
    });
  };

  // Cancel editing
  const handleCancelEditContact = () => {
    setEditingContactId(null);
    setEditingContactData({ first_name: "", last_name: "", email: "", title: "" });
  };

  // Save edited contact
  const handleSaveEditContact = async () => {
    if (!editingContactId) return;

    try {
      const pb = getClientPB();
      await updateContact(pb, editingContactId, editingContactData);
      toast({
        title: "Contact updated",
        description: "The contact has been updated successfully.",
        variant: "success",
      });
      setEditingContactId(null);
      setEditingContactData({ first_name: "", last_name: "", email: "", title: "" });
      loadData();
    } catch (error) {
      console.error("Failed to update contact:", error);
      toast({
        title: "Error",
        description: "Failed to update contact. Please try again.",
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

  const handleCopyCompanyData = (company: Company) => {
    // Build a formatted string with all company data (excluding people)
    const lines: string[] = [];

    lines.push(`Company: ${company.name}`);
    if (company.website) lines.push(`Website: ${company.website}`);
    if (company.email) lines.push(`Email: ${company.email}`);
    if (company.industry) lines.push(`Industry: ${company.industry}`);
    if (company.description) lines.push(`Description: ${company.description}`);

    // AI Scoring data
    if (company.ai_score !== undefined) {
      lines.push("");
      lines.push("--- AI Analysis ---");
      lines.push(`Score: ${company.ai_score}${company.ai_confidence ? ` (${Math.round(company.ai_confidence * 100)}% confidence)` : ""}`);
      if (company.ai_classification) lines.push(`Classification: ${company.ai_classification}`);

      // Add custom outputs from ai_data
      if (company.ai_data && aiConfigs.length > 0 && aiConfigs[0].custom_outputs) {
        for (const output of aiConfigs[0].custom_outputs) {
          const value = company.ai_data[output.name];
          if (value !== undefined && value !== null) {
            if (typeof value === "object") {
              lines.push(`${output.label}: ${JSON.stringify(value)}`);
            } else {
              lines.push(`${output.label}: ${value}`);
            }
          }
        }
      }

      // Add reasons if available
      if (company.ai_reasons && company.ai_reasons.length > 0) {
        lines.push("");
        lines.push("Reasons:");
        company.ai_reasons.forEach((reason, i) => {
          lines.push(`  ${i + 1}. ${reason}`);
        });
      }
    }

    navigator.clipboard.writeText(lines.join("\n"));
    toast({
      title: "Copied!",
      description: "Company data copied to clipboard.",
    });
  };

  const handleDeleteCompany = async (companyId: string) => {
    if (!confirm("Are you sure you want to delete this company and all its contacts?")) {
      return;
    }

    try {
      const pb = getClientPB();
      await deleteCompany(pb, companyId);
      toast({
        title: "Company deleted",
        description: "The company and its contacts have been removed.",
      });
      loadData();
    } catch (error) {
      console.error("Failed to delete company:", error);
      toast({
        title: "Error",
        description: "Failed to delete company.",
        variant: "destructive",
      });
    }
  };

  const handlePushToOutreach = async (companyId: string) => {
    if (!selectedOutreachCampaign) {
      toast({
        title: "Select Campaign",
        description: "Please select an outreach campaign to push to.",
        variant: "destructive",
      });
      return;
    }

    setPushingCompanyId(companyId);
    try {
      const pb = getClientPB();
      const createdContacts = await pushCompanyToOutreach(
        pb,
        companyId,
        selectedOutreachCampaign,
        selectedFunnelStage || undefined,
        selectedOutreachBatch || undefined
      );

      if (createdContacts.length > 0) {
        // Update local companies state to reflect the push
        setCompanies(prevCompanies =>
          prevCompanies.map(company => {
            if (company.id === companyId) {
              const existingPushed = company.pushed_to_campaigns || [];
              if (!existingPushed.includes(selectedOutreachCampaign)) {
                return {
                  ...company,
                  pushed_to_campaigns: [...existingPushed, selectedOutreachCampaign],
                };
              }
            }
            return company;
          })
        );

        toast({
          title: "Pushed to Outreach",
          description: `Created ${createdContacts.length} contact(s) in outreach campaign.`,
        });
        setIsPushDialogOpen(false);
        setSelectedOutreachCampaign("");
        setSelectedFunnelStage("");
        setSelectedOutreachBatch("");
      } else {
        toast({
          title: "No Contacts Created",
          description: "All contacts already exist in the outreach campaign or company has no email/people.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Failed to push to outreach:", error);
      toast({
        title: "Error",
        description: "Failed to push company to outreach.",
        variant: "destructive",
      });
    } finally {
      setPushingCompanyId(null);
    }
  };

  // Load funnel stages and batches when outreach campaign is selected
  const handleOutreachCampaignSelect = async (campaignId: string) => {
    setSelectedOutreachCampaign(campaignId);
    setSelectedFunnelStage("");
    setSelectedOutreachBatch("");

    if (campaignId) {
      try {
        const pb = getClientPB();
        const [stages, batches] = await Promise.all([
          getFunnelStages(pb, campaignId),
          getBatches(pb, campaignId),
        ]);
        setOutreachCampaignFunnelStages(stages.sort((a, b) => a.order - b.order));
        setOutreachCampaignBatches(batches);
      } catch (error) {
        console.error("Failed to load outreach campaign details:", error);
      }
    } else {
      setOutreachCampaignFunnelStages([]);
      setOutreachCampaignBatches([]);
    }
  };

  // Check if we can push (has outreach campaigns available)
  const canPush = outreachCampaigns.length > 0;

  // Add person to company handler
  const handleAddPerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPerson.email.trim() || !selectedCompanyForPerson) return;

    setIsCreating(true);
    try {
      const pb = getClientPB();
      const currentUser = getCurrentUser(pb);
      await createContact(pb, {
        email: newPerson.email,
        first_name: newPerson.first_name,
        last_name: newPerson.last_name,
        title: newPerson.title,
        company: selectedCompanyForPerson,
        campaign: campaignId,
        created_by: currentUser?.id,
      });
      toast({
        title: "Person added",
        description: "The person has been added to the company.",
      });
      setNewPerson({ email: "", first_name: "", last_name: "", title: "" });
      setIsAddPersonOpen(false);
      setSelectedCompanyForPerson("");
      loadData();
    } catch (error) {
      console.error("Failed to add person:", error);
      toast({
        title: "Error",
        description: "Failed to add person. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
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
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{batch.name}</h1>
                <Badge variant="secondary" className="font-medium">
                  {filteredCompanies.length === companies.length
                    ? `${companies.length} companies`
                    : `${filteredCompanies.length} of ${companies.length} companies`}
                </Badge>
              </div>
              <p className="text-muted-foreground">
                Leads batch
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

          <Dialog open={isAddCompanyOpen} onOpenChange={handleCompanyDialogClose}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Company
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <form onSubmit={handleAddCompanySubmit}>
                <DialogHeader>
                  <DialogTitle>Add Company to {batch.name}</DialogTitle>
                  <DialogDescription>
                    Add a new lead company to this batch.
                    {campaign?.enable_firecrawl && (
                      <span className="flex items-center gap-1 mt-1 text-primary">
                        <Globe className="h-3 w-3" />
                        Website scraping is enabled for this campaign
                      </span>
                    )}
                  </DialogDescription>
                </DialogHeader>

                {/* Duplicate Warning */}
                {showDuplicateWarning && duplicateCompany && (
                  <div className="my-4 p-4 border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 rounded-lg">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 space-y-2">
                        <p className="font-medium text-amber-800 dark:text-amber-200">
                          Possible duplicate found
                        </p>
                        <p className="text-sm text-amber-700 dark:text-amber-300">
                          A company with a similar name or website already exists:
                        </p>
                        <div className="p-2 bg-white dark:bg-slate-800 rounded border text-sm">
                          <p className="font-medium">{duplicateCompany.name}</p>
                          {duplicateCompany.website && (
                            <p className="text-muted-foreground">{duplicateCompany.website}</p>
                          )}
                          {duplicateCompany.expand?.batch && (
                            <p className="text-xs text-muted-foreground mt-1">
                              In batch: {duplicateCompany.expand.batch.name}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setShowDuplicateWarning(false);
                              setDuplicateCompany(null);
                            }}
                          >
                            Edit Details
                          </Button>
                          <Button
                            type="button"
                            variant="default"
                            size="sm"
                            onClick={handleProceedWithDuplicate}
                          >
                            Add Anyway
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {!showUrlPreview && !showDuplicateWarning ? (
                  /* Step 1: Basic company info */
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="company_name">Company Name *</Label>
                      <div className="relative">
                        <Input
                          id="company_name"
                          value={newCompany.name}
                          onChange={(e) => {
                            setNewCompany({ ...newCompany, name: e.target.value });
                            setHunterPeople([]);
                            setHunterSearched(false);
                          }}
                          required
                          className={duplicateStatus.exists && duplicateStatus.matchType === 'name' ? 'border-red-500 focus-visible:ring-red-500' : (newCompany.name.trim() && !duplicateStatus.checking && !duplicateStatus.exists ? 'border-green-500 focus-visible:ring-green-500' : '')}
                        />
                        {duplicateStatus.checking && newCompany.name.trim() && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">Checking...</span>
                        )}
                      </div>
                      {duplicateStatus.exists && duplicateStatus.matchType === 'name' && (
                        <p className="text-xs text-red-500">Company "{duplicateStatus.companyName}" already exists</p>
                      )}
                      {!duplicateStatus.checking && !duplicateStatus.exists && newCompany.name.trim() && (
                        <p className="text-xs text-green-500 flex items-center gap-1"><Check className="h-3 w-3" /> Available</p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="website">Website</Label>
                        <Input
                          id="website"
                          type="url"
                          placeholder="https://example.com"
                          value={newCompany.website}
                          onChange={(e) => {
                            setNewCompany({ ...newCompany, website: e.target.value });
                            setHunterPeople([]);
                            setHunterSearched(false);
                          }}
                          className={duplicateStatus.exists && duplicateStatus.matchType === 'website' ? 'border-red-500 focus-visible:ring-red-500' : (newCompany.website.trim() && !duplicateStatus.checking && !duplicateStatus.exists ? 'border-green-500 focus-visible:ring-green-500' : '')}
                        />
                        {duplicateStatus.exists && duplicateStatus.matchType === 'website' && (
                          <p className="text-xs text-red-500">Website matches "{duplicateStatus.companyName}"</p>
                        )}
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

                    {/* Hunter.io Section */}
                    {campaign?.enable_hunter !== false && newCompany.website.trim() && (
                      <div className="space-y-3 pt-4 border-t">
                        <div className="flex items-center justify-between">
                          <Label className="text-base font-medium">Find People (Hunter.io)</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleHunterSearch}
                            disabled={isSearchingHunter || !newCompany.website.trim()}
                          >
                            {isSearchingHunter ? (
                              <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Searching...</>
                            ) : (
                              <><Search className="h-3 w-3 mr-1" />Find People</>
                            )}
                          </Button>
                        </div>

                        {hunterPeople.length > 0 && (
                          <div className="space-y-2">
                            <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
                              {hunterPeople.map((person) => (
                                <div key={person.email} className="flex items-center gap-3 p-2 hover:bg-muted/50">
                                  <Checkbox
                                    checked={selectedHunterPeople.has(person.email)}
                                    onCheckedChange={(checked) => {
                                      const newSet = new Set(selectedHunterPeople);
                                      if (checked) { newSet.add(person.email); } else { newSet.delete(person.email); }
                                      setSelectedHunterPeople(newSet);
                                    }}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">
                                      {person.first_name} {person.last_name}
                                      {person.position && <span className="text-muted-foreground"> · {person.position}</span>}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">{person.email}</p>
                                  </div>
                                  <Badge variant="outline" className="text-xs">{person.confidence}%</Badge>
                                </div>
                              ))}
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">{selectedHunterPeople.size} selected</span>
                              <Button
                                type="button"
                                size="sm"
                                onClick={handleAddHunterPeople}
                                disabled={selectedHunterPeople.size === 0}
                              >
                                Add Selected
                              </Button>
                            </div>
                          </div>
                        )}

                        {hunterSearched && hunterPeople.length === 0 && !isSearchingHunter && (
                          <p className="text-xs text-muted-foreground">No people found. You can add them manually below.</p>
                        )}
                      </div>
                    )}

                    {/* People Section */}
                    <div className="space-y-3 pt-4 border-t">
                      <div className="flex items-center justify-between">
                        <Label className="text-base font-medium">
                          People
                          {newCompanyPeople.length > 0 && (
                            <Badge variant="secondary" className="ml-2">
                              {newCompanyPeople.length}
                            </Badge>
                          )}
                        </Label>
                      </div>

                      {/* List of added people */}
                      {newCompanyPeople.length > 0 && (
                        <div className="space-y-2">
                          {newCompanyPeople.map((person) => (
                            <div
                              key={person.id}
                              className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-sm"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Users className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                <span className="truncate">
                                  {person.first_name || person.last_name
                                    ? `${person.first_name} ${person.last_name}`.trim()
                                    : person.email}
                                </span>
                                {(person.first_name || person.last_name) && (
                                  <span className="text-muted-foreground truncate">
                                    ({person.email})
                                  </span>
                                )}
                                {person.title && (
                                  <span className="text-muted-foreground">
                                    · {person.title}
                                  </span>
                                )}
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive hover:text-destructive flex-shrink-0"
                                onClick={() => handleRemovePersonFromList(person.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add person form */}
                      <div className="space-y-2 p-3 rounded-md border bg-muted/30">
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            placeholder="First name"
                            value={newPersonInput.first_name}
                            onChange={(e) =>
                              setNewPersonInput({ ...newPersonInput, first_name: e.target.value })
                            }
                            className="h-8 text-sm"
                          />
                          <Input
                            placeholder="Last name"
                            value={newPersonInput.last_name}
                            onChange={(e) =>
                              setNewPersonInput({ ...newPersonInput, last_name: e.target.value })
                            }
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            type="email"
                            placeholder="Email *"
                            value={newPersonInput.email}
                            onChange={(e) =>
                              setNewPersonInput({ ...newPersonInput, email: e.target.value })
                            }
                            className="h-8 text-sm"
                          />
                          <Input
                            placeholder="Title (optional)"
                            value={newPersonInput.title}
                            onChange={(e) =>
                              setNewPersonInput({ ...newPersonInput, title: e.target.value })
                            }
                            className="h-8 text-sm"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full h-8"
                          onClick={handleAddPersonToList}
                          disabled={!newPersonInput.email.trim()}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add Person
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : showUrlPreview && !showDuplicateWarning ? (
                  /* Step 2: URL Preview (shown after mapping) */
                  <div className="space-y-4 py-4">
                    <div className="rounded-lg border p-4 bg-muted/50">
                      <h4 className="font-medium flex items-center gap-2 mb-3">
                        <Globe className="h-4 w-4" />
                        Discovered URLs for {newCompany.name}
                      </h4>

                      {/* Found URLs */}
                      {mapResult?.found && mapResult.found.length > 0 && (
                        <div className="space-y-2 mb-4">
                          <p className="text-sm text-muted-foreground">Found pages:</p>
                          {mapResult.found.map((pageType) => (
                            <div key={pageType} className="flex items-center gap-2 text-sm">
                              <Check className="h-4 w-4 text-green-500" />
                              <span className="capitalize font-medium">{pageType}:</span>
                              <span className="text-muted-foreground truncate flex-1">
                                {mapResult.urls[pageType]}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Not Found URLs */}
                      {mapResult?.notFound && mapResult.notFound.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-sm text-amber-600">
                            <AlertTriangle className="h-4 w-4" />
                            <span>{mapResult.notFound.length} page(s) not found - you can add them manually:</span>
                          </div>
                          {mapResult.notFound.map((pageType) => (
                            <div key={pageType} className="flex items-center gap-2">
                              <span className="capitalize text-sm font-medium w-20">{pageType}:</span>
                              <Input
                                type="url"
                                placeholder={`https://example.com/${pageType}`}
                                value={manualUrls[pageType] || ""}
                                onChange={(e) =>
                                  setManualUrls({ ...manualUrls, [pageType]: e.target.value })
                                }
                                className="flex-1"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      These URLs will be scraped when running AI scoring to provide richer context.
                      You can proceed without all URLs - AI scoring will use whatever is available.
                    </p>
                  </div>
                ) : null}

                {!showDuplicateWarning && (
                  <DialogFooter>
                    {showUrlPreview && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setShowUrlPreview(false)}
                      >
                        Back
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleCompanyDialogClose(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isCreating || isMapping}>
                      {isMapping ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Discovering URLs...
                        </>
                      ) : isCreating ? (
                        "Adding..."
                      ) : showUrlPreview ? (
                        "Save Company"
                      ) : campaign?.enable_firecrawl && newCompany.website ? (
                        "Discover URLs & Continue"
                      ) : (
                        "Add Company"
                      )}
                    </Button>
                  </DialogFooter>
                )}
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Companies Table */}
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[140px]">Company</TableHead>
                <TableHead className="min-w-[140px]">Description</TableHead>
                <TableHead className="min-w-[140px]">Website</TableHead>
                <TableHead className="min-w-[140px]">Email</TableHead>
                <TableHead className="text-center">People</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Class</TableHead>
                {aiConfigs.length > 0 && aiConfigs[0].custom_outputs?.map((output) => (
                  <TableHead key={output.id} className="min-w-[100px] text-xs" title={output.label}>
                    <span className="truncate block max-w-[120px]">{output.label}</span>
                  </TableHead>
                ))}
                <TableHead className="w-[180px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCompanies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8 + (aiConfigs[0]?.custom_outputs?.length || 0)} className="text-center py-12 text-muted-foreground">
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
                        <TableCell className="font-medium max-w-[160px]">
                          <Link
                            href={`/campaigns/${campaignId}/companies/${company.id}`}
                            className="flex items-center gap-2 hover:text-primary hover:underline"
                          >
                            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="truncate" title={company.name}>{company.name}</span>
                          </Link>
                        </TableCell>
                        <TableCell className="max-w-[180px]">
                          {company.description ? (
                            <p
                              className="text-sm text-muted-foreground truncate"
                              title={company.description}
                            >
                              {company.description}
                            </p>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[180px]">
                          {company.website ? (
                            <a
                              href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline flex items-center gap-1 truncate"
                              title={company.website}
                            >
                              <span className="truncate">{company.website.replace(/^https?:\/\/(www\.)?/, '')}</span>
                              <ExternalLink className="h-3 w-3 flex-shrink-0" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[180px]">
                          <span className="truncate block" title={company.email || undefined}>
                            {company.email || <span className="text-muted-foreground">-</span>}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">{people.length}</Badge>
                        </TableCell>
                        <TableCell>
                          {company.ai_score !== undefined ? (
                            <div className="flex items-center gap-1.5">
                              <Star className="h-4 w-4 text-amber-500 fill-amber-500 flex-shrink-0" />
                              <span className="font-semibold">{company.ai_score}</span>
                              {company.ai_confidence && (
                                <span className="text-xs text-muted-foreground">
                                  ({Math.round(company.ai_confidence * 100)}%)
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {company.ai_classification ? (
                            <Badge className="truncate max-w-[100px]" title={company.ai_classification}>
                              {company.ai_classification}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        {/* Dynamic custom output cells - read from ai_data JSON */}
                        {aiConfigs.length > 0 && aiConfigs[0].custom_outputs?.map((output) => {
                          // Read from ai_data JSON object instead of separate fields
                          const value = company.ai_data?.[output.name];
                          const stringValue = value !== undefined && value !== null
                            ? (typeof value === "object" ? JSON.stringify(value) : String(value))
                            : null;
                          return (
                            <TableCell key={output.id} className="max-w-[140px]">
                              {stringValue !== null ? (
                                output.type === "boolean" ? (
                                  <Badge
                                    variant={value === "true" || value === true ? "default" : value === "false" || value === false ? "secondary" : "outline"}
                                    className="text-xs"
                                  >
                                    {value === true || value === "true" ? "Yes" : value === false || value === "false" ? "No" : stringValue}
                                  </Badge>
                                ) : output.type === "nested_json" ? (
                                  <div
                                    className="text-xs bg-muted px-2 py-1 rounded truncate cursor-help"
                                    title={JSON.stringify(value, null, 2)}
                                  >
                                    {Array.isArray(value) ? value.join(", ") : stringValue}
                                  </div>
                                ) : output.type === "list" ? (
                                  <Badge variant="outline" className="text-xs truncate max-w-[120px]" title={stringValue}>
                                    {stringValue}
                                  </Badge>
                                ) : output.type === "number" ? (
                                  <span className="text-sm font-medium">{stringValue}</span>
                                ) : (
                                  <span
                                    className="text-sm truncate block max-w-[120px]"
                                    title={stringValue}
                                  >
                                    {stringValue}
                                  </span>
                                )
                              ) : (
                                <span className="text-muted-foreground text-xs">-</span>
                              )}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleCopyCompanyData(company)}
                              title="Copy company data"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                setSelectedCompanyForPerson(company.id);
                                setIsAddPersonOpen(true);
                              }}
                              title="Add person"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                            {aiConfigs.length > 0 && (
                              <Button
                                variant={company.ai_score !== undefined ? "ghost" : "default"}
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => handleScoreLead(company.id)}
                                disabled={scoringCompanyId === company.id}
                                title={company.ai_score !== undefined ? "Re-run AI scoring" : "Run AI scoring"}
                              >
                                {scoringCompanyId === company.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <>
                                    <Sparkles className="h-3 w-3 mr-1" />
                                    {company.ai_score !== undefined ? "Re-run" : "Score"}
                                  </>
                                )}
                              </Button>
                            )}
                            <Button
                              variant={company.pushed_to_campaigns?.length ? "secondary" : "outline"}
                              size="sm"
                              className={`h-7 px-2 text-xs ${company.pushed_to_campaigns?.length ? "border-green-500/50" : ""}`}
                              onClick={() => {
                                setPushingCompanyId(company.id);
                                setIsPushDialogOpen(true);
                              }}
                              disabled={!canPush || pushingCompanyId === company.id}
                              title={
                                company.pushed_to_campaigns?.length
                                  ? `Already pushed to: ${company.pushed_to_campaigns
                                    .map(id => outreachCampaigns.find(c => c.id === id)?.name || id)
                                    .join(", ")}`
                                  : "Push to outreach campaign"
                              }
                            >
                              {company.pushed_to_campaigns?.length ? (
                                <>
                                  <Check className="h-3 w-3 mr-1 text-green-500" />
                                  Pushed ({company.pushed_to_campaigns.length})
                                </>
                              ) : (
                                <>
                                  <ArrowRight className="h-3 w-3 mr-1" />
                                  Push
                                </>
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteCompany(company.id)}
                              title="Delete company"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {/* People under company */}
                      {people.length > 0 && people.map((person) => (
                        <TableRow key={person.id} className="bg-white dark:bg-slate-800">
                          {editingContactId === person.id ? (
                            // Edit mode
                            <>
                              <TableCell className="pl-8">
                                <div className="flex items-center gap-2">
                                  <Users className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                  <Input
                                    value={editingContactData.first_name}
                                    onChange={(e) => setEditingContactData({ ...editingContactData, first_name: e.target.value })}
                                    placeholder="First name"
                                    className="h-7 text-sm w-20"
                                  />
                                  <Input
                                    value={editingContactData.last_name}
                                    onChange={(e) => setEditingContactData({ ...editingContactData, last_name: e.target.value })}
                                    placeholder="Last name"
                                    className="h-7 text-sm w-20"
                                  />
                                </div>
                              </TableCell>
                              <TableCell colSpan={2}>
                                <div className="flex items-center gap-2">
                                  <Mail className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                  <Input
                                    value={editingContactData.email}
                                    onChange={(e) => setEditingContactData({ ...editingContactData, email: e.target.value })}
                                    placeholder="Email"
                                    type="email"
                                    className="h-7 text-sm"
                                  />
                                </div>
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={editingContactData.title}
                                  onChange={(e) => setEditingContactData({ ...editingContactData, title: e.target.value })}
                                  placeholder="Title"
                                  className="h-7 text-sm"
                                />
                              </TableCell>
                              <TableCell colSpan={2 + (aiConfigs[0]?.custom_outputs?.length || 0)}>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={handleSaveEditContact}
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs text-muted-foreground"
                                    onClick={handleCancelEditContact}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </TableCell>
                              <TableCell></TableCell>
                            </>
                          ) : (
                            // Display mode
                            <>
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
                              <TableCell colSpan={2 + (aiConfigs[0]?.custom_outputs?.length || 0)}></TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => handleStartEditContact(person)}
                                    title="Edit contact"
                                  >
                                    <Edit className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-destructive hover:text-destructive"
                                    onClick={() => handleDeleteContact(person.id)}
                                    title="Delete contact"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </TableCell>
                            </>
                          )}
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

        {/* Add Person Dialog */}
        <Dialog open={isAddPersonOpen} onOpenChange={(open) => {
          setIsAddPersonOpen(open);
          if (!open) {
            setSelectedCompanyForPerson("");
            setNewPerson({ email: "", first_name: "", last_name: "", title: "" });
          }
        }}>
          <DialogContent>
            <form onSubmit={handleAddPerson}>
              <DialogHeader>
                <DialogTitle>Add Person</DialogTitle>
                <DialogDescription>
                  Add a person to {companies.find(c => c.id === selectedCompanyForPerson)?.name || "this company"}.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="person_first_name">First Name</Label>
                    <Input
                      id="person_first_name"
                      value={newPerson.first_name}
                      onChange={(e) => setNewPerson({ ...newPerson, first_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="person_last_name">Last Name</Label>
                    <Input
                      id="person_last_name"
                      value={newPerson.last_name}
                      onChange={(e) => setNewPerson({ ...newPerson, last_name: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="person_email">Email *</Label>
                  <Input
                    id="person_email"
                    type="email"
                    value={newPerson.email}
                    onChange={(e) => setNewPerson({ ...newPerson, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="person_title">Title</Label>
                  <Input
                    id="person_title"
                    value={newPerson.title}
                    onChange={(e) => setNewPerson({ ...newPerson, title: e.target.value })}
                    placeholder="e.g., CEO, Marketing Director"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsAddPersonOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isCreating || !newPerson.email.trim()}>
                  {isCreating ? "Adding..." : "Add Person"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Push to Outreach Dialog */}
        <Dialog open={isPushDialogOpen} onOpenChange={(open) => {
          setIsPushDialogOpen(open);
          if (!open) {
            setPushingCompanyId(null);
            setSelectedOutreachCampaign("");
            setSelectedFunnelStage("");
            setSelectedOutreachBatch("");
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Push to Outreach Campaign</DialogTitle>
              <DialogDescription>
                Push {companies.find(c => c.id === pushingCompanyId)?.name || "this company"}&apos;s contacts to an outreach campaign.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Outreach Campaign *</Label>
                <Select value={selectedOutreachCampaign} onValueChange={handleOutreachCampaignSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select outreach campaign" />
                  </SelectTrigger>
                  <SelectContent>
                    {outreachCampaigns.filter(c => c.id).map((c) => {
                      const isPushed = pushingCompanyId &&
                        companies.find(comp => comp.id === pushingCompanyId)?.pushed_to_campaigns?.includes(c.id);
                      return (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="flex items-center gap-2">
                            {c.name}
                            {isPushed && <Check className="h-3 w-3 text-green-500" />}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Warning if already pushed to this campaign */}
              {selectedOutreachCampaign && pushingCompanyId &&
                companies.find(c => c.id === pushingCompanyId)?.pushed_to_campaigns?.includes(selectedOutreachCampaign) && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    <p className="text-sm">
                      This company was already pushed to this campaign. Pushing again will only create contacts that don&apos;t exist yet.
                    </p>
                  </div>
                )}

              {selectedOutreachCampaign && outreachCampaignFunnelStages.length > 0 && (
                <div className="space-y-2">
                  <Label>Initial Stage (optional)</Label>
                  <Select value={selectedFunnelStage} onValueChange={setSelectedFunnelStage}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select initial stage" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Default (first stage)</SelectItem>
                      {outreachCampaignFunnelStages.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stage.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {selectedOutreachCampaign && outreachCampaignBatches.length > 0 && (
                <div className="space-y-2">
                  <Label>Batch (optional)</Label>
                  <Select value={selectedOutreachBatch} onValueChange={setSelectedOutreachBatch}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select batch" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No batch</SelectItem>
                      {outreachCampaignBatches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsPushDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => pushingCompanyId && handlePushToOutreach(pushingCompanyId)}
                disabled={!selectedOutreachCampaign || pushingCompanyId === null}
              >
                {pushingCompanyId ? "Push to Outreach" : "Pushing..."}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
