"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  getClientPB,
  getCampaign,
  updateCampaign,
  getCustomFields,
  createCustomField,
  updateCustomField,
  deleteCustomField,
  getFunnelStages,
  createFunnelStage,
  updateFunnelStage,
  deleteFunnelStage,
  getBatches,
  createBatch,
  deleteBatch,
  isClientResponseError,
  getAIScoringConfigs,
  createAIScoringConfig,
  updateAIScoringConfig,
  deleteAIScoringConfig,
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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/use-toast";
import {
  Plus,
  Trash2,
  GripVertical,
  ArrowLeft,
  Settings,
  Columns,
  GitBranch,
  Layers,
  X,
  Sparkles,
  Edit,
  Copy,
  Upload,
} from "lucide-react";
import type { Campaign, CustomField, CustomFieldType, FunnelStage, IndustryType, Batch, AIScoringConfig, CustomOutputField, CustomOutputType, FirecrawlPageType } from "@/types";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Globe } from "lucide-react";
import { DEFAULT_FUNNEL_STAGES, getStageColor, FUNNEL_STAGE_COLORS } from "@/lib/utils";

export default function CampaignSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [aiConfigs, setAiConfigs] = useState<AIScoringConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Campaign form
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    description: "",
    industry_type: "text" as IndustryType,
    industry_options: [] as string[],
    ai_opener_prompt: "",
    enable_firecrawl: false,
    firecrawl_pages: ["homepage", "about"] as FirecrawlPageType[],
    enable_hunter: true,
  });

  // Industry options form
  const [newIndustryOption, setNewIndustryOption] = useState("");

  // Custom field form
  const [isAddFieldOpen, setIsAddFieldOpen] = useState(false);
  const [newField, setNewField] = useState<{
    name: string;
    field_type: CustomFieldType;
    options: string[];
  }>({
    name: "",
    field_type: "text",
    options: [],
  });
  const [newOption, setNewOption] = useState("");

  // Funnel stage form
  const [isAddStageOpen, setIsAddStageOpen] = useState(false);
  const [newStage, setNewStage] = useState<{ name: string; color: typeof FUNNEL_STAGE_COLORS[number] }>({ name: "", color: FUNNEL_STAGE_COLORS[0] });

  // Batch form
  const [isAddBatchOpen, setIsAddBatchOpen] = useState(false);
  const [newBatch, setNewBatch] = useState({ name: "" });

  // AI Scoring Config form
  const [isAddAIConfigOpen, setIsAddAIConfigOpen] = useState(false);
  const [editingAIConfig, setEditingAIConfig] = useState<AIScoringConfig | null>(null);
  const [aiConfigForm, setAiConfigForm] = useState({
    name: "",
    system_prompt: "",
    enable_score: true,
    score_min: 0,
    score_max: 100,
    enable_classification: true,
    classification_label: "Industry",
    classification_options: [] as string[],
    custom_outputs: [] as CustomOutputField[],
    model: "gpt-4o-mini",
    temperature: 0.3,
  });
  const [newClassificationOption, setNewClassificationOption] = useState("");
  const [isAddCustomOutputOpen, setIsAddCustomOutputOpen] = useState(false);
  const [newCustomOutput, setNewCustomOutput] = useState<Partial<CustomOutputField>>({
    name: "",
    label: "",
    description: "",
    type: "text" as CustomOutputType,
    list_options: [],
    boolean_options: ['true', 'false', 'unknown'],
    nested_json_max_pairs: 10,
  });
  const [newListOption, setNewListOption] = useState("");
  const [newBooleanOption, setNewBooleanOption] = useState<('true' | 'false' | 'unknown')>('true');

  const loadData = useCallback(async () => {
    try {
      const pb = getClientPB();
      const campaignData = await getCampaign(pb, campaignId);

      // Only load batches for outreach campaigns (not leads)
      const batchesPromise = campaignData.kind === 'leads'
        ? Promise.resolve([])
        : getBatches(pb, campaignId);

      const [fieldsData, stagesData, batchesData] = await Promise.all([
        getCustomFields(pb, campaignId),
        getFunnelStages(pb, campaignId),
        batchesPromise,
      ]);

      setCampaign(campaignData);
      setCampaignForm({
        name: campaignData.name,
        description: campaignData.description || "",
        industry_type: campaignData.industry_type || "text",
        industry_options: campaignData.industry_options || [],
        ai_opener_prompt: campaignData.ai_opener_prompt || "",
        enable_firecrawl: campaignData.enable_firecrawl || false,
        firecrawl_pages: campaignData.firecrawl_pages || ["homepage", "about"],
        enable_hunter: campaignData.enable_hunter !== false,
      });
      setCustomFields(fieldsData);
      setFunnelStages(stagesData);
      setBatches(batchesData);

      // Load AI configs if this is a leads campaign
      if (campaignData.kind === 'leads') {
        const configs = await getAIScoringConfigs(pb, campaignId);
        setAiConfigs(configs);
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
      toast({
        title: "Error",
        description: "Failed to load campaign settings.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const pb = getClientPB();
      await updateCampaign(pb, campaignId, {
        name: campaignForm.name,
        description: campaignForm.description,
        industry_type: campaignForm.industry_type,
        industry_options: campaignForm.industry_options,
        ai_opener_prompt: campaignForm.ai_opener_prompt,
        enable_firecrawl: campaignForm.enable_firecrawl,
        firecrawl_pages: campaignForm.firecrawl_pages,
        enable_hunter: campaignForm.enable_hunter,
      });
      toast({
        title: "Settings saved",
        description: "Campaign settings have been updated.",
        variant: "success",
      });
    } catch (error) {
      console.error("Failed to save campaign:", error);
      toast({
        title: "Error",
        description: "Failed to save settings.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const addIndustryOption = () => {
    if (newIndustryOption.trim() && !campaignForm.industry_options.includes(newIndustryOption.trim())) {
      setCampaignForm({
        ...campaignForm,
        industry_options: [...campaignForm.industry_options, newIndustryOption.trim()],
      });
      setNewIndustryOption("");
    }
  };

  const removeIndustryOption = (option: string) => {
    setCampaignForm({
      ...campaignForm,
      industry_options: campaignForm.industry_options.filter((o) => o !== option),
    });
  };

  const handleAddField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newField.name.trim()) return;

    setIsSaving(true);
    try {
      const pb = getClientPB();
      await createCustomField(pb, {
        name: newField.name,
        field_type: newField.field_type,
        options: newField.options,
        order: customFields.length,
        campaign: campaignId,
      });

      toast({
        title: "Field added",
        description: "Custom field has been created.",
        variant: "success",
      });

      setNewField({ name: "", field_type: "text", options: [] });
      setIsAddFieldOpen(false);
      loadData();
    } catch (error) {
      console.error("Failed to add field:", error);
      toast({
        title: "Error",
        description: "Failed to add custom field.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    if (!confirm("Are you sure? This will remove this field from all contacts.")) {
      return;
    }

    try {
      const pb = getClientPB();
      await deleteCustomField(pb, fieldId);
      toast({
        title: "Field deleted",
        description: "Custom field has been removed.",
      });
      loadData();
    } catch (error) {
      console.error("Failed to delete field:", error);
      toast({
        title: "Error",
        description: "Failed to delete custom field.",
        variant: "destructive",
      });
    }
  };

  const handleAddStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStage.name.trim()) return;

    setIsSaving(true);
    try {
      const pb = getClientPB();
      await createFunnelStage(pb, {
        name: newStage.name,
        order: funnelStages.length,
        color: newStage.color,
        campaign: campaignId,
      });

      toast({
        title: "Stage added",
        description: "Funnel stage has been created.",
        variant: "success",
      });

      setNewStage({ name: "", color: FUNNEL_STAGE_COLORS[0] });
      setIsAddStageOpen(false);
      loadData();
    } catch (error) {
      console.error("Failed to add stage:", error);
      toast({
        title: "Error",
        description: "Failed to add funnel stage.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteStage = async (stageId: string) => {
    // Find the stage to check if it's the Uncategorized stage
    const stage = funnelStages.find((s) => s.id === stageId);
    if (stage?.name === "Uncategorized") {
      toast({
        title: "Cannot delete",
        description: "The 'Uncategorized' stage cannot be deleted. It is the default stage for new contacts.",
        variant: "destructive",
      });
      return;
    }

    if (!confirm("Are you sure? Contacts in this stage will be unassigned.")) {
      return;
    }

    try {
      const pb = getClientPB();
      await deleteFunnelStage(pb, stageId);
      toast({
        title: "Stage deleted",
        description: "Funnel stage has been removed.",
      });
      loadData();
    } catch (error) {
      console.error("Failed to delete stage:", error);
      toast({
        title: "Error",
        description: "Failed to delete funnel stage.",
        variant: "destructive",
      });
    }
  };

  const createDefaultStages = async () => {
    setIsSaving(true);
    try {
      const pb = getClientPB();
      for (let i = 0; i < DEFAULT_FUNNEL_STAGES.length; i++) {
        const stage = DEFAULT_FUNNEL_STAGES[i];
        await createFunnelStage(pb, {
          name: stage.name,
          order: i,
          color: getStageColor(stage.color),
          campaign: campaignId,
        });
      }
      toast({
        title: "Stages created",
        description: "Default funnel stages have been added.",
        variant: "success",
      });
      loadData();
    } catch (error) {
      console.error("Failed to create default stages:", error);
      toast({
        title: "Error",
        description: "Failed to create default stages.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBatch.name.trim()) return;

    setIsSaving(true);
    try {
      const pb = getClientPB();
      const createdBatch = await createBatch(pb, {
        name: newBatch.name,
        campaign: campaignId,
      });

      console.log("Batch created successfully:", createdBatch);

      toast({
        title: "Batch created",
        description: "New batch has been created.",
        variant: "success",
      });

      setNewBatch({ name: "" });
      setIsAddBatchOpen(false);

      // Reload data to show the new batch
      await loadData();
    } catch (error) {
      console.error("Failed to create batch:", error);
      const is400or404 = isClientResponseError(error) && (error.status === 400 || error.status === 404);
      toast({
        title: "Error",
        description: is400or404
          ? "Batches collection may be missing. Run: node scripts/add-batches-collection.js"
          : error instanceof Error ? error.message : "Failed to create batch.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteBatch = async (batchId: string) => {
    if (!confirm("Are you sure? Contacts in this batch will no longer be associated with a batch.")) {
      return;
    }

    try {
      const pb = getClientPB();
      await deleteBatch(pb, batchId);
      toast({
        title: "Batch deleted",
        description: "Batch has been removed.",
      });
      loadData();
    } catch (error) {
      console.error("Failed to delete batch:", error);
      toast({
        title: "Error",
        description: "Failed to delete batch.",
        variant: "destructive",
      });
    }
  };

  const addOption = () => {
    if (newOption.trim() && !newField.options.includes(newOption.trim())) {
      setNewField({
        ...newField,
        options: [...newField.options, newOption.trim()],
      });
      setNewOption("");
    }
  };

  const removeOption = (option: string) => {
    setNewField({
      ...newField,
      options: newField.options.filter((o) => o !== option),
    });
  };

  // AI Scoring Config handlers
  const handleSaveAIConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiConfigForm.name.trim() || !aiConfigForm.system_prompt.trim()) return;

    setIsSaving(true);
    try {
      const pb = getClientPB();

      if (editingAIConfig) {
        await updateAIScoringConfig(pb, editingAIConfig.id, {
          name: aiConfigForm.name,
          system_prompt: aiConfigForm.system_prompt,
          enable_score: aiConfigForm.enable_score,
          score_min: aiConfigForm.score_min,
          score_max: aiConfigForm.score_max,
          enable_classification: aiConfigForm.enable_classification,
          classification_label: aiConfigForm.classification_label,
          classification_options: aiConfigForm.classification_options,
          custom_outputs: aiConfigForm.custom_outputs,
          model: aiConfigForm.model,
          temperature: aiConfigForm.temperature,
        });
        toast({
          title: "AI Config Updated",
          description: "AI scoring configuration has been updated.",
        });
      } else {
        await createAIScoringConfig(pb, {
          campaign: campaignId,
          name: aiConfigForm.name,
          system_prompt: aiConfigForm.system_prompt,
          enable_score: aiConfigForm.enable_score,
          score_min: aiConfigForm.score_min,
          score_max: aiConfigForm.score_max,
          enable_classification: aiConfigForm.enable_classification,
          classification_label: aiConfigForm.classification_label,
          classification_options: aiConfigForm.classification_options,
          custom_outputs: aiConfigForm.custom_outputs,
          model: aiConfigForm.model,
          temperature: aiConfigForm.temperature,
        });
        toast({
          title: "AI Config Created",
          description: "AI scoring configuration has been created.",
        });
      }

      setAiConfigForm({
        name: "",
        system_prompt: "",
        enable_score: true,
        score_min: 0,
        score_max: 100,
        enable_classification: true,
        classification_label: "Industry",
        classification_options: [],
        custom_outputs: [],
        model: "gpt-4o-mini",
        temperature: 0.3,
      });
      setEditingAIConfig(null);
      setIsAddAIConfigOpen(false);
      loadData();
    } catch (error) {
      console.error("Failed to save AI config:", error);
      toast({
        title: "Error",
        description: "Failed to save AI configuration.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditAIConfig = (config: AIScoringConfig) => {
    setEditingAIConfig(config);
    setAiConfigForm({
      name: config.name,
      system_prompt: config.system_prompt,
      enable_score: config.enable_score,
      score_min: config.score_min || 0,
      score_max: config.score_max || 100,
      enable_classification: config.enable_classification,
      classification_label: config.classification_label || "Industry",
      classification_options: config.classification_options || [],
      custom_outputs: config.custom_outputs || [],
      model: config.model || "gpt-4o-mini",
      temperature: config.temperature || 0.3,
    });
    setIsAddAIConfigOpen(true);
  };

  const handleDeleteAIConfig = async (configId: string) => {
    if (!confirm("Are you sure? This will remove the AI scoring configuration.")) {
      return;
    }

    try {
      const pb = getClientPB();
      await deleteAIScoringConfig(pb, configId);
      toast({
        title: "AI Config Deleted",
        description: "AI scoring configuration has been removed.",
      });
      loadData();
    } catch (error) {
      console.error("Failed to delete AI config:", error);
      toast({
        title: "Error",
        description: "Failed to delete AI configuration.",
        variant: "destructive",
      });
    }
  };

  const addClassificationOption = () => {
    if (newClassificationOption.trim() && !aiConfigForm.classification_options.includes(newClassificationOption.trim())) {
      setAiConfigForm({
        ...aiConfigForm,
        classification_options: [...aiConfigForm.classification_options, newClassificationOption.trim()],
      });
      setNewClassificationOption("");
    }
  };

  const removeClassificationOption = (option: string) => {
    setAiConfigForm({
      ...aiConfigForm,
      classification_options: aiConfigForm.classification_options.filter((o) => o !== option),
    });
  };

  // Custom Output handlers
  const handleAddCustomOutput = () => {
    if (!newCustomOutput.name?.trim() || !newCustomOutput.label?.trim() || !newCustomOutput.description?.trim()) {
      toast({
        title: "Missing Fields",
        description: "Please fill in name, label, and description.",
        variant: "destructive",
      });
      return;
    }

    const customOutput: CustomOutputField = {
      id: `custom_${Date.now()}`,
      name: newCustomOutput.name.trim(),
      label: newCustomOutput.label.trim(),
      description: newCustomOutput.description.trim(),
      type: newCustomOutput.type || "text",
      list_options: newCustomOutput.type === "list" ? (newCustomOutput.list_options || []) : undefined,
      list_description: newCustomOutput.type === "list" ? newCustomOutput.list_description : undefined,
      nested_json_max_pairs: newCustomOutput.type === "nested_json" ? (newCustomOutput.nested_json_max_pairs || 10) : undefined,
      nested_json_description: newCustomOutput.type === "nested_json" ? newCustomOutput.nested_json_description : undefined,
      boolean_options: newCustomOutput.type === "boolean" ? (newCustomOutput.boolean_options || ['true', 'false', 'unknown']) : undefined,
    };

    setAiConfigForm({
      ...aiConfigForm,
      custom_outputs: [...aiConfigForm.custom_outputs, customOutput],
    });

    // Reset form
    setNewCustomOutput({
      name: "",
      label: "",
      description: "",
      type: "text",
      list_options: [],
      boolean_options: ['true', 'false', 'unknown'],
      nested_json_max_pairs: 10,
    });
    setIsAddCustomOutputOpen(false);
  };

  const handleRemoveCustomOutput = (id: string) => {
    setAiConfigForm({
      ...aiConfigForm,
      custom_outputs: (aiConfigForm.custom_outputs || []).filter(co => co.id !== id),
    });
  };

  const addListOption = () => {
    if (newListOption.trim() && !newCustomOutput.list_options?.includes(newListOption.trim())) {
      setNewCustomOutput({
        ...newCustomOutput,
        list_options: [...(newCustomOutput.list_options || []), newListOption.trim()],
      });
      setNewListOption("");
    }
  };

  const removeListOption = (option: string) => {
    setNewCustomOutput({
      ...newCustomOutput,
      list_options: newCustomOutput.list_options?.filter(o => o !== option) || [],
    });
  };

  // Generate JSON instructions for AI Scoring Config
  const generateAIScoringInstructions = () => {
    const instructions = `# AI Scoring Configuration JSON Generator

You are helping to generate a JSON configuration for an AI lead scoring system. The user will describe their scoring criteria, and you should generate a valid JSON configuration.

## JSON Schema

\`\`\`typescript
interface AIScoringConfig {
  name: string;                        // Configuration name (e.g., "SaaS ICP Scorer")
  system_prompt: string;               // Main prompt/criteria for AI evaluation
  enable_score: boolean;               // Whether to enable numeric scoring
  score_min?: number;                  // Minimum score (default: 0)
  score_max?: number;                  // Maximum score (default: 100)
  enable_classification: boolean;      // Whether to enable classification
  classification_label?: string;       // Label for classification field (e.g., "Industry", "Category")
  classification_options?: string[];   // Array of classification options to choose from
  custom_outputs?: CustomOutputField[]; // Array of custom output fields
  model?: string;                      // OpenAI model: "gpt-4o-mini" | "gpt-4o" | "gpt-4-turbo"
  temperature?: number;                // Temperature 0-2 (default: 0.3, lower = more consistent)
}

interface CustomOutputField {
  id: string;                          // Unique ID (use format: "custom_" + timestamp or descriptive name)
  name: string;                        // JSON key name (e.g., "industry_fit")
  label: string;                       // Display label (e.g., "Industry Fit")
  description: string;                 // Description telling AI what to extract/return
  type: "text" | "number" | "boolean" | "list" | "nested_json";
  // For 'list' type:
  list_options?: string[];             // Options to choose from
  list_description?: string;           // How to pick from the list
  // For 'boolean' type:
  boolean_options?: ("true" | "false" | "unknown")[]; // Which values are valid (default: all three)
  // For 'nested_json' type:
  nested_json_max_pairs?: number;      // Max key-value pairs (default: 10)
  nested_json_description?: string;    // What the JSON structure should contain
}
\`\`\`

## Example JSON Configuration

\`\`\`json
{
  "name": "SaaS B2B Lead Scorer",
  "system_prompt": "You are evaluating B2B SaaS companies for investment potential. Score them based on:\\n1. Business Model (B2B vs B2C)\\n2. Revenue Model (Recurring vs One-time)\\n3. Market Size\\n4. Team Experience\\n5. Product-Market Fit indicators",
  "enable_score": true,
  "score_min": 0,
  "score_max": 100,
  "enable_classification": true,
  "classification_label": "Investment Stage",
  "classification_options": ["Pre-seed", "Seed", "Series A", "Series B+", "Not a fit"],
  "custom_outputs": [
    {
      "id": "custom_business_model",
      "name": "business_model",
      "label": "Business Model",
      "description": "Identify if this is B2B, B2C, or B2B2C based on their website and description",
      "type": "list",
      "list_options": ["B2B", "B2C", "B2B2C", "Unknown"],
      "list_description": "Select based on their primary customer type"
    },
    {
      "id": "custom_has_recurring",
      "name": "has_recurring_revenue",
      "label": "Recurring Revenue",
      "description": "Determine if the company has a subscription or recurring revenue model",
      "type": "boolean",
      "boolean_options": ["true", "false", "unknown"]
    },
    {
      "id": "custom_key_signals",
      "name": "key_signals",
      "label": "Key Signals",
      "description": "Extract key investment signals like funding history, notable customers, growth indicators",
      "type": "nested_json",
      "nested_json_max_pairs": 5,
      "nested_json_description": "Key-value pairs where keys are signal types (e.g., 'funding', 'customers', 'growth') and values are the relevant details"
    },
    {
      "id": "custom_summary",
      "name": "analysis_summary",
      "label": "Analysis Summary",
      "description": "Provide a 2-3 sentence summary of why this company scored the way it did",
      "type": "text"
    }
  ],
  "model": "gpt-4o-mini",
  "temperature": 0.3
}
\`\`\`

## Instructions

When the user describes their scoring needs:
1. Create an appropriate \`name\` that describes the scoring purpose
2. Write a detailed \`system_prompt\` with clear scoring criteria
3. Set \`enable_score\` and configure the score range if needed
4. Set up \`classification_label\` and \`classification_options\` if categorization is needed
5. Add \`custom_outputs\` for any additional data points to extract
6. Choose an appropriate \`model\` (gpt-4o-mini for speed/cost, gpt-4o for complex analysis)
7. Set \`temperature\` (0.1-0.3 for consistent scoring, higher for more creative analysis)

Output ONLY the JSON configuration, no explanation needed.`;

    navigator.clipboard.writeText(instructions);
    toast({
      title: "Copied!",
      description: "AI Scoring JSON instructions copied to clipboard.",
    });
  };

  // Generate JSON instructions for AI Opener Config
  const generateAIOpenerInstructions = () => {
    const instructions = `# AI Opener Configuration JSON Generator

You are helping to generate a JSON configuration for an AI email opener generator. The user will describe their outreach style, and you should generate a valid JSON configuration.

## JSON Schema

\`\`\`typescript
interface AIOpenerConfig {
  ai_opener_prompt: string;  // System prompt for generating personalized email openers
}
\`\`\`

## Context

This prompt will be used to generate personalized one-liner openers for cold emails. The AI will receive:
- Contact info: name, email, title
- Company info: name, website, industry, description
- AI analysis data from the source company (if available from lead scoring)

## Example JSON Configuration

\`\`\`json
{
  "ai_opener_prompt": "You are a professional email outreach specialist focused on B2B SaaS sales. Generate a personalized, engaging one-liner opener for cold emails.\\n\\nGuidelines:\\n1. Reference something specific about their company (recent news, product, or achievement)\\n2. Connect it to a relevant pain point or opportunity\\n3. Keep it concise (one sentence, max two)\\n4. Avoid generic phrases like 'I hope this email finds you well'\\n5. Sound natural and human, not salesy\\n6. When possible, reference their role or industry expertise\\n\\nTone: Professional but warm, curious, and value-focused."
}
\`\`\`

## More Examples

### For Technical/Developer Outreach:
\`\`\`json
{
  "ai_opener_prompt": "Generate a technical, peer-to-peer style opener for developer-focused outreach. Reference specific technologies they use, open source contributions, or technical blog posts. Avoid marketing speak - write like one engineer talking to another. Keep it brief and genuine."
}
\`\`\`

### For Executive Outreach:
\`\`\`json
{
  "ai_opener_prompt": "Create an executive-level opener that demonstrates business acumen. Reference company metrics, market position, strategic initiatives, or industry trends. Be concise and respect their time. Focus on business outcomes rather than features."
}
\`\`\`

### For Startup Founders:
\`\`\`json
{
  "ai_opener_prompt": "Write a founder-to-founder style opener. Reference their company journey, funding news, product launches, or the problem they're solving. Be authentic and show genuine interest in their mission. Entrepreneurs appreciate directness - get to the point quickly."
}
\`\`\`

## Instructions

When the user describes their outreach style:
1. Understand their target audience (executives, developers, marketers, etc.)
2. Identify the tone they want (professional, casual, technical, etc.)
3. Note any specific elements they want to reference (company news, products, etc.)
4. Include guidelines for what to avoid
5. Set expectations for length and style

Output ONLY the JSON configuration with the \`ai_opener_prompt\` field.`;

    navigator.clipboard.writeText(instructions);
    toast({
      title: "Copied!",
      description: "AI Opener JSON instructions copied to clipboard.",
    });
  };

  // Handle JSON file upload for AI Scoring Config
  const handleAIScoringJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);

        // Validate and apply the config
        setAiConfigForm({
          name: json.name || "",
          system_prompt: json.system_prompt || "",
          enable_score: json.enable_score ?? true,
          score_min: json.score_min ?? 0,
          score_max: json.score_max ?? 100,
          enable_classification: json.enable_classification ?? false,
          classification_label: json.classification_label || "Industry",
          classification_options: json.classification_options || [],
          custom_outputs: (json.custom_outputs || []).map((co: any, idx: number) => ({
            id: co.id || `custom_${Date.now()}_${idx}`,
            name: co.name || "",
            label: co.label || "",
            description: co.description || "",
            type: co.type || "text",
            list_options: co.list_options || [],
            list_description: co.list_description || "",
            boolean_options: co.boolean_options || ['true', 'false', 'unknown'],
            nested_json_max_pairs: co.nested_json_max_pairs || 10,
            nested_json_description: co.nested_json_description || "",
          })),
          model: json.model || "gpt-4o-mini",
          temperature: json.temperature ?? 0.3,
        });

        setIsAddAIConfigOpen(true);
        toast({
          title: "JSON Loaded",
          description: "AI Scoring configuration loaded from JSON file. Review and save.",
          variant: "success",
        });
      } catch (error) {
        console.error("Failed to parse JSON:", error);
        toast({
          title: "Invalid JSON",
          description: "The uploaded file is not valid JSON.",
          variant: "destructive",
        });
      }
    };
    reader.readAsText(file);

    // Reset the input so the same file can be uploaded again
    e.target.value = "";
  };

  // Handle JSON file upload for AI Opener Config
  const handleAIOpenerJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);

        if (json.ai_opener_prompt) {
          setCampaignForm({
            ...campaignForm,
            ai_opener_prompt: json.ai_opener_prompt,
          });
          toast({
            title: "JSON Loaded",
            description: "AI Opener prompt loaded from JSON file. Don't forget to save changes!",
            variant: "success",
          });
        } else {
          toast({
            title: "Missing Field",
            description: "JSON must contain 'ai_opener_prompt' field.",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("Failed to parse JSON:", error);
        toast({
          title: "Invalid JSON",
          description: "The uploaded file is not valid JSON.",
          variant: "destructive",
        });
      }
    };
    reader.readAsText(file);

    // Reset the input so the same file can be uploaded again
    e.target.value = "";
  };

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
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/campaigns/${campaignId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Campaign Settings</h1>
          <p className="text-muted-foreground">{campaign.name}</p>
        </div>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general" className="gap-2">
            <Settings className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="fields" className="gap-2">
            <Columns className="h-4 w-4" />
            Custom Fields
          </TabsTrigger>
          <TabsTrigger value="funnel" className="gap-2">
            <GitBranch className="h-4 w-4" />
            Funnel Stages
          </TabsTrigger>
          <TabsTrigger value="batches" className="gap-2">
            <Layers className="h-4 w-4" />
            Batches
          </TabsTrigger>
          {campaign?.kind === 'leads' && (
            <TabsTrigger value="ai-scoring" className="gap-2">
              <Sparkles className="h-4 w-4" />
              AI Scoring
            </TabsTrigger>
          )}
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>
                Update your campaign name and description.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveCampaign} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Campaign Name</Label>
                  <Input
                    id="name"
                    value={campaignForm.name}
                    onChange={(e) =>
                      setCampaignForm({ ...campaignForm, name: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={campaignForm.description}
                    onChange={(e) =>
                      setCampaignForm({ ...campaignForm, description: e.target.value })
                    }
                    rows={3}
                  />
                </div>
                {campaign?.kind === 'leads' && (
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <Label htmlFor="enable_hunter">Enable Hunter.io</Label>
                      <p className="text-sm text-muted-foreground">
                        Discover email addresses at company domains when adding new leads
                      </p>
                    </div>
                    <Switch
                      id="enable_hunter"
                      checked={campaignForm.enable_hunter}
                      onCheckedChange={(checked) =>
                        setCampaignForm({ ...campaignForm, enable_hunter: checked })
                      }
                    />
                  </div>
                )}
                {(campaign?.kind === 'outreach' || !campaign?.kind) && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="ai_opener_prompt">AI Opener Prompt</Label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={generateAIOpenerInstructions}
                        >
                          <Copy className="h-4 w-4 mr-1" />
                          Copy JSON Instructions for AI
                        </Button>
                        <div className="relative">
                          <input
                            type="file"
                            accept=".json,application/json"
                            onChange={handleAIOpenerJsonUpload}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          />
                          <Button type="button" variant="outline" size="sm">
                            <Upload className="h-4 w-4 mr-1" />
                            Upload JSON
                          </Button>
                        </div>
                      </div>
                    </div>
                    <Textarea
                      id="ai_opener_prompt"
                      value={campaignForm.ai_opener_prompt}
                      onChange={(e) =>
                        setCampaignForm({ ...campaignForm, ai_opener_prompt: e.target.value })
                      }
                      placeholder="You are a professional email outreach specialist. Generate a personalized, engaging one-liner opener for cold emails. Make it relevant, specific, and attention-grabbing based on the company and contact information provided."
                      rows={5}
                    />
                    <p className="text-xs text-muted-foreground">
                      This prompt will be used to generate AI openers for contacts in this outreach campaign. The AI will use company data and contact information to create personalized openers.
                    </p>
                  </div>
                )}
                <Button type="submit" loading={isSaving}>
                  Save Changes
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Industry Field Configuration</CardTitle>
              <CardDescription>
                Configure how the industry field works for companies in this campaign.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveCampaign} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="industry_type">Industry Field Type</Label>
                  <Select
                    value={campaignForm.industry_type}
                    onValueChange={(value: IndustryType) =>
                      setCampaignForm({ ...campaignForm, industry_type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Free Text Input</SelectItem>
                      <SelectItem value="dropdown">Dropdown with Options</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    {campaignForm.industry_type === "text"
                      ? "Users can type any industry value when creating companies."
                      : "Users must select from predefined industry options."}
                  </p>
                </div>

                {campaignForm.industry_type === "dropdown" && (
                  <div className="space-y-2">
                    <Label>Industry Options</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add an industry option"
                        value={newIndustryOption}
                        onChange={(e) => setNewIndustryOption(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addIndustryOption();
                          }
                        }}
                      />
                      <Button type="button" onClick={addIndustryOption}>
                        Add
                      </Button>
                    </div>
                    {campaignForm.industry_options.length > 0 ? (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {campaignForm.industry_options.map((option) => (
                          <Badge
                            key={option}
                            variant="secondary"
                            className="gap-1"
                          >
                            {option}
                            <button
                              type="button"
                              onClick={() => removeIndustryOption(option)}
                              className="ml-1 hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No options added yet. Add industry options that users can select from.
                      </p>
                    )}
                  </div>
                )}

                <Button type="submit" loading={isSaving}>
                  Save Industry Settings
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Firecrawl Settings - Only for leads campaigns */}
          {campaign?.kind === 'leads' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Website Scraping (Firecrawl)
                </CardTitle>
                <CardDescription>
                  Automatically scrape company websites to gather more data for AI scoring.
                  When enabled, the system will discover and cache key pages when adding companies.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveCampaign} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="enable_firecrawl">Enable Website Scraping</Label>
                      <p className="text-sm text-muted-foreground">
                        Scrape company websites to enrich AI scoring with actual page content
                      </p>
                    </div>
                    <Switch
                      id="enable_firecrawl"
                      checked={campaignForm.enable_firecrawl}
                      onCheckedChange={(checked) =>
                        setCampaignForm({ ...campaignForm, enable_firecrawl: checked })
                      }
                    />
                  </div>

                  {campaignForm.enable_firecrawl && (
                    <div className="space-y-3 pt-4 border-t">
                      <Label>Pages to Scrape</Label>
                      <p className="text-sm text-muted-foreground">
                        Select which pages to discover and scrape from company websites.
                        The content will be used to provide better context for AI scoring.
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        {(["homepage", "about", "pricing", "careers", "blog", "products", "services", "contact"] as FirecrawlPageType[]).map((pageType) => (
                          <div key={pageType} className="flex items-center space-x-2">
                            <Checkbox
                              id={`page-${pageType}`}
                              checked={campaignForm.firecrawl_pages.includes(pageType)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setCampaignForm({
                                    ...campaignForm,
                                    firecrawl_pages: [...campaignForm.firecrawl_pages, pageType],
                                  });
                                } else {
                                  setCampaignForm({
                                    ...campaignForm,
                                    firecrawl_pages: campaignForm.firecrawl_pages.filter(p => p !== pageType),
                                  });
                                }
                              }}
                            />
                            <Label htmlFor={`page-${pageType}`} className="font-normal capitalize">
                              {pageType === "homepage" ? "Homepage" : pageType.replace("-", " ")}
                            </Label>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Note: Homepage is always included. The system uses pattern matching to find the URLs
                        (e.g., /about, /about-us, /company for the About page).
                      </p>
                    </div>
                  )}

                  <Button type="submit" loading={isSaving}>
                    Save Firecrawl Settings
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Custom Fields */}
        <TabsContent value="fields">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Custom Fields</CardTitle>
                <CardDescription>
                  Add custom columns to track additional data for contacts.
                </CardDescription>
              </div>
              <Dialog open={isAddFieldOpen} onOpenChange={setIsAddFieldOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Field
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <form onSubmit={handleAddField}>
                    <DialogHeader>
                      <DialogTitle>Add Custom Field</DialogTitle>
                      <DialogDescription>
                        Create a new field to track additional contact data.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="field_name">Field Name</Label>
                        <Input
                          id="field_name"
                          placeholder="e.g., LinkedIn URL, Lead Score"
                          value={newField.name}
                          onChange={(e) =>
                            setNewField({ ...newField, name: e.target.value })
                          }
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="field_type">Field Type</Label>
                        <Select
                          value={newField.field_type}
                          onValueChange={(value: CustomFieldType) =>
                            setNewField({ ...newField, field_type: value, options: [] })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="number">Number</SelectItem>
                            <SelectItem value="boolean">Yes/No (Boolean)</SelectItem>
                            <SelectItem value="select">Dropdown (Select)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {newField.field_type === "select" && (
                        <div className="space-y-2">
                          <Label>Options</Label>
                          <div className="flex gap-2">
                            <Input
                              placeholder="Add an option"
                              value={newOption}
                              onChange={(e) => setNewOption(e.target.value)}
                              onKeyPress={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  addOption();
                                }
                              }}
                            />
                            <Button type="button" onClick={addOption}>
                              Add
                            </Button>
                          </div>
                          {newField.options.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {newField.options.map((option) => (
                                <Badge
                                  key={option}
                                  variant="secondary"
                                  className="gap-1"
                                >
                                  {option}
                                  <button
                                    type="button"
                                    onClick={() => removeOption(option)}
                                    className="ml-1 hover:text-destructive"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsAddFieldOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" loading={isSaving}>
                        Add Field
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {customFields.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Columns className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No custom fields yet.</p>
                  <p className="text-sm">Add fields to track additional data about your contacts.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {customFields.map((field) => (
                    <div
                      key={field.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                        <div>
                          <p className="font-medium">{field.name}</p>
                          <p className="text-sm text-muted-foreground capitalize">
                            {field.field_type}
                            {field.field_type === "select" &&
                              field.options?.length > 0 &&
                              ` (${field.options.length} options)`}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteField(field.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Funnel Stages */}
        <TabsContent value="funnel">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Funnel Stages</CardTitle>
                <CardDescription>
                  Define pipeline stages to track contact progress.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                {funnelStages.length === 0 && (
                  <Button variant="outline" onClick={createDefaultStages} loading={isSaving}>
                    Use Default Stages
                  </Button>
                )}
                <Dialog open={isAddStageOpen} onOpenChange={setIsAddStageOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Stage
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <form onSubmit={handleAddStage}>
                      <DialogHeader>
                        <DialogTitle>Add Funnel Stage</DialogTitle>
                        <DialogDescription>
                          Create a new stage in your pipeline.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="stage_name">Stage Name</Label>
                          <Input
                            id="stage_name"
                            placeholder="e.g., Qualified, Negotiation"
                            value={newStage.name}
                            onChange={(e) =>
                              setNewStage({ ...newStage, name: e.target.value })
                            }
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Stage Color</Label>
                          <div className="flex flex-wrap gap-2">
                            {FUNNEL_STAGE_COLORS.map((color) => (
                              <button
                                key={color}
                                type="button"
                                className={`w-8 h-8 rounded-full border-2 transition-all ${newStage.color === color
                                  ? "border-foreground scale-110"
                                  : "border-transparent hover:border-muted-foreground"
                                  }`}
                                style={{ backgroundColor: color }}
                                onClick={() => setNewStage({ ...newStage, color })}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setIsAddStageOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button type="submit" loading={isSaving}>
                          Add Stage
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {funnelStages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <GitBranch className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No funnel stages yet.</p>
                  <p className="text-sm">Add stages or use the default set to get started.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {funnelStages.map((stage, index) => (
                    <div
                      key={stage.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: stage.color || getStageColor(index) }}
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{stage.name}</p>
                            {stage.name === "Uncategorized" && (
                              <Badge variant="secondary" className="text-xs">
                                Default
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Order: {stage.order + 1}
                          </p>
                        </div>
                      </div>
                      {stage.name !== "Uncategorized" ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteStage(stage.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground px-2">Protected</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Batches */}
        <TabsContent value="batches">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Batches</CardTitle>
                <CardDescription>
                  Create batches to group contacts by outreach day (e.g., Day 1, Day 2).
                </CardDescription>
              </div>
              <Dialog open={isAddBatchOpen} onOpenChange={setIsAddBatchOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    New Batch
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <form onSubmit={handleAddBatch}>
                    <DialogHeader>
                      <DialogTitle>Create New Batch</DialogTitle>
                      <DialogDescription>
                        Create a batch to group contacts for daily outreach tracking.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="batch_name">Batch Name</Label>
                        <Input
                          id="batch_name"
                          placeholder="e.g., Day 1, Week 1 - Monday"
                          value={newBatch.name}
                          onChange={(e) =>
                            setNewBatch({ ...newBatch, name: e.target.value })
                          }
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
                      <Button type="submit" loading={isSaving}>
                        Create Batch
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {batches.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Layers className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No batches yet.</p>
                  <p className="text-sm">Create batches to group your daily outreach contacts.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {batches.map((batch) => (
                    <div
                      key={batch.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Layers className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <Link
                            href={`/campaigns/${campaignId}/batches/${batch.id}`}
                            className="font-medium hover:underline"
                          >
                            {batch.name}
                          </Link>
                          <p className="text-sm text-muted-foreground">
                            Created {new Date(batch.created).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/campaigns/${campaignId}/batches/${batch.id}`}>
                            View
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteBatch(batch.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Scoring Tab (Leads campaigns only) */}
        {campaign?.kind === 'leads' && (
          <TabsContent value="ai-scoring" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5" />
                      AI Scoring Configurations
                    </CardTitle>
                    <CardDescription>
                      Configure AI agents to automatically score and classify your leads.
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={generateAIScoringInstructions}
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      Copy JSON Instructions for AI
                    </Button>
                    <div className="relative">
                      <input
                        type="file"
                        accept=".json,application/json"
                        onChange={handleAIScoringJsonUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <Button variant="outline" size="sm">
                        <Upload className="h-4 w-4 mr-1" />
                        Upload JSON
                      </Button>
                    </div>
                    <Dialog open={isAddAIConfigOpen} onOpenChange={(open) => {
                      setIsAddAIConfigOpen(open);
                      if (!open) {
                        setEditingAIConfig(null);
                        setAiConfigForm({
                          name: "",
                          system_prompt: "",
                          enable_score: true,
                          score_min: 0,
                          score_max: 100,
                          enable_classification: true,
                          classification_label: "Industry",
                          classification_options: [],
                          custom_outputs: [],
                          model: "gpt-4o-mini",
                          temperature: 0.3,
                        });
                      }
                    }}>
                      <DialogTrigger asChild>
                        <Button>
                          <Plus className="mr-2 h-4 w-4" />
                          Add AI Config
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                        <form onSubmit={handleSaveAIConfig}>
                          <DialogHeader>
                            <DialogTitle>
                              {editingAIConfig ? "Edit" : "Create"} AI Scoring Configuration
                            </DialogTitle>
                            <DialogDescription>
                              Define how AI should evaluate and score your leads.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <Label htmlFor="ai_name">Configuration Name *</Label>
                              <Input
                                id="ai_name"
                                value={aiConfigForm.name}
                                onChange={(e) =>
                                  setAiConfigForm({ ...aiConfigForm, name: e.target.value })
                                }
                                placeholder="e.g., SaaS ICP Scorer"
                                required
                              />
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="system_prompt">System Prompt / Criteria *</Label>
                              <Textarea
                                id="system_prompt"
                                value={aiConfigForm.system_prompt}
                                onChange={(e) =>
                                  setAiConfigForm({ ...aiConfigForm, system_prompt: e.target.value })
                                }
                                placeholder="You are evaluating SaaS companies. Score them based on: 1) B2B model, 2) Recurring revenue, 3) Team size..."
                                rows={8}
                                required
                              />
                              <p className="text-xs text-muted-foreground">
                                Describe the criteria and evaluation framework for scoring leads.
                              </p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor="model">Model</Label>
                                <Select
                                  value={aiConfigForm.model}
                                  onValueChange={(value) =>
                                    setAiConfigForm({ ...aiConfigForm, model: value })
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="gpt-4o-mini">GPT-4o Mini (Fast, Cost-effective)</SelectItem>
                                    <SelectItem value="gpt-4o">GPT-4o (Most Capable)</SelectItem>
                                    <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="temperature">Temperature: {aiConfigForm.temperature}</Label>
                                <Input
                                  id="temperature"
                                  type="range"
                                  min="0"
                                  max="2"
                                  step="0.1"
                                  value={aiConfigForm.temperature}
                                  onChange={(e) =>
                                    setAiConfigForm({ ...aiConfigForm, temperature: parseFloat(e.target.value) })
                                  }
                                />
                                <p className="text-xs text-muted-foreground">
                                  Lower = more consistent, Higher = more creative
                                </p>
                              </div>
                            </div>

                            <div className="space-y-4 border-t pt-4">
                              <div className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  id="enable_score"
                                  checked={aiConfigForm.enable_score}
                                  onChange={(e) =>
                                    setAiConfigForm({ ...aiConfigForm, enable_score: e.target.checked })
                                  }
                                  className="rounded"
                                />
                                <Label htmlFor="enable_score" className="font-medium">
                                  Enable Score
                                </Label>
                              </div>
                              {aiConfigForm.enable_score && (
                                <div className="grid grid-cols-2 gap-4 pl-6">
                                  <div className="space-y-2">
                                    <Label htmlFor="score_min">Min Score</Label>
                                    <Input
                                      id="score_min"
                                      type="number"
                                      min="0"
                                      value={aiConfigForm.score_min}
                                      onChange={(e) =>
                                        setAiConfigForm({ ...aiConfigForm, score_min: parseInt(e.target.value) || 0 })
                                      }
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label htmlFor="score_max">Max Score</Label>
                                    <Input
                                      id="score_max"
                                      type="number"
                                      min="0"
                                      value={aiConfigForm.score_max}
                                      onChange={(e) =>
                                        setAiConfigForm({ ...aiConfigForm, score_max: parseInt(e.target.value) || 100 })
                                      }
                                    />
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="space-y-4 border-t pt-4">
                              <div className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  id="enable_classification"
                                  checked={aiConfigForm.enable_classification}
                                  onChange={(e) =>
                                    setAiConfigForm({ ...aiConfigForm, enable_classification: e.target.checked })
                                  }
                                  className="rounded"
                                />
                                <Label htmlFor="enable_classification" className="font-medium">
                                  Enable Classification
                                </Label>
                              </div>
                              {aiConfigForm.enable_classification && (
                                <div className="space-y-4 pl-6">
                                  <div className="space-y-2">
                                    <Label htmlFor="classification_label">Classification Label</Label>
                                    <Input
                                      id="classification_label"
                                      value={aiConfigForm.classification_label}
                                      onChange={(e) =>
                                        setAiConfigForm({ ...aiConfigForm, classification_label: e.target.value })
                                      }
                                      placeholder="e.g., Industry, Category, Type"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Classification Options</Label>
                                    <div className="flex gap-2">
                                      <Input
                                        value={newClassificationOption}
                                        onChange={(e) => setNewClassificationOption(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            addClassificationOption();
                                          }
                                        }}
                                        placeholder="e.g., SaaS"
                                      />
                                      <Button
                                        type="button"
                                        variant="outline"
                                        onClick={addClassificationOption}
                                      >
                                        <Plus className="h-4 w-4" />
                                      </Button>
                                    </div>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                      {aiConfigForm.classification_options.map((option) => (
                                        <Badge key={option} variant="secondary" className="flex items-center gap-1">
                                          {option}
                                          <button
                                            type="button"
                                            onClick={() => removeClassificationOption(option)}
                                            className="ml-1 hover:text-destructive"
                                          >
                                            <X className="h-3 w-3" />
                                          </button>
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Custom Outputs Section */}
                            <div className="space-y-4 border-t pt-4">
                              <div className="flex items-center justify-between">
                                <Label className="font-medium text-base">Custom Output Fields</Label>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setIsAddCustomOutputOpen(true)}
                                >
                                  <Plus className="h-4 w-4 mr-1" />
                                  Add Custom Output
                                </Button>
                              </div>

                              {aiConfigForm.custom_outputs?.length > 0 && (
                                <div className="space-y-2">
                                  {(aiConfigForm.custom_outputs || []).map((output) => (
                                    <div key={output.id} className="flex items-start justify-between p-3 border rounded-lg">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium">{output.label}</span>
                                          <Badge variant="secondary">{output.type}</Badge>
                                        </div>
                                        <p className="text-sm text-muted-foreground mt-1">{output.description}</p>
                                        {output.type === "list" && output.list_options && output.list_options.length > 0 && (
                                          <div className="flex flex-wrap gap-1 mt-2">
                                            {output.list_options.map(opt => (
                                              <Badge key={opt} variant="outline" className="text-xs">{opt}</Badge>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="text-muted-foreground hover:text-destructive"
                                        onClick={() => handleRemoveCustomOutput(output.id)}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <DialogFooter>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setIsAddAIConfigOpen(false);
                                setEditingAIConfig(null);
                              }}
                            >
                              Cancel
                            </Button>
                            <Button type="submit" disabled={isSaving}>
                              {isSaving ? "Saving..." : editingAIConfig ? "Update" : "Create"} Config
                            </Button>
                          </DialogFooter>
                        </form>
                      </DialogContent>
                    </Dialog>

                    {/* Add Custom Output Dialog */}
                    <Dialog open={isAddCustomOutputOpen} onOpenChange={setIsAddCustomOutputOpen}>
                      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Add Custom Output Field</DialogTitle>
                          <DialogDescription>
                            Define a custom field that the AI should return in its response.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="custom_name">Field Name (JSON key) *</Label>
                              <Input
                                id="custom_name"
                                value={newCustomOutput.name || ""}
                                onChange={(e) =>
                                  setNewCustomOutput({ ...newCustomOutput, name: e.target.value })
                                }
                                placeholder="e.g., industry_fit"
                                required
                              />
                              <p className="text-xs text-muted-foreground">Used as the JSON key in AI response</p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="custom_label">Display Label *</Label>
                              <Input
                                id="custom_label"
                                value={newCustomOutput.label || ""}
                                onChange={(e) =>
                                  setNewCustomOutput({ ...newCustomOutput, label: e.target.value })
                                }
                                placeholder="e.g., Industry Fit"
                                required
                              />
                              <p className="text-xs text-muted-foreground">Shown in the table</p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="custom_description">Description *</Label>
                            <Textarea
                              id="custom_description"
                              value={newCustomOutput.description || ""}
                              onChange={(e) =>
                                setNewCustomOutput({ ...newCustomOutput, description: e.target.value })
                              }
                              placeholder="Describe what the AI should return for this field..."
                              rows={3}
                              required
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="custom_type">Field Type *</Label>
                            <Select
                              value={newCustomOutput.type || "text"}
                              onValueChange={(value: CustomOutputType) =>
                                setNewCustomOutput({ ...newCustomOutput, type: value })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="text">Text</SelectItem>
                                <SelectItem value="number">Number</SelectItem>
                                <SelectItem value="boolean">Boolean (True/False/Unknown)</SelectItem>
                                <SelectItem value="list">List (Select from options)</SelectItem>
                                <SelectItem value="nested_json">Nested JSON</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* List type options */}
                          {newCustomOutput.type === "list" && (
                            <div className="space-y-4 border-t pt-4">
                              <div className="space-y-2">
                                <Label>List Options</Label>
                                <div className="flex gap-2">
                                  <Input
                                    value={newListOption}
                                    onChange={(e) => setNewListOption(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        addListOption();
                                      }
                                    }}
                                    placeholder="Add option..."
                                  />
                                  <Button type="button" variant="outline" onClick={addListOption}>
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </div>
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {newCustomOutput.list_options?.map((opt) => (
                                    <Badge key={opt} variant="secondary" className="flex items-center gap-1">
                                      {opt}
                                      <button
                                        type="button"
                                        onClick={() => removeListOption(opt)}
                                        className="ml-1 hover:text-destructive"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="list_description">How to Pick from List</Label>
                                <Input
                                  id="list_description"
                                  value={newCustomOutput.list_description || ""}
                                  onChange={(e) =>
                                    setNewCustomOutput({ ...newCustomOutput, list_description: e.target.value })
                                  }
                                  placeholder="e.g., Select the most appropriate option based on..."
                                />
                              </div>
                            </div>
                          )}

                          {/* Boolean type options */}
                          {newCustomOutput.type === "boolean" && (
                            <div className="space-y-2 border-t pt-4">
                              <Label>Boolean Options</Label>
                              <div className="flex gap-2">
                                {(['true', 'false', 'unknown'] as const).map((opt) => (
                                  <div key={opt} className="flex items-center space-x-2">
                                    <input
                                      type="checkbox"
                                      checked={newCustomOutput.boolean_options?.includes(opt) || false}
                                      onChange={(e) => {
                                        const current = newCustomOutput.boolean_options || [];
                                        const updated = e.target.checked
                                          ? [...current, opt]
                                          : current.filter(o => o !== opt);
                                        setNewCustomOutput({ ...newCustomOutput, boolean_options: updated });
                                      }}
                                      className="rounded"
                                    />
                                    <Label className="font-normal capitalize">{opt}</Label>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Nested JSON type options */}
                          {newCustomOutput.type === "nested_json" && (
                            <div className="space-y-4 border-t pt-4">
                              <div className="space-y-2">
                                <Label htmlFor="json_max_pairs">Max Key-Value Pairs</Label>
                                <Input
                                  id="json_max_pairs"
                                  type="number"
                                  min="1"
                                  max="50"
                                  value={newCustomOutput.nested_json_max_pairs || 10}
                                  onChange={(e) =>
                                    setNewCustomOutput({
                                      ...newCustomOutput,
                                      nested_json_max_pairs: parseInt(e.target.value) || 10,
                                    })
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="json_description">JSON Structure Description</Label>
                                <Textarea
                                  id="json_description"
                                  value={newCustomOutput.nested_json_description || ""}
                                  onChange={(e) =>
                                    setNewCustomOutput({ ...newCustomOutput, nested_json_description: e.target.value })
                                  }
                                  placeholder="e.g., Key-value pairs where keys are tags and values are relevance scores..."
                                  rows={3}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                        <DialogFooter>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setIsAddCustomOutputOpen(false);
                              setNewCustomOutput({
                                name: "",
                                label: "",
                                description: "",
                                type: "text",
                                list_options: [],
                                boolean_options: ['true', 'false', 'unknown'],
                                nested_json_max_pairs: 10,
                              });
                            }}
                          >
                            Cancel
                          </Button>
                          <Button type="button" onClick={handleAddCustomOutput}>
                            Add Field
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {aiConfigs.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No AI scoring configurations yet.</p>
                    <p className="text-sm mt-2">Create one to start automatically scoring your leads.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {aiConfigs.map((config) => (
                      <Card key={config.id}>
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div>
                              <CardTitle className="text-lg">{config.name}</CardTitle>
                              <CardDescription className="mt-1">
                                {config.enable_score && config.enable_classification
                                  ? "Score + Classification"
                                  : config.enable_score
                                    ? "Score Only"
                                    : "Classification Only"}
                              </CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditAIConfig(config)}
                              >
                                <Edit className="h-4 w-4 mr-1" />
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-destructive"
                                onClick={() => handleDeleteAIConfig(config.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div>
                            <p className="text-sm font-medium mb-1">System Prompt:</p>
                            <p className="text-sm text-muted-foreground line-clamp-3">
                              {config.system_prompt}
                            </p>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="font-medium">Model:</span> {config.model || "gpt-4o-mini"}
                            </div>
                            <div>
                              <span className="font-medium">Temperature:</span> {config.temperature || 0.3}
                            </div>
                          </div>
                          {config.enable_score && (
                            <div className="text-sm">
                              <span className="font-medium">Score Range:</span> {config.score_min || 0} - {config.score_max || 100}
                            </div>
                          )}
                          {config.enable_classification && config.classification_options && config.classification_options.length > 0 && (
                            <div>
                              <p className="text-sm font-medium mb-1">
                                {config.classification_label || "Classification"} Options:
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {config.classification_options.map((opt) => (
                                  <Badge key={opt} variant="secondary">
                                    {opt}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
