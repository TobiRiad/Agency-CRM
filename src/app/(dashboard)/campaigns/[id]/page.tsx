"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  getClientPB,
  getCampaign,
  getContacts,
  getCompanies,
  getCustomFields,
  getFieldValuesForContacts,
  createContact,
  updateContact,
  deleteContact,
  createCompany,
  deleteCompany,
  setContactFieldValue,
  getFunnelStages,
  getContactStages,
  setContactStage,
  getBatches,
  createBatch,
  getCurrentUser,
  getContactsByCompany,
  pushCompanyToOutreach,
  getOutreachCampaigns,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/use-toast";
import {
  Plus,
  MoreVertical,
  Trash2,
  Edit,
  Upload,
  Mail,
  Search,
  Settings,
  FileText,
  BarChart3,
  Filter,
  Send,
  Reply,
  GitBranch,
  Sparkles,
  ArrowRight,
  ArrowUpDown,
  Loader2,
  Star,
  ExternalLink,
  Users,
  Layers,
  Copy,
  Pencil,
} from "lucide-react";
import type { Campaign, Contact, Company, CustomField, ContactFieldValue, FunnelStage, ContactStage, Batch, AIScoringConfig, FirecrawlPageType, FirecrawlUrls } from "@/types";
import { Globe, AlertTriangle, Check } from "lucide-react";

export default function CampaignPage() {
  const params = useParams();
  const campaignId = params.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sourceCompanies, setSourceCompanies] = useState<Map<string, Company>>(new Map());
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [editingContact, setEditingContact] = useState<Partial<Contact>>({});
  const [generatingOpenerId, setGeneratingOpenerId] = useState<string | null>(null);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [fieldValues, setFieldValues] = useState<Map<string, Map<string, string>>>(new Map());
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);
  const [contactStageMap, setContactStageMap] = useState<Map<string, string>>(new Map());
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [minScore, setMinScore] = useState<string>("");
  const [sortByScore, setSortByScore] = useState<'asc' | 'desc' | null>(null);
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [isAddCompanyOpen, setIsAddCompanyOpen] = useState(false);
  const [isAddBatchOpen, setIsAddBatchOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newBatchName, setNewBatchName] = useState("");

  const [newContact, setNewContact] = useState({
    email: "",
    first_name: "",
    last_name: "",
    title: "",
    company: "",
    batch: "",
  });

  const [newCompany, setNewCompany] = useState({
    name: "",
    website: "",
    industry: "",
    email: "",
    description: "",
    batch: "",
  });

  // People to add with new company
  const [newCompanyPeople, setNewCompanyPeople] = useState<Array<{
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    title: string;
    is_primary: boolean;
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
    seniority?: string;
    department?: string;
  }>>([]);
  const [selectedHunterPeople, setSelectedHunterPeople] = useState<Set<string>>(new Set());
  const [isSearchingHunter, setIsSearchingHunter] = useState(false);
  const [hunterSearched, setHunterSearched] = useState(false);
  // AI primary contact suggestion
  const [aiPrimaryEmail, setAiPrimaryEmail] = useState<string | null>(null);
  const [aiPrimaryReason, setAiPrimaryReason] = useState<string>("");
  const [isPickingPrimary, setIsPickingPrimary] = useState(false);

  // Leads-specific state
  const [companyContacts, setCompanyContacts] = useState<Map<string, Contact[]>>(new Map());
  const [aiConfigs, setAiConfigs] = useState<AIScoringConfig[]>([]);
  const [outreachCampaigns, setOutreachCampaigns] = useState<Campaign[]>([]);
  const [scoringCompanyId, setScoringCompanyId] = useState<string | null>(null);
  const [pushingCompanyId, setPushingCompanyId] = useState<string | null>(null);
  const [selectedOutreachCampaign, setSelectedOutreachCampaign] = useState<string>("");
  const [selectedFunnelStage, setSelectedFunnelStage] = useState<string>("");
  const [selectedBatch, setSelectedBatch] = useState<string>("");
  const [isPushDialogOpen, setIsPushDialogOpen] = useState(false);
  const [outreachCampaignFunnelStages, setOutreachCampaignFunnelStages] = useState<FunnelStage[]>([]);
  const [outreachCampaignBatches, setOutreachCampaignBatches] = useState<Batch[]>([]);
  const [selectedCompanyForPerson, setSelectedCompanyForPerson] = useState<string>("");
  const [isAddPersonOpen, setIsAddPersonOpen] = useState(false);
  const [newPerson, setNewPerson] = useState({
    email: "",
    first_name: "",
    last_name: "",
    title: "",
  });

  // State for editing AI opener
  const [editingOpenerId, setEditingOpenerId] = useState<string | null>(null);
  const [editingOpenerText, setEditingOpenerText] = useState("");
  const [isSavingOpener, setIsSavingOpener] = useState(false);

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
      const campaignData = await getCampaign(pb, campaignId);

      // Load batches for all campaign types
      const batchesPromise = getBatches(pb, campaignId);

      const [contactsData, companiesData, fieldsData, stagesData, contactStagesData, batchesData] = await Promise.all([
        getContacts(pb, campaignId),
        getCompanies(pb, campaignId),
        getCustomFields(pb, campaignId),
        getFunnelStages(pb, campaignId),
        getContactStages(pb, campaignId),
        batchesPromise,
      ]);

      setCampaign(campaignData);
      setContacts(contactsData);
      setCompanies(companiesData);
      setCustomFields(fieldsData);
      setFunnelStages(stagesData.sort((a, b) => a.order - b.order));
      setBatches(batchesData);

      // For outreach campaigns, load source companies (from lead campaigns)
      if (campaignData.kind === 'outreach' || !campaignData.kind) {
        const sourceCompanyIds = new Set<string>();
        contactsData.forEach((contact) => {
          if (contact.source_company) {
            sourceCompanyIds.add(contact.source_company);
          }
        });

        if (sourceCompanyIds.size > 0) {
          // Batch fetch all source companies in a single query instead of N individual fetches
          const idsArray = Array.from(sourceCompanyIds);
          const sourceCompaniesMap = new Map<string, Company>();
          try {
            const filter = idsArray.map(id => pb.filter('id = {:id}', { id })).join(' || ');
            const result = await pb.collection('companies').getList<Company>(1, 500, { filter });
            for (const company of result.items) {
              sourceCompaniesMap.set(company.id, company);
            }
          } catch (error) {
            console.error('Failed to load source companies:', error);
          }
          setSourceCompanies(sourceCompaniesMap);
        }
      }

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

      // If this is a leads campaign, load company contacts and AI configs
      if (campaignData.kind === 'leads') {
        const user = getCurrentUser(pb);
        if (user) {
          // Load ALL contacts for this campaign once, then group by company in memory
          // (instead of N+1 queries per company)
          const contactsByCompany = new Map<string, Contact[]>();
          const allCompanyContacts = await pb.collection('contacts').getList<Contact>(1, 500, {
            filter: pb.filter('campaign = {:campaignId}', { campaignId }),
            expand: 'created_by',
          });
          for (const contact of allCompanyContacts.items) {
            if (contact.company) {
              const existing = contactsByCompany.get(contact.company) || [];
              existing.push(contact);
              contactsByCompany.set(contact.company, existing);
            }
          }
          setCompanyContacts(contactsByCompany);

          // Load AI scoring configs and outreach campaigns in parallel
          const [configs, outreach] = await Promise.all([
            getAIScoringConfigs(pb, campaignId),
            getOutreachCampaigns(pb, user.id),
          ]);
          setAiConfigs(configs);
          setOutreachCampaigns(outreach);
        }
      }
    } catch (error) {
      console.error("Failed to load campaign data:", error);
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

  // Debounced real-time duplicate check
  useEffect(() => {
    // Only check if we have a name or website
    if (!newCompany.name.trim() && !newCompany.website.trim()) {
      setDuplicateStatus({ checking: false, exists: false, matchType: null });
      return;
    }

    // Don't check if dialog is not open or we're showing other warnings
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
    setAiPrimaryEmail(null);
    setAiPrimaryReason("");

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
          description: `Found ${data.people.length} people at ${data.domain}. AI is picking the best contact...`,
        });

        // Auto-trigger AI primary contact selection
        if (data.people.length > 1) {
          setIsPickingPrimary(true);
          try {
            // Get the active scoring config's system prompt for context
            const scoringPrompt = aiConfigs.length > 0 ? aiConfigs[0].system_prompt : undefined;
            const aiResponse = await fetch('/api/ai/pick-primary-contact', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                people: data.people,
                scoringPrompt,
                companyName: newCompany.name || data.domain,
              }),
            });
            const aiData = await aiResponse.json();
            if (aiData.success && aiData.primaryEmail) {
              setAiPrimaryEmail(aiData.primaryEmail);
              setAiPrimaryReason(aiData.reasoning || "");
              // Auto-select all people, with AI pick marked
              setSelectedHunterPeople(new Set(data.people.map((p: { email: string }) => p.email)));
            }
          } catch (aiError) {
            console.error("AI primary pick error:", aiError);
            // Still show results, just without AI recommendation
            setSelectedHunterPeople(new Set(data.people.map((p: { email: string }) => p.email)));
          } finally {
            setIsPickingPrimary(false);
          }
        } else {
          // Only one person — auto-select and mark as primary
          setAiPrimaryEmail(data.people[0].email);
          setAiPrimaryReason("Only one contact found — automatically selected as primary.");
          setSelectedHunterPeople(new Set([data.people[0].email]));
        }
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
      is_primary: aiPrimaryEmail ? p.email.toLowerCase() === aiPrimaryEmail.toLowerCase() : false,
    }));
    // If no AI pick and only one person, mark them as primary
    if (!aiPrimaryEmail && newPeople.length === 1) {
      newPeople[0].is_primary = true;
    }
    setNewCompanyPeople([...newCompanyPeople, ...newPeople]);
    setHunterPeople([]);
    setSelectedHunterPeople(new Set());
    setAiPrimaryEmail(null);
    setAiPrimaryReason("");
    const primaryName = newPeople.find(p => p.is_primary);
    toast({
      title: "People Added",
      description: primaryName
        ? `Added ${newPeople.length} people. Primary: ${primaryName.first_name} ${primaryName.last_name}`.trim()
        : `Added ${newPeople.length} people to the company`,
    });
  };

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
        batch: newContact.batch || undefined,
        campaign: campaignId,
        created_by: currentUser?.id,
      });

      toast({
        title: "Contact added",
        description: isCreatingNewCompany && inlineNewCompany.name.trim()
          ? "Contact and company have been added to your campaign."
          : "The contact has been added to your campaign.",
        variant: "success",
      });

      setNewContact({
        email: "",
        first_name: "",
        last_name: "",
        title: "",
        company: "",
        batch: "",
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

  // Extract domain from URL for duplicate checking
  const extractDomain = (url: string): string => {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      return urlObj.hostname.replace(/^www\./, '');
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

      for (const company of companies) {
        if (company.website) {
          const existingDomain = extractDomain(company.website);
          if (domain === existingDomain) {
            return company;
          }
        }
      }
    }

    // Check by exact name match (case-insensitive)
    const nameLower = newCompany.name.toLowerCase().trim();
    for (const company of companies) {
      if (company.name.toLowerCase().trim() === nameLower) {
        return company;
      }
    }

    return null;
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

    // Otherwise save directly
    await handleSaveCompany();
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
        batch: newCompany.batch || undefined,
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
              is_primary: person.is_primary,
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
          : "The company has been added to your campaign.",
        variant: "success",
      });

      // Reset all state
      setNewCompany({
        name: "",
        website: "",
        industry: "",
        email: "",
        description: "",
        batch: "",
      });
      setNewCompanyPeople([]);
      setNewPersonInput({ email: "", first_name: "", last_name: "", title: "" });
      setMapResult(null);
      setManualUrls({});
      setShowUrlPreview(false);
      setHunterPeople([]);
      setHunterSearched(false);
      setSelectedHunterPeople(new Set());
      setAiPrimaryEmail(null);
      setAiPrimaryReason("");
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
      setHunterPeople([]);
      setHunterSearched(false);
      setSelectedHunterPeople(new Set());
      setAiPrimaryEmail(null);
      setAiPrimaryReason("");
    }
  };

  // Add person to the list (for new company)
  const handleAddPersonToList = () => {
    if (!newPersonInput.email.trim()) return;
    // If this is the first person being added, mark them as primary
    const isPrimary = newCompanyPeople.length === 0 || !newCompanyPeople.some(p => p.is_primary);
    setNewCompanyPeople([
      ...newCompanyPeople,
      { ...newPersonInput, id: crypto.randomUUID(), is_primary: isPrimary },
    ]);
    setNewPersonInput({ email: "", first_name: "", last_name: "", title: "" });
  };

  // Remove person from the list
  const handleRemovePersonFromList = (id: string) => {
    setNewCompanyPeople(newCompanyPeople.filter((p) => p.id !== id));
  };

  const handleAddBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBatchName.trim()) return;

    setIsCreating(true);
    try {
      const pb = getClientPB();
      await createBatch(pb, {
        name: newBatchName,
        campaign: campaignId,
      });

      toast({
        title: "Batch created",
        description: "The batch has been created successfully.",
        variant: "success",
      });

      setNewBatchName("");
      setIsAddBatchOpen(false);
      loadData();
    } catch (error) {
      console.error("Failed to create batch:", error);
      toast({
        title: "Error",
        description: "Failed to create batch. Please try again.",
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

  // Start editing a contact (leads campaign)
  const handleStartEditContact = (contact: Contact) => {
    setEditingContactId(contact.id);
    setEditingContact({
      first_name: contact.first_name || "",
      last_name: contact.last_name || "",
      email: contact.email || "",
      title: contact.title || "",
    });
  };

  // Cancel editing
  const handleCancelEditContact = () => {
    setEditingContactId(null);
    setEditingContact({});
  };

  // Save edited contact
  const handleSaveEditContact = async () => {
    if (!editingContactId) return;

    try {
      const pb = getClientPB();
      await updateContact(pb, editingContactId, editingContact);
      toast({
        title: "Contact updated",
        description: "The contact has been updated successfully.",
        variant: "success",
      });
      setEditingContactId(null);
      setEditingContact({});
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
      const config = aiConfigs[0]; // Use first config for now
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
        loadData(); // Reload to show updated scores
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
        selectedBatch || undefined
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
        setSelectedBatch("");
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
  useEffect(() => {
    const loadOutreachCampaignData = async () => {
      if (!selectedOutreachCampaign) {
        setOutreachCampaignFunnelStages([]);
        setOutreachCampaignBatches([]);
        return;
      }

      try {
        const pb = getClientPB();
        const [stages, batches] = await Promise.all([
          getFunnelStages(pb, selectedOutreachCampaign),
          getBatches(pb, selectedOutreachCampaign),
        ]);
        setOutreachCampaignFunnelStages(stages.sort((a, b) => a.order - b.order));
        setOutreachCampaignBatches(batches);
      } catch (error) {
        console.error("Failed to load outreach campaign data:", error);
      }
    };

    loadOutreachCampaignData();
  }, [selectedOutreachCampaign]);

  const handleGenerateOpener = async (contactId: string) => {
    setGeneratingOpenerId(contactId);
    try {
      const response = await fetch("/api/ai/generate-opener", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId }),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "AI Opener Generated",
          description: "AI opener has been generated successfully.",
        });
        loadData(); // Reload to show the opener
      } else {
        throw new Error(result.error || "Failed to generate opener");
      }
    } catch (error) {
      console.error("Failed to generate opener:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate AI opener",
        variant: "destructive",
      });
    } finally {
      setGeneratingOpenerId(null);
    }
  };

  const handleCopyOpener = (opener: string) => {
    navigator.clipboard.writeText(opener);
    toast({
      title: "Copied!",
      description: "AI opener copied to clipboard.",
    });
  };

  const handleEditOpener = (contactId: string, currentOpener: string) => {
    setEditingOpenerId(contactId);
    setEditingOpenerText(currentOpener);
  };

  const handleSaveOpener = async () => {
    if (!editingOpenerId) return;

    setIsSavingOpener(true);
    try {
      const pb = getClientPB();
      await updateContact(pb, editingOpenerId, {
        ai_opener: editingOpenerText,
      });
      toast({
        title: "Opener saved",
        description: "AI opener has been updated.",
      });
      setEditingOpenerId(null);
      setEditingOpenerText("");
      loadData();
    } catch (error) {
      console.error("Failed to save opener:", error);
      toast({
        title: "Error",
        description: "Failed to save AI opener.",
        variant: "destructive",
      });
    } finally {
      setIsSavingOpener(false);
    }
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

  const handleContactBatchChange = async (contactId: string, newBatchId: string) => {
    try {
      const pb = getClientPB();
      await updateContact(pb, contactId, {
        batch: newBatchId === "__none__" ? "" : newBatchId,
      });
      toast({
        title: "Batch updated",
        description: "Contact batch has been updated.",
      });
      loadData(); // Reload to get updated batch info
    } catch (error) {
      console.error("Failed to update contact batch:", error);
      toast({
        title: "Error",
        description: "Failed to update contact batch.",
        variant: "destructive",
      });
    }
  };

  const getContactStageId = (contactId: string): string | undefined => {
    return contactStageMap.get(contactId);
  };

  const getContactStageName = (contactId: string): string => {
    const stageId = contactStageMap.get(contactId);
    if (!stageId) return "Uncategorized";
    const stage = funnelStages.find((s) => s.id === stageId);
    return stage?.name || "Unknown";
  };

  const filteredContacts = contacts.filter((contact) => {
    // Apply stage filter
    if (stageFilter !== "all") {
      const contactStageId = contactStageMap.get(contact.id);
      if (contactStageId !== stageFilter) return false;
    }

    // Apply batch filter
    if (batchFilter !== "all") {
      if (batchFilter === "none") {
        // Filter for contacts with no batch
        if (contact.batch) return false;
      } else {
        // Filter for specific batch
        if (contact.batch !== batchFilter) return false;
      }
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

  const getFieldValue = (contactId: string, fieldId: string): string => {
    return fieldValues.get(contactId)?.get(fieldId) || "";
  };

  // Filter companies by batch (for leads campaigns)
  const filteredCompanies = companies
    .filter((company) => {
      // Apply batch filter
      if (batchFilter !== "all") {
        if (batchFilter === "none") {
          // Filter for companies with no batch
          if (company.batch) return false;
        } else {
          // Filter for specific batch
          if (company.batch !== batchFilter) return false;
        }
      }
      // Apply minimum score filter
      const minScoreNum = parseFloat(minScore);
      if (!isNaN(minScoreNum) && minScoreNum > 0) {
        if (company.ai_score === undefined || company.ai_score < minScoreNum) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (!sortByScore) return 0;
      const scoreA = a.ai_score ?? -Infinity;
      const scoreB = b.ai_score ?? -Infinity;
      return sortByScore === 'desc' ? scoreB - scoreA : scoreA - scoreB;
    });

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
        <p className="text-muted-foreground mt-2">This campaign may have been deleted.</p>
        <Button asChild className="mt-4">
          <Link href="/campaigns">Back to Campaigns</Link>
        </Button>
      </div>
    );
  }

  // Leads campaign view (company-first with people nested)
  if (campaign.kind === 'leads') {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              <h1 className="text-3xl font-bold">{campaign.name}</h1>
            </div>
            <p className="text-muted-foreground mt-1">
              {campaign.description || "No description"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href={`/campaigns/${campaignId}/settings`}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </Button>
            <Dialog open={isAddCompanyOpen} onOpenChange={handleCompanyDialogClose}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Lead Company
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <form onSubmit={handleAddCompanySubmit}>
                  <DialogHeader>
                    <DialogTitle>Add Lead Company</DialogTitle>
                    <DialogDescription>
                      Add a new company to qualify and potentially push to outreach.
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
                      {batches.length > 0 && (
                        <div className="space-y-2">
                          <Label htmlFor="company_batch">Batch</Label>
                          <Select
                            value={newCompany.batch}
                            onValueChange={(value) =>
                              setNewCompany({ ...newCompany, batch: value === "__none__" ? "" : value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select a batch (optional)" />
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
                      )}

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

                          {isPickingPrimary && (
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>AI is analyzing contacts to pick the best person to email...</span>
                            </div>
                          )}

                          {hunterPeople.length > 0 && !isPickingPrimary && (
                            <div className="space-y-2">
                              {aiPrimaryReason && (
                                <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs">
                                  <Sparkles className="h-3.5 w-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                                  <span className="text-amber-800 dark:text-amber-200">{aiPrimaryReason}</span>
                                </div>
                              )}
                              <div className="max-h-56 overflow-y-auto border rounded-lg divide-y">
                                {hunterPeople.map((person) => {
                                  const isPrimary = aiPrimaryEmail?.toLowerCase() === person.email.toLowerCase();
                                  return (
                                    <div key={person.email} className={`flex items-center gap-3 p-2 hover:bg-muted/50 ${isPrimary ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''}`}>
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
                                      <div className="flex items-center gap-1.5 flex-shrink-0">
                                        {isPrimary ? (
                                          <Badge className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700">
                                            <Star className="h-3 w-3 mr-1 fill-current" />Primary
                                          </Badge>
                                        ) : (
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                                            onClick={() => {
                                              setAiPrimaryEmail(person.email);
                                              setAiPrimaryReason(`Manually selected ${person.first_name} ${person.last_name} as primary contact.`);
                                            }}
                                          >
                                            Set Primary
                                          </Button>
                                        )}
                                        <Badge variant="outline" className="text-xs">{person.confidence}%</Badge>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">
                                  {selectedHunterPeople.size} selected
                                  {aiPrimaryEmail && ` · Primary: ${hunterPeople.find(p => p.email.toLowerCase() === aiPrimaryEmail.toLowerCase())?.first_name || aiPrimaryEmail}`}
                                </span>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={handleAddHunterPeople}
                                  disabled={selectedHunterPeople.size === 0}
                                >
                                  Add All Contacts
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
                            {/* Sort primary first */}
                            {[...newCompanyPeople].sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0)).map((person) => (
                              <div
                                key={person.id}
                                className={`flex items-center justify-between p-2 rounded-md text-sm ${person.is_primary ? 'bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800' : 'bg-muted/50'}`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {person.is_primary ? (
                                    <Star className="h-3.5 w-3.5 text-amber-600 fill-amber-600 flex-shrink-0" />
                                  ) : (
                                    <Users className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                  )}
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
                                  {person.is_primary && (
                                    <Badge className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 ml-1">
                                      Primary
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {!person.is_primary && newCompanyPeople.length > 1 && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                                      onClick={() => {
                                        setNewCompanyPeople(prev =>
                                          prev.map(p => ({ ...p, is_primary: p.id === person.id }))
                                        );
                                      }}
                                    >
                                      Set Primary
                                    </Button>
                                  )}
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-destructive hover:text-destructive"
                                    onClick={() => handleRemovePersonFromList(person.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
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
        </div>

        {/* Batch Toolbar for Leads */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Company Count */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary" className="font-medium">
                {filteredCompanies.length === companies.length
                  ? `${companies.length} companies`
                  : `${filteredCompanies.length} of ${companies.length} companies`}
              </Badge>
            </div>
            {batches.length > 0 && (
              <div className="flex items-center gap-1">
                <Select value={batchFilter} onValueChange={setBatchFilter}>
                  <SelectTrigger className="w-[200px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <Layers className="h-4 w-4 flex-shrink-0" />
                      {(() => {
                        if (batchFilter === "all") {
                          return <span className="truncate">All Batches</span>;
                        }
                        if (batchFilter === "none") {
                          return <span className="truncate">No Batch</span>;
                        }
                        const batch = batches.find(b => b.id === batchFilter);
                        if (batch) {
                          return <span className="truncate">{batch.name}</span>;
                        }
                        return <span className="truncate">Filter by batch</span>;
                      })()}
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Batches</SelectItem>
                    <SelectItem value="none">No Batch</SelectItem>
                    {batches.map((batch) => (
                      <SelectItem key={batch.id} value={batch.id}>
                        {batch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {batchFilter && batchFilter !== "all" && batchFilter !== "none" && (
                  <Button variant="ghost" size="icon" className="h-9 w-9" asChild>
                    <Link href={`/campaigns/${campaignId}/batches/${batchFilter}`}>
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </Button>
                )}
              </div>
            )}
            {/* Min Score Filter */}
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-muted-foreground" />
              <Input
                type="number"
                placeholder="Min score"
                value={minScore}
                onChange={(e) => setMinScore(e.target.value)}
                className="w-24 h-9"
                min="0"
              />
            </div>
          </div>
          <Dialog open={isAddBatchOpen} onOpenChange={setIsAddBatchOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Layers className="mr-2 h-4 w-4" />
                Create Batch
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleAddBatch}>
                <DialogHeader>
                  <DialogTitle>Create Batch</DialogTitle>
                  <DialogDescription>
                    Create a new batch to organize your leads.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="leads_batch_name">Batch Name *</Label>
                    <Input
                      id="leads_batch_name"
                      placeholder="e.g., Week 1 - Tech Companies"
                      value={newBatchName}
                      onChange={(e) => setNewBatchName(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAddBatchOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isCreating}>
                    {isCreating ? "Creating..." : "Create Batch"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Leads Companies Table */}
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[140px]">Company</TableHead>
                <TableHead className="min-w-[140px]">Description</TableHead>
                <TableHead className="min-w-[140px]">Website</TableHead>
                <TableHead className="min-w-[140px]">Email</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead className="text-center">People</TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setSortByScore(prev => prev === 'desc' ? 'asc' : prev === 'asc' ? null : 'desc')}
                >
                  <div className="flex items-center gap-1">
                    Score
                    <ArrowUpDown className={`h-3 w-3 ${sortByScore ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>
                </TableHead>
                <TableHead>Class</TableHead>
                {/* Dynamic custom output columns */}
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
                  <TableCell colSpan={9 + (aiConfigs[0]?.custom_outputs?.length || 0)} className="text-center py-12 text-muted-foreground">
                    {batchFilter !== "all"
                      ? "No companies match your filter"
                      : "No lead companies yet. Add your first company to get started."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredCompanies.map((company) => {
                  const people = companyContacts.get(company.id) || [];
                  // Can push if company has email OR has people (people will have emails)
                  const canPush = company.email || people.length > 0;
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
                        <TableCell>
                          {company.expand?.batch ? (
                            <Badge variant="outline" className="truncate max-w-[100px]" title={company.expand.batch.name}>
                              {company.expand.batch.name}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
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
                                    value={editingContact.first_name || ""}
                                    onChange={(e) => setEditingContact({ ...editingContact, first_name: e.target.value })}
                                    placeholder="First name"
                                    className="h-7 text-sm w-20"
                                  />
                                  <Input
                                    value={editingContact.last_name || ""}
                                    onChange={(e) => setEditingContact({ ...editingContact, last_name: e.target.value })}
                                    placeholder="Last name"
                                    className="h-7 text-sm w-20"
                                  />
                                </div>
                              </TableCell>
                              <TableCell colSpan={2}>
                                <div className="flex items-center gap-2">
                                  <Mail className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                  <Input
                                    value={editingContact.email || ""}
                                    onChange={(e) => setEditingContact({ ...editingContact, email: e.target.value })}
                                    placeholder="Email"
                                    type="email"
                                    className="h-7 text-sm"
                                  />
                                </div>
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={editingContact.title || ""}
                                  onChange={(e) => setEditingContact({ ...editingContact, title: e.target.value })}
                                  placeholder="Title"
                                  className="h-7 text-sm"
                                />
                              </TableCell>
                              <TableCell colSpan={3 + (aiConfigs[0]?.custom_outputs?.length || 0)}>
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
                              <TableCell colSpan={3 + (aiConfigs[0]?.custom_outputs?.length || 0)}></TableCell>
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

        {/* Push to Outreach Dialog */}
        <Dialog open={isPushDialogOpen} onOpenChange={setIsPushDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Push Company to Outreach</DialogTitle>
              <DialogDescription>
                Select an outreach campaign to push this company and its people to.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="outreach_campaign">Outreach Campaign</Label>
                <Select
                  value={selectedOutreachCampaign}
                  onValueChange={(value) => {
                    setSelectedOutreachCampaign(value);
                    setSelectedFunnelStage("");
                    setSelectedBatch("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select outreach campaign..." />
                  </SelectTrigger>
                  <SelectContent>
                    {outreachCampaigns.filter(c => c.id).length === 0 ? (
                      <SelectItem value="__none__" disabled>
                        No outreach campaigns available
                      </SelectItem>
                    ) : (
                      outreachCampaigns
                        .filter((camp) => camp.id) // Filter out campaigns with empty IDs
                        .map((camp) => {
                          const isPushed = pushingCompanyId &&
                            companies.find(c => c.id === pushingCompanyId)?.pushed_to_campaigns?.includes(camp.id);
                          return (
                            <SelectItem key={camp.id} value={camp.id}>
                              <span className="flex items-center gap-2">
                                {camp.name}
                                {isPushed && <Check className="h-3 w-3 text-green-500" />}
                              </span>
                            </SelectItem>
                          );
                        })
                    )}
                  </SelectContent>
                </Select>
              </div>

              {selectedOutreachCampaign && (
                <>
                  {/* Warning if already pushed to this campaign */}
                  {pushingCompanyId &&
                    companies.find(c => c.id === pushingCompanyId)?.pushed_to_campaigns?.includes(selectedOutreachCampaign) && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                        <p className="text-sm">
                          This company was already pushed to this campaign. Pushing again will only create contacts that don&apos;t exist yet.
                        </p>
                      </div>
                    )}

                  {outreachCampaignFunnelStages.length > 0 && (
                    <div className="space-y-2">
                      <Label htmlFor="funnel_stage">Funnel Stage (Optional)</Label>
                      <Select
                        value={selectedFunnelStage || "__none__"}
                        onValueChange={(value) => setSelectedFunnelStage(value === "__none__" ? "" : value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select funnel stage..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {outreachCampaignFunnelStages.map((stage) => (
                            <SelectItem key={stage.id} value={stage.id}>
                              {stage.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {outreachCampaignBatches.length > 0 && (
                    <div className="space-y-2">
                      <Label htmlFor="batch">Batch (Optional)</Label>
                      <Select
                        value={selectedBatch || "__none__"}
                        onValueChange={(value) => setSelectedBatch(value === "__none__" ? "" : value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select batch..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {outreachCampaignBatches.map((batch) => (
                            <SelectItem key={batch.id} value={batch.id}>
                              {batch.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsPushDialogOpen(false);
                  setSelectedOutreachCampaign("");
                  setSelectedFunnelStage("");
                  setSelectedBatch("");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (pushingCompanyId) {
                    handlePushToOutreach(pushingCompanyId);
                  }
                }}
                disabled={!selectedOutreachCampaign || !pushingCompanyId}
              >
                {pushingCompanyId ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Pushing...
                  </>
                ) : (
                  <>
                    <ArrowRight className="mr-2 h-4 w-4" />
                    Push to Outreach
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Person to Company Dialog */}
        <Dialog open={isAddPersonOpen} onOpenChange={setIsAddPersonOpen}>
          <DialogContent>
            <form onSubmit={async (e) => {
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
                  description: "The person has been added to this company.",
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
            }}>
              <DialogHeader>
                <DialogTitle>Add Person to Company</DialogTitle>
                <DialogDescription>
                  Add a person to this lead company.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="person_first_name">First Name</Label>
                    <Input
                      id="person_first_name"
                      value={newPerson.first_name}
                      onChange={(e) =>
                        setNewPerson({ ...newPerson, first_name: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="person_last_name">Last Name</Label>
                    <Input
                      id="person_last_name"
                      value={newPerson.last_name}
                      onChange={(e) =>
                        setNewPerson({ ...newPerson, last_name: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="person_email">Email *</Label>
                  <Input
                    id="person_email"
                    type="email"
                    value={newPerson.email}
                    onChange={(e) =>
                      setNewPerson({ ...newPerson, email: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="person_title">Title</Label>
                  <Input
                    id="person_title"
                    placeholder="e.g., CEO, Marketing Manager"
                    value={newPerson.title}
                    onChange={(e) =>
                      setNewPerson({ ...newPerson, title: e.target.value })
                    }
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsAddPersonOpen(false);
                    setSelectedCompanyForPerson("");
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isCreating}>
                  {isCreating ? "Adding..." : "Add Person"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Regular outreach campaign view (existing UI)
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{campaign.name}</h1>
          <p className="text-muted-foreground mt-1">
            {campaign.description || "No description"}
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <Tabs defaultValue="contacts" className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="contacts" className="gap-2">
              <Mail className="h-4 w-4" />
              Contacts
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href={`/campaigns/${campaignId}/templates`}>
                <FileText className="mr-2 h-4 w-4" />
                Templates
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/campaigns/${campaignId}/import`}>
                <Upload className="mr-2 h-4 w-4" />
                Import CSV
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/campaigns/${campaignId}/settings`}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/campaigns/${campaignId}/funnel`}>
                <GitBranch className="mr-2 h-4 w-4" />
                Funnel
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/campaigns/${campaignId}/dashboard`}>
                <BarChart3 className="mr-2 h-4 w-4" />
                Dashboard
              </Link>
            </Button>
          </div>
        </div>

        {/* Contacts Tab */}
        <TabsContent value="contacts" className="space-y-4">
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
              {batches.length > 0 && (
                <div className="flex items-center gap-1">
                  <Select value={batchFilter} onValueChange={setBatchFilter}>
                    <SelectTrigger className="w-[200px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <Layers className="h-4 w-4 flex-shrink-0" />
                        {(() => {
                          if (batchFilter === "all") {
                            return <span className="truncate">All Batches</span>;
                          }
                          if (batchFilter === "none") {
                            return <span className="truncate">No Batch</span>;
                          }
                          const batch = batches.find(b => b.id === batchFilter);
                          if (batch) {
                            return <span className="truncate">{batch.name}</span>;
                          }
                          return <span className="truncate">Filter by batch</span>;
                        })()}
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Batches</SelectItem>
                      <SelectItem value="none">No Batch</SelectItem>
                      {batches.map((batch) => (
                        <SelectItem key={batch.id} value={batch.id}>
                          <span className="flex items-center justify-between w-full">
                            {batch.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {batchFilter && batchFilter !== "all" && batchFilter !== "none" && (
                    <Button variant="ghost" size="icon" className="h-9 w-9" asChild>
                      <Link href={`/campaigns/${campaignId}/batches/${batchFilter}`}>
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {selectedContacts.size > 0 && (
                <>
                  <Button variant="default" asChild>
                    <Link href={`/campaigns/${campaignId}/send?contacts=${Array.from(selectedContacts).join(",")}`}>
                      <Send className="mr-2 h-4 w-4" />
                      Send to {selectedContacts.size} selected
                    </Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href={`/campaigns/${campaignId}/follow-ups?contacts=${Array.from(selectedContacts).join(",")}`}>
                      <Reply className="mr-2 h-4 w-4" />
                      Follow-up {selectedContacts.size} selected
                    </Link>
                  </Button>
                </>
              )}
              <Button variant="outline" asChild>
                <Link href={`/campaigns/${campaignId}/follow-ups`}>
                  <Reply className="mr-2 h-4 w-4" />
                  Follow-ups
                </Link>
              </Button>
              <Dialog open={isAddBatchOpen} onOpenChange={setIsAddBatchOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Layers className="mr-2 h-4 w-4" />
                    Create Batch
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <form onSubmit={handleAddBatch}>
                    <DialogHeader>
                      <DialogTitle>Create Batch</DialogTitle>
                      <DialogDescription>
                        Create a new batch to organize your contacts.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="batch_name">Batch Name *</Label>
                        <Input
                          id="batch_name"
                          placeholder="e.g., Day 1 - January 2026"
                          value={newBatchName}
                          onChange={(e) => setNewBatchName(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsAddBatchOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isCreating}>
                        {isCreating ? "Creating..." : "Create Batch"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
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
                      <DialogTitle>Add Contact</DialogTitle>
                      <DialogDescription>
                        Add a new contact to this campaign.
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
                                {companies.map((company) => (
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
                      <div className="space-y-2">
                        <Label htmlFor="batch">Batch</Label>
                        <Select
                          value={newContact.batch}
                          onValueChange={(value) =>
                            setNewContact({ ...newContact, batch: value === "__none__" ? "" : value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a batch (optional)" />
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
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsAddContactOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" loading={isCreating}>
                        Add Contact
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
                  <TableHead>Batch</TableHead>
                  <TableHead>Funnel Stage</TableHead>
                  {(campaign?.kind === 'outreach' || !campaign?.kind) && (
                    <TableHead>AI Opener</TableHead>
                  )}
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
                      colSpan={9 + (campaign?.kind === 'outreach' || !campaign?.kind ? 1 : 0) + customFields.length}
                      className="text-center py-8 text-muted-foreground"
                    >
                      {searchQuery || stageFilter !== "all"
                        ? "No contacts match your filters"
                        : "No contacts yet. Add your first contact or import from CSV."}
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
                        {editingContactId === contact.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editingContact.first_name || ""}
                              onChange={(e) =>
                                setEditingContact({ ...editingContact, first_name: e.target.value })
                              }
                              className="h-8 w-24"
                              placeholder="First"
                            />
                            <Input
                              value={editingContact.last_name || ""}
                              onChange={(e) =>
                                setEditingContact({ ...editingContact, last_name: e.target.value })
                              }
                              className="h-8 w-24"
                              placeholder="Last"
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                try {
                                  const pb = getClientPB();
                                  await updateContact(pb, contact.id, editingContact);
                                  toast({
                                    title: "Contact updated",
                                    description: "Contact has been updated.",
                                  });
                                  setEditingContactId(null);
                                  setEditingContact({});
                                  loadData();
                                } catch (error) {
                                  console.error("Failed to update contact:", error);
                                  toast({
                                    title: "Error",
                                    description: "Failed to update contact.",
                                    variant: "destructive",
                                  });
                                }
                              }}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingContactId(null);
                                setEditingContact({});
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            {contact.first_name} {contact.last_name}
                            {campaign?.kind === 'outreach' || !campaign?.kind ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingContactId(contact.id);
                                  setEditingContact({
                                    first_name: contact.first_name,
                                    last_name: contact.last_name,
                                    email: contact.email,
                                    title: contact.title,
                                  });
                                }}
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                            ) : null}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingContactId === contact.id ? (
                          <Input
                            value={editingContact.email || ""}
                            onChange={(e) =>
                              setEditingContact({ ...editingContact, email: e.target.value })
                            }
                            className="h-8"
                            type="email"
                          />
                        ) : (
                          contact.email
                        )}
                      </TableCell>
                      <TableCell>
                        {editingContactId === contact.id ? (
                          <Input
                            value={editingContact.title || ""}
                            onChange={(e) =>
                              setEditingContact({ ...editingContact, title: e.target.value })
                            }
                            className="h-8"
                            placeholder="Title"
                          />
                        ) : (
                          contact.title || "-"
                        )}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          // For outreach campaigns, show source company (from leads)
                          if (campaign?.kind === 'outreach' || !campaign?.kind) {
                            if (contact.source_company) {
                              const sourceCompany = sourceCompanies.get(contact.source_company);
                              if (sourceCompany) {
                                // Find the lead campaign this company belongs to
                                const leadCampaignId = sourceCompany.campaign;
                                return (
                                  <Link
                                    href={`/campaigns/${leadCampaignId}/companies/${sourceCompany.id}`}
                                    className="text-primary hover:underline"
                                  >
                                    {sourceCompany.name}
                                  </Link>
                                );
                              }
                            }
                            return "-";
                          }
                          // For leads campaigns, show regular company
                          return contact.expand?.company?.name || "-";
                        })()}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={contact.batch || "__none__"}
                          onValueChange={(value) => handleContactBatchChange(contact.id, value)}
                        >
                          <SelectTrigger className="w-[140px] h-8 text-sm">
                            <SelectValue>
                              {contact.expand?.batch ? (
                                <span className="flex items-center gap-2">
                                  <Layers className="h-3 w-3 text-muted-foreground" />
                                  <span className="truncate">{contact.expand.batch.name}</span>
                                </span>
                              ) : (
                                <span className="text-muted-foreground">No batch</span>
                              )}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">
                              <span className="text-muted-foreground">No batch</span>
                            </SelectItem>
                            {batches.map((batch) => (
                              <SelectItem key={batch.id} value={batch.id}>
                                <span className="flex items-center gap-2">
                                  <Layers className="h-3 w-3" />
                                  {batch.name}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                      {(campaign?.kind === 'outreach' || !campaign?.kind) && (
                        <TableCell>
                          {contact.ai_opener ? (
                            <div className="max-w-xs">
                              <p className="text-sm line-clamp-2">{contact.ai_opener}</p>
                              <div className="flex gap-1 mt-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={() => handleCopyOpener(contact.ai_opener!)}
                                  title="Copy opener"
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={() => handleEditOpener(contact.id, contact.ai_opener!)}
                                  title="Edit opener"
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-xs px-2"
                                  onClick={() => handleGenerateOpener(contact.id)}
                                  disabled={generatingOpenerId === contact.id}
                                  title="Regenerate opener"
                                >
                                  {generatingOpenerId === contact.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Sparkles className="h-3 w-3" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleGenerateOpener(contact.id)}
                              disabled={generatingOpenerId === contact.id}
                            >
                              {generatingOpenerId === contact.id ? (
                                <>
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  Generating...
                                </>
                              ) : (
                                <>
                                  <Sparkles className="h-3 w-3 mr-1" />
                                  Generate AI Opener
                                </>
                              )}
                            </Button>
                          )}
                        </TableCell>
                      )}
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
        </TabsContent>

      </Tabs>

      {/* Edit AI Opener Dialog */}
      <Dialog open={!!editingOpenerId} onOpenChange={(open) => !open && setEditingOpenerId(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit AI Opener</DialogTitle>
            <DialogDescription>
              Modify the AI-generated opener for this contact.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              value={editingOpenerText}
              onChange={(e) => setEditingOpenerText(e.target.value)}
              placeholder="Enter your opener..."
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground mt-2">
              This opener will be used as the {`{{ai_opener}}`} variable in your email templates.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditingOpenerId(null);
                setEditingOpenerText("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveOpener}
              disabled={isSavingOpener}
            >
              {isSavingOpener ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
