"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  getClientPB,
  getCampaign,
  getEmailTemplateGroups,
  getEmailTemplates,
  createEmailTemplateGroup,
  deleteEmailTemplateGroup,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
  getCustomFields,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/use-toast";
import {
  Plus,
  Trash2,
  Edit,
  MoreVertical,
  ArrowLeft,
  FileText,
  Copy,
  Eye,
  Code,
} from "lucide-react";
import type { Campaign, EmailTemplateGroup, EmailTemplate, CustomField } from "@/types";
import { interpolateTemplate } from "@/lib/utils";

export default function TemplatesPage() {
  const params = useParams();
  const campaignId = params.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [templateGroups, setTemplateGroups] = useState<EmailTemplateGroup[]>([]);
  const [templates, setTemplates] = useState<Map<string, EmailTemplate[]>>(new Map());
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  // Dialog states
  const [isAddGroupOpen, setIsAddGroupOpen] = useState(false);
  const [isAddTemplateOpen, setIsAddTemplateOpen] = useState(false);
  const [isEditTemplateOpen, setIsEditTemplateOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form states
  const [newGroup, setNewGroup] = useState({ name: "" });
  const [newTemplate, setNewTemplate] = useState({
    subject: "",
    body: "",
    is_active: true,
  });
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);

  // Track which field is focused for variable insertion
  const [newTemplateFocusedField, setNewTemplateFocusedField] = useState<'subject' | 'body'>('body');
  const [editTemplateFocusedField, setEditTemplateFocusedField] = useState<'subject' | 'body'>('body');

  const sampleData: Record<string, string> = {
    first_name: "John",
    last_name: "Doe",
    email: "john@example.com",
    title: "CEO",
    company_name: "Acme Inc",
    company_website: "https://acme.com",
    company_industry: "Technology",
  };

  // Add custom field sample data
  customFields.forEach((field) => {
    const key = field.name.toLowerCase().replace(/\s+/g, "_");
    sampleData[key] = `[${field.name}]`;
  });

  const loadData = useCallback(async () => {
    try {
      const pb = getClientPB();
      const [campaignData, groupsData, fieldsData] = await Promise.all([
        getCampaign(pb, campaignId),
        getEmailTemplateGroups(pb, campaignId),
        getCustomFields(pb, campaignId),
      ]);

      setCampaign(campaignData);
      setTemplateGroups(groupsData);
      setCustomFields(fieldsData);

      // Load templates for each group
      const templatesMap = new Map<string, EmailTemplate[]>();
      for (const group of groupsData) {
        const groupTemplates = await getEmailTemplates(pb, group.id);
        templatesMap.set(group.id, groupTemplates);
      }
      setTemplates(templatesMap);

      // Select first group by default
      if (groupsData.length > 0 && !selectedGroup) {
        setSelectedGroup(groupsData[0].id);
      }
    } catch (error) {
      console.error("Failed to load templates:", error);
      toast({
        title: "Error",
        description: "Failed to load email templates.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [campaignId, selectedGroup]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroup.name.trim()) return;

    setIsSaving(true);
    try {
      const pb = getClientPB();
      const group = await createEmailTemplateGroup(pb, {
        name: newGroup.name,
        campaign: campaignId,
      });

      toast({
        title: "Group created",
        description: "Template group has been created.",
        variant: "success",
      });

      setNewGroup({ name: "" });
      setIsAddGroupOpen(false);
      setSelectedGroup(group.id);
      loadData();
    } catch (error) {
      console.error("Failed to create group:", error);
      toast({
        title: "Error",
        description: "Failed to create template group.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm("Delete this template group and all its templates?")) {
      return;
    }

    try {
      const pb = getClientPB();
      await deleteEmailTemplateGroup(pb, groupId);
      toast({
        title: "Group deleted",
        description: "Template group has been deleted.",
      });
      if (selectedGroup === groupId) {
        setSelectedGroup(templateGroups.find(g => g.id !== groupId)?.id || null);
      }
      loadData();
    } catch (error) {
      console.error("Failed to delete group:", error);
      toast({
        title: "Error",
        description: "Failed to delete template group.",
        variant: "destructive",
      });
    }
  };

  const handleAddTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplate.subject.trim() || !newTemplate.body.trim() || !selectedGroup) return;

    setIsSaving(true);
    try {
      const pb = getClientPB();
      await createEmailTemplate(pb, {
        subject: newTemplate.subject,
        body: newTemplate.body,
        is_active: newTemplate.is_active,
        group: selectedGroup,
      });

      toast({
        title: "Template created",
        description: "Email template has been created.",
        variant: "success",
      });

      setNewTemplate({ subject: "", body: "", is_active: true });
      setIsAddTemplateOpen(false);
      loadData();
    } catch (error) {
      console.error("Failed to create template:", error);
      toast({
        title: "Error",
        description: "Failed to create email template.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate) return;

    setIsSaving(true);
    try {
      const pb = getClientPB();
      await updateEmailTemplate(pb, editingTemplate.id, {
        subject: editingTemplate.subject,
        body: editingTemplate.body,
        is_active: editingTemplate.is_active,
      });

      toast({
        title: "Template updated",
        description: "Email template has been updated.",
        variant: "success",
      });

      setEditingTemplate(null);
      setIsEditTemplateOpen(false);
      loadData();
    } catch (error) {
      console.error("Failed to update template:", error);
      toast({
        title: "Error",
        description: "Failed to update email template.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm("Delete this email template?")) {
      return;
    }

    try {
      const pb = getClientPB();
      await deleteEmailTemplate(pb, templateId);
      toast({
        title: "Template deleted",
        description: "Email template has been deleted.",
      });
      loadData();
    } catch (error) {
      console.error("Failed to delete template:", error);
      toast({
        title: "Error",
        description: "Failed to delete email template.",
        variant: "destructive",
      });
    }
  };

  const toggleTemplateActive = async (template: EmailTemplate) => {
    try {
      const pb = getClientPB();
      await updateEmailTemplate(pb, template.id, {
        is_active: !template.is_active,
      });
      loadData();
    } catch (error) {
      console.error("Failed to toggle template:", error);
    }
  };

  // Organize available variables by category
  const variableCategories = {
    contact: [
      { key: "first_name", label: "First Name" },
      { key: "last_name", label: "Last Name" },
      { key: "email", label: "Email" },
      { key: "title", label: "Title" },
    ],
    company: [
      { key: "company_name", label: "Company Name" },
      { key: "company_website", label: "Company Website" },
      { key: "company_industry", label: "Company Industry" },
    ],
    custom: customFields.map(f => ({
      key: f.name.toLowerCase().replace(/\s+/g, "_"),
      label: f.name,
    })),
  };

  const allVariables = [
    ...variableCategories.contact,
    ...variableCategories.company,
    ...variableCategories.custom,
  ];

  const currentGroupTemplates = selectedGroup ? templates.get(selectedGroup) || [] : [];
  const currentGroup = templateGroups.find(g => g.id === selectedGroup);

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/campaigns/${campaignId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Email Templates</h1>
          <p className="text-muted-foreground">{campaign.name}</p>
        </div>
        <Dialog open={isAddGroupOpen} onOpenChange={setIsAddGroupOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              New Group
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleAddGroup}>
              <DialogHeader>
                <DialogTitle>Create Template Group</DialogTitle>
                <DialogDescription>
                  Groups allow you to organize templates for A/B testing. Templates in the same group
                  will be randomly selected when sending.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="group_name">Group Name</Label>
                  <Input
                    id="group_name"
                    placeholder="e.g., Initial Outreach, Follow-up"
                    value={newGroup.name}
                    onChange={(e) => setNewGroup({ name: e.target.value })}
                    required
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsAddGroupOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={isSaving}>
                  Create Group
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {templateGroups.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No template groups yet</h3>
            <p className="text-muted-foreground text-center mb-4 max-w-sm">
              Create a template group to start building your email templates.
            </p>
            <Button onClick={() => setIsAddGroupOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create First Group
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-4 gap-6">
          {/* Groups Sidebar */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground px-2">Template Groups</h3>
            {templateGroups.map((group) => (
              <div
                key={group.id}
                className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                  selectedGroup === group.id
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
                onClick={() => setSelectedGroup(group.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{group.name}</p>
                  <p
                    className={`text-xs ${
                      selectedGroup === group.id
                        ? "text-primary-foreground/80"
                        : "text-muted-foreground"
                    }`}
                  >
                    {templates.get(group.id)?.length || 0} templates
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-8 w-8 ${
                        selectedGroup === group.id ? "hover:bg-primary-foreground/10" : ""
                      }`}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => handleDeleteGroup(group.id)}
                      className="text-red-600"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>

          {/* Templates Content */}
          <div className="col-span-3 space-y-4">
            {selectedGroup && currentGroup && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">{currentGroup.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {currentGroupTemplates.length} templates in this group
                    </p>
                  </div>
                  <Dialog open={isAddTemplateOpen} onOpenChange={setIsAddTemplateOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Template
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <form onSubmit={handleAddTemplate}>
                        <DialogHeader>
                          <DialogTitle>Create Email Template</DialogTitle>
                          <DialogDescription>
                            Create a new email template for {currentGroup.name}.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          {/* Dynamic Variables Reference - Above subject line */}
                          <div className="space-y-3 p-3 border rounded-lg bg-muted/50">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Code className="h-4 w-4" />
                                <Label className="text-sm font-medium">Available Variables (click to insert)</Label>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                Inserting into: <span className="font-medium text-foreground">{newTemplateFocusedField === 'subject' ? 'Subject' : 'Body'}</span>
                              </span>
                            </div>
                            
                            <div className="space-y-2">
                              <p className="text-xs text-muted-foreground font-medium">Contact Fields</p>
                              <div className="flex flex-wrap gap-1">
                                {variableCategories.contact.map((v) => (
                                  <Badge
                                    key={v.key}
                                    variant="secondary"
                                    className="cursor-pointer text-xs hover:bg-primary hover:text-primary-foreground"
                                    onClick={() => {
                                      if (newTemplateFocusedField === 'subject') {
                                        setNewTemplate({
                                          ...newTemplate,
                                          subject: newTemplate.subject + `{{${v.key}}}`,
                                        });
                                      } else {
                                        setNewTemplate({
                                          ...newTemplate,
                                          body: newTemplate.body + `{{${v.key}}}`,
                                        });
                                      }
                                    }}
                                  >
                                    {`{{${v.key}}}`}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            
                            <div className="space-y-2">
                              <p className="text-xs text-muted-foreground font-medium">Company Fields</p>
                              <div className="flex flex-wrap gap-1">
                                {variableCategories.company.map((v) => (
                                  <Badge
                                    key={v.key}
                                    variant="secondary"
                                    className="cursor-pointer text-xs hover:bg-primary hover:text-primary-foreground"
                                    onClick={() => {
                                      if (newTemplateFocusedField === 'subject') {
                                        setNewTemplate({
                                          ...newTemplate,
                                          subject: newTemplate.subject + `{{${v.key}}}`,
                                        });
                                      } else {
                                        setNewTemplate({
                                          ...newTemplate,
                                          body: newTemplate.body + `{{${v.key}}}`,
                                        });
                                      }
                                    }}
                                  >
                                    {`{{${v.key}}}`}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            
                            {variableCategories.custom.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-xs text-muted-foreground font-medium">Custom Fields</p>
                                <div className="flex flex-wrap gap-1">
                                  {variableCategories.custom.map((v) => (
                                    <Badge
                                      key={v.key}
                                      variant="outline"
                                      className="cursor-pointer text-xs hover:bg-primary hover:text-primary-foreground"
                                      onClick={() => {
                                        if (newTemplateFocusedField === 'subject') {
                                          setNewTemplate({
                                            ...newTemplate,
                                            subject: newTemplate.subject + `{{${v.key}}}`,
                                          });
                                        } else {
                                          setNewTemplate({
                                            ...newTemplate,
                                            body: newTemplate.body + `{{${v.key}}}`,
                                          });
                                        }
                                      }}
                                    >
                                      {`{{${v.key}}}`}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="subject">Subject Line</Label>
                            <Input
                              id="subject"
                              placeholder="e.g., Quick question about {{company_name}}"
                              value={newTemplate.subject}
                              onChange={(e) =>
                                setNewTemplate({ ...newTemplate, subject: e.target.value })
                              }
                              onFocus={() => setNewTemplateFocusedField('subject')}
                              required
                            />
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="body">Email Body (HTML)</Label>
                            <Textarea
                              id="body"
                              placeholder="<p>Hi {{first_name}},</p><p>I noticed {{company_name}} is...</p>"
                              value={newTemplate.body}
                              onChange={(e) =>
                                setNewTemplate({ ...newTemplate, body: e.target.value })
                              }
                              onFocus={() => setNewTemplateFocusedField('body')}
                              rows={10}
                              className="font-mono text-sm"
                              required
                            />
                          </div>
                          <div className="flex items-center space-x-2">
                            <Switch
                              id="is_active"
                              checked={newTemplate.is_active}
                              onCheckedChange={(checked) =>
                                setNewTemplate({ ...newTemplate, is_active: checked })
                              }
                            />
                            <Label htmlFor="is_active">Active (include in A/B rotation)</Label>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsAddTemplateOpen(false)}
                          >
                            Cancel
                          </Button>
                          <Button type="submit" loading={isSaving}>
                            Create Template
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>

                {currentGroupTemplates.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-8">
                      <p className="text-muted-foreground text-center">
                        No templates in this group yet. Add your first template to get started.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {currentGroupTemplates.map((template) => (
                      <Card key={template.id}>
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <CardTitle className="text-base">
                                  {template.subject}
                                </CardTitle>
                                {!template.is_active && (
                                  <Badge variant="secondary">Inactive</Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={template.is_active}
                                onCheckedChange={() => toggleTemplateActive(template)}
                              />
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setPreviewTemplate(template);
                                      setIsPreviewOpen(true);
                                    }}
                                  >
                                    <Eye className="mr-2 h-4 w-4" />
                                    Preview
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setEditingTemplate(template);
                                      setIsEditTemplateOpen(true);
                                    }}
                                  >
                                    <Edit className="mr-2 h-4 w-4" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleDeleteTemplate(template.id)}
                                    className="text-red-600"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="text-sm text-muted-foreground line-clamp-2 font-mono">
                            {template.body.replace(/<[^>]*>/g, "").slice(0, 200)}...
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Edit Template Dialog */}
      <Dialog open={isEditTemplateOpen} onOpenChange={setIsEditTemplateOpen}>
        <DialogContent className="max-w-2xl">
          <form onSubmit={handleUpdateTemplate}>
            <DialogHeader>
              <DialogTitle>Edit Template</DialogTitle>
            </DialogHeader>
            {editingTemplate && (
              <div className="space-y-4 py-4">
                {/* Dynamic Variables Reference - Above subject line */}
                <div className="space-y-3 p-3 border rounded-lg bg-muted/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Code className="h-4 w-4" />
                      <Label className="text-sm font-medium">Available Variables (click to insert)</Label>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Inserting into: <span className="font-medium text-foreground">{editTemplateFocusedField === 'subject' ? 'Subject' : 'Body'}</span>
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">Contact Fields</p>
                    <div className="flex flex-wrap gap-1">
                      {variableCategories.contact.map((v) => (
                        <Badge
                          key={v.key}
                          variant="secondary"
                          className="cursor-pointer text-xs hover:bg-primary hover:text-primary-foreground"
                          onClick={() => {
                            if (editTemplateFocusedField === 'subject') {
                              setEditingTemplate({
                                ...editingTemplate,
                                subject: editingTemplate.subject + `{{${v.key}}}`,
                              });
                            } else {
                              setEditingTemplate({
                                ...editingTemplate,
                                body: editingTemplate.body + `{{${v.key}}}`,
                              });
                            }
                          }}
                        >
                          {`{{${v.key}}}`}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">Company Fields</p>
                    <div className="flex flex-wrap gap-1">
                      {variableCategories.company.map((v) => (
                        <Badge
                          key={v.key}
                          variant="secondary"
                          className="cursor-pointer text-xs hover:bg-primary hover:text-primary-foreground"
                          onClick={() => {
                            if (editTemplateFocusedField === 'subject') {
                              setEditingTemplate({
                                ...editingTemplate,
                                subject: editingTemplate.subject + `{{${v.key}}}`,
                              });
                            } else {
                              setEditingTemplate({
                                ...editingTemplate,
                                body: editingTemplate.body + `{{${v.key}}}`,
                              });
                            }
                          }}
                        >
                          {`{{${v.key}}}`}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  
                  {variableCategories.custom.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground font-medium">Custom Fields</p>
                      <div className="flex flex-wrap gap-1">
                        {variableCategories.custom.map((v) => (
                          <Badge
                            key={v.key}
                            variant="outline"
                            className="cursor-pointer text-xs hover:bg-primary hover:text-primary-foreground"
                            onClick={() => {
                              if (editTemplateFocusedField === 'subject') {
                                setEditingTemplate({
                                  ...editingTemplate,
                                  subject: editingTemplate.subject + `{{${v.key}}}`,
                                });
                              } else {
                                setEditingTemplate({
                                  ...editingTemplate,
                                  body: editingTemplate.body + `{{${v.key}}}`,
                                });
                              }
                            }}
                          >
                            {`{{${v.key}}}`}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_subject">Subject Line</Label>
                  <Input
                    id="edit_subject"
                    value={editingTemplate.subject}
                    onChange={(e) =>
                      setEditingTemplate({ ...editingTemplate, subject: e.target.value })
                    }
                    onFocus={() => setEditTemplateFocusedField('subject')}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="edit_body">Email Body (HTML)</Label>
                  <Textarea
                    id="edit_body"
                    value={editingTemplate.body}
                    onChange={(e) =>
                      setEditingTemplate({ ...editingTemplate, body: e.target.value })
                    }
                    onFocus={() => setEditTemplateFocusedField('body')}
                    rows={10}
                    className="font-mono text-sm"
                    required
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="edit_is_active"
                    checked={editingTemplate.is_active}
                    onCheckedChange={(checked) =>
                      setEditingTemplate({ ...editingTemplate, is_active: checked })
                    }
                  />
                  <Label htmlFor="edit_is_active">Active</Label>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditTemplateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={isSaving}>
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Template Preview</DialogTitle>
            <DialogDescription>Preview with sample data</DialogDescription>
          </DialogHeader>
          {previewTemplate && (
            <div className="space-y-4">
              <div>
                <Label className="text-muted-foreground">Subject</Label>
                <p className="font-medium">
                  {interpolateTemplate(previewTemplate.subject, sampleData)}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Body</Label>
                <div
                  className="border rounded-lg p-4 mt-1 bg-white prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: interpolateTemplate(previewTemplate.body, sampleData),
                  }}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
