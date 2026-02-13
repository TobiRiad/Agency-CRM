"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getClientPB, getCampaigns, createCampaign, deleteCampaign, getCurrentUser } from "@/lib/pocketbase";
import PocketBase from "pocketbase";
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
import { toast } from "@/components/ui/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, MoreVertical, Trash2, Edit, Users, Mail, BarChart3, FolderOpen, Sparkles, Send } from "lucide-react";
import type { Campaign, CampaignKind } from "@/types";
import { formatDate } from "@/lib/utils";

interface CampaignStats {
  contactCount: number;
  companyCount: number;
  emailSentCount: number;
}

async function getAllCampaignStats(pb: PocketBase, campaignIds: string[]): Promise<Map<string, CampaignStats>> {
  const statsMap = new Map<string, CampaignStats>();
  if (campaignIds.length === 0) return statsMap;

  // Initialize all campaigns with zero counts
  for (const id of campaignIds) {
    statsMap.set(id, { contactCount: 0, companyCount: 0, emailSentCount: 0 });
  }

  try {
    // Fetch ALL contacts, companies, and email_sends in just 3 queries
    const campaignFilter = campaignIds.map(id => pb.filter('campaign = {:id}', { id })).join(' || ');
    const [allContacts, allCompanies, allEmails] = await Promise.all([
      pb.collection('contacts').getList(1, 1, {
        fields: 'id,campaign',
        filter: campaignFilter,
        skipTotal: false,
      }).then(async (first) => {
        if (first.totalItems <= 500) {
          const all = await pb.collection('contacts').getList(1, 500, {
            fields: 'campaign',
            filter: campaignFilter,
          });
          return all.items;
        }
        return null;
      }),
      pb.collection('companies').getList(1, 1, {
        fields: 'id,campaign',
        filter: campaignFilter,
        skipTotal: false,
      }).then(async (first) => {
        if (first.totalItems <= 500) {
          const all = await pb.collection('companies').getList(1, 500, {
            fields: 'campaign',
            filter: campaignFilter,
          });
          return all.items;
        }
        return null;
      }),
      pb.collection('email_sends').getList(1, 1, {
        fields: 'id,campaign',
        filter: campaignFilter,
        skipTotal: false,
      }).then(async (first) => {
        if (first.totalItems <= 500) {
          const all = await pb.collection('email_sends').getList(1, 500, {
            fields: 'campaign',
            filter: campaignFilter,
          });
          return all.items;
        }
        return null;
      }),
    ]);

    // Count contacts per campaign
    if (allContacts) {
      for (const contact of allContacts) {
        const stats = statsMap.get(contact.campaign);
        if (stats) stats.contactCount++;
      }
    } else {
      await Promise.all(campaignIds.map(async (id) => {
        const result = await pb.collection('contacts').getList(1, 1, {
          filter: pb.filter('campaign = {:id}', { id }),
          fields: 'id',
        });
        statsMap.get(id)!.contactCount = result.totalItems;
      }));
    }

    // Count companies per campaign
    if (allCompanies) {
      for (const company of allCompanies) {
        const stats = statsMap.get(company.campaign);
        if (stats) stats.companyCount++;
      }
    } else {
      await Promise.all(campaignIds.map(async (id) => {
        const result = await pb.collection('companies').getList(1, 1, {
          filter: pb.filter('campaign = {:id}', { id }),
          fields: 'id',
        });
        statsMap.get(id)!.companyCount = result.totalItems;
      }));
    }

    // Count emails per campaign
    if (allEmails) {
      for (const email of allEmails) {
        const stats = statsMap.get(email.campaign);
        if (stats) stats.emailSentCount++;
      }
    } else {
      await Promise.all(campaignIds.map(async (id) => {
        const result = await pb.collection('email_sends').getList(1, 1, {
          filter: pb.filter('campaign = {:id}', { id }),
          fields: 'id',
        });
        statsMap.get(id)!.emailSentCount = result.totalItems;
      }));
    }
  } catch (error) {
    console.error('Failed to get campaign stats:', error);
  }

  return statsMap;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignStats, setCampaignStats] = useState<Map<string, CampaignStats>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newCampaign, setNewCampaign] = useState({ name: "", description: "", kind: "outreach" as CampaignKind });
  const [activeTab, setActiveTab] = useState<CampaignKind>("outreach");

  const loadCampaigns = useCallback(async () => {
    try {
      const pb = getClientPB();
      const user = getCurrentUser(pb);
      if (user) {
        const data = await getCampaigns(pb, user.id);
        setCampaigns(data);
        
        // Fetch stats for all campaigns in batch (2 queries instead of 2*N)
        const statsMap = await getAllCampaignStats(pb, data.map(c => c.id));
        setCampaignStats(statsMap);
      }
    } catch (error) {
      console.error("Failed to load campaigns:", error);
      toast({
        title: "Error",
        description: "Failed to load campaigns. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampaign.name.trim()) return;

    setIsCreating(true);
    try {
      const pb = getClientPB();
      const user = getCurrentUser(pb);
      if (!user) throw new Error("Not authenticated");

      await createCampaign(pb, {
        name: newCampaign.name,
        description: newCampaign.description,
        user: user.id,
        kind: newCampaign.kind,
      });

      toast({
        title: "Campaign created",
        description: "Your new campaign is ready to use.",
        variant: "success",
      });

      setNewCampaign({ name: "", description: "", kind: "outreach" });
      setIsCreateOpen(false);
      loadCampaigns();
    } catch (error) {
      console.error("Failed to create campaign:", error);
      toast({
        title: "Error",
        description: "Failed to create campaign. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteCampaign = async (campaignId: string) => {
    if (!confirm("Are you sure you want to delete this campaign? This will delete all associated data.")) {
      return;
    }

    try {
      const pb = getClientPB();
      await deleteCampaign(pb, campaignId);
      toast({
        title: "Campaign deleted",
        description: "The campaign has been permanently deleted.",
      });
      loadCampaigns();
    } catch (error) {
      console.error("Failed to delete campaign:", error);
      toast({
        title: "Error",
        description: "Failed to delete campaign. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Campaigns</h1>
          <p className="text-muted-foreground mt-1">
            Manage your email campaigns and track performance
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Campaign
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleCreateCampaign}>
              <DialogHeader>
                <DialogTitle>Create Campaign</DialogTitle>
                <DialogDescription>
                  Create a new email campaign to start reaching out to leads.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Campaign Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Q1 Outreach 2024"
                    value={newCampaign.name}
                    onChange={(e) =>
                      setNewCampaign({ ...newCampaign, name: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Textarea
                    id="description"
                    placeholder="Brief description of this campaign..."
                    value={newCampaign.description}
                    onChange={(e) =>
                      setNewCampaign({ ...newCampaign, description: e.target.value })
                    }
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kind">Campaign Type</Label>
                  <Select
                    value={newCampaign.kind}
                    onValueChange={(value) =>
                      setNewCampaign({ ...newCampaign, kind: value as CampaignKind })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="leads">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4" />
                          Leads - Collect and qualify companies
                        </div>
                      </SelectItem>
                      <SelectItem value="outreach">
                        <div className="flex items-center gap-2">
                          <Send className="h-4 w-4" />
                          Outreach - Email campaigns
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={isCreating}>
                  Create Campaign
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs for Leads vs Outreach */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as CampaignKind)}>
        <TabsList>
          <TabsTrigger value="outreach">
            <Send className="mr-2 h-4 w-4" />
            Outreach Campaigns
          </TabsTrigger>
          <TabsTrigger value="leads">
            <Sparkles className="mr-2 h-4 w-4" />
            Lead Campaigns
          </TabsTrigger>
        </TabsList>

        <TabsContent value="outreach" className="mt-6">
          {renderCampaignsGrid(campaigns.filter(c => !c.kind || c.kind === 'outreach'), campaignStats, handleDeleteCampaign)}
        </TabsContent>

        <TabsContent value="leads" className="mt-6">
          {renderCampaignsGrid(campaigns.filter(c => c.kind === 'leads'), campaignStats, handleDeleteCampaign)}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function renderCampaignsGrid(
  campaigns: Campaign[],
  campaignStats: Map<string, CampaignStats>,
  handleDeleteCampaign: (id: string) => void
) {
  return campaigns.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <FolderOpen className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No campaigns yet</h3>
            <p className="text-muted-foreground text-center mb-4 max-w-sm">
              Create your first campaign to start managing leads and sending emails.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => {
            const stats = campaignStats.get(campaign.id);
            return (
            <Card key={campaign.id} className="card-hover">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg truncate">
                      <Link
                        href={`/campaigns/${campaign.id}`}
                        className="hover:text-primary transition-colors"
                      >
                        {campaign.name}
                      </Link>
                    </CardTitle>
                    <CardDescription className="mt-1 line-clamp-2">
                      {campaign.description || "No description"}
                    </CardDescription>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/campaigns/${campaign.id}`}>
                          <Edit className="mr-2 h-4 w-4" />
                          Open
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDeleteCampaign(campaign.id)}
                        className="text-red-600"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    <span>{campaign.kind === 'leads' ? (stats?.companyCount ?? 0) : (stats?.contactCount ?? 0)} {campaign.kind === 'leads' ? 'companies' : 'contacts'}</span>
                  </div>
                  {campaign.kind !== 'leads' && (
                    <div className="flex items-center gap-1">
                      <Mail className="h-4 w-4" />
                      <span>{stats?.emailSentCount ?? 0} sent</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Created {formatDate(campaign.created)}
                </p>
                <div className="mt-4 flex gap-2">
                  <Button asChild variant="outline" size="sm" className="flex-1">
                    <Link href={`/campaigns/${campaign.id}`}>
                      {campaign.kind === 'leads' ? (
                        <>
                          <Sparkles className="mr-2 h-4 w-4" />
                          View Leads
                        </>
                      ) : (
                        <>
                          <Users className="mr-2 h-4 w-4" />
                          Contacts
                        </>
                      )}
                    </Link>
                  </Button>
                  {campaign.kind !== 'leads' && (
                    <Button asChild variant="outline" size="sm" className="flex-1">
                      <Link href={`/campaigns/${campaign.id}/dashboard`}>
                        <BarChart3 className="mr-2 h-4 w-4" />
                        Dashboard
                      </Link>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      );
}
