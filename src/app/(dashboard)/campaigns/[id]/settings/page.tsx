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
} from "lucide-react";
import type { Campaign, CustomField, CustomFieldType, FunnelStage, IndustryType, Batch } from "@/types";
import { DEFAULT_FUNNEL_STAGES, getStageColor, FUNNEL_STAGE_COLORS } from "@/lib/utils";

export default function CampaignSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Campaign form
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    description: "",
    industry_type: "text" as IndustryType,
    industry_options: [] as string[],
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
  const [newStage, setNewStage] = useState({ name: "", color: FUNNEL_STAGE_COLORS[0] });

  // Batch form
  const [isAddBatchOpen, setIsAddBatchOpen] = useState(false);
  const [newBatch, setNewBatch] = useState({ name: "" });

  const loadData = useCallback(async () => {
    try {
      const pb = getClientPB();
      const [campaignData, fieldsData, stagesData, batchesData] = await Promise.all([
        getCampaign(pb, campaignId),
        getCustomFields(pb, campaignId),
        getFunnelStages(pb, campaignId),
        getBatches(pb, campaignId),
      ]);

      setCampaign(campaignData);
      setCampaignForm({
        name: campaignData.name,
        description: campaignData.description || "",
        industry_type: campaignData.industry_type || "text",
        industry_options: campaignData.industry_options || [],
      });
      setCustomFields(fieldsData);
      setFunnelStages(stagesData);
      setBatches(batchesData);
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
      for (const stage of DEFAULT_FUNNEL_STAGES) {
        await createFunnelStage(pb, {
          name: stage.name,
          order: stage.order,
          color: getStageColor(stage.order),
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
      await createBatch(pb, {
        name: newBatch.name,
        campaign: campaignId,
      });

      toast({
        title: "Batch created",
        description: "New batch has been created.",
        variant: "success",
      });

      setNewBatch({ name: "" });
      setIsAddBatchOpen(false);
      loadData();
    } catch (error) {
      console.error("Failed to create batch:", error);
      toast({
        title: "Error",
        description: "Failed to create batch.",
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
                                className={`w-8 h-8 rounded-full border-2 transition-all ${
                                  newStage.color === color
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
      </Tabs>
    </div>
  );
}
