"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  getClientPB,
  getCampaign,
  getContacts,
  getCompanies,
  getEmailSends,
  getEmailTemplatesForCampaign,
  getFunnelStages,
  getContactStages,
} from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import {
  ArrowLeft,
  Mail,
  Eye,
  MousePointerClick,
  AlertTriangle,
  Users,
  Building,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import type {
  Campaign,
  Contact,
  EmailSend,
  EmailTemplate,
  FunnelStage,
  ContactStage,
} from "@/types";
import { formatDate, formatPercentage, calculateRate, groupBy } from "@/lib/utils";

export default function DashboardPage() {
  const params = useParams();
  const campaignId = params.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<{ id: string }[]>([]);
  const [emailSends, setEmailSends] = useState<EmailSend[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);
  const [contactStages, setContactStages] = useState<ContactStage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState("30d");

  const loadData = useCallback(async () => {
    try {
      const pb = getClientPB();
      const [
        campaignData,
        contactsData,
        companiesData,
        emailSendsData,
        templatesData,
        stagesData,
        contactStagesData,
      ] = await Promise.all([
        getCampaign(pb, campaignId),
        getContacts(pb, campaignId),
        pb.collection("companies").getFullList({ filter: `campaign = "${campaignId}"` }),
        getEmailSends(pb, campaignId),
        getEmailTemplatesForCampaign(pb, campaignId),
        getFunnelStages(pb, campaignId),
        getContactStages(pb, campaignId),
      ]);

      setCampaign(campaignData);
      setContacts(contactsData);
      setCompanies(companiesData);
      setEmailSends(emailSendsData);
      setTemplates(templatesData);
      setFunnelStages(stagesData);
      setContactStages(contactStagesData);
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
      toast({
        title: "Error",
        description: "Failed to load dashboard data.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Calculate metrics
  const totalSent = emailSends.length;
  const delivered = emailSends.filter((e) => ["delivered", "opened", "clicked"].includes(e.status)).length;
  const opened = emailSends.filter((e) => ["opened", "clicked"].includes(e.status)).length;
  const clicked = emailSends.filter((e) => e.status === "clicked").length;
  const bounced = emailSends.filter((e) => e.status === "bounced").length;

  const openRate = calculateRate(opened, delivered);
  const clickRate = calculateRate(clicked, opened);
  const bounceRate = calculateRate(bounced, totalSent);

  // Group emails by date for chart
  const emailsByDate = emailSends.reduce((acc, send) => {
    const date = formatDate(send.sent_at);
    if (!acc[date]) {
      acc[date] = { date, sent: 0, opened: 0, clicked: 0, bounced: 0 };
    }
    acc[date].sent++;
    if (["opened", "clicked"].includes(send.status)) acc[date].opened++;
    if (send.status === "clicked") acc[date].clicked++;
    if (send.status === "bounced") acc[date].bounced++;
    return acc;
  }, {} as Record<string, { date: string; sent: number; opened: number; clicked: number; bounced: number }>);

  const chartData = Object.values(emailsByDate).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Template performance
  const templatePerformance = templates.map((template) => {
    const templateSends = emailSends.filter((e) => e.template === template.id);
    const templateOpened = templateSends.filter((e) => ["opened", "clicked"].includes(e.status)).length;
    const templateClicked = templateSends.filter((e) => e.status === "clicked").length;

    return {
      id: template.id,
      subject: template.subject.slice(0, 40) + (template.subject.length > 40 ? "..." : ""),
      sent: templateSends.length,
      opened: templateOpened,
      clicked: templateClicked,
      openRate: calculateRate(templateOpened, templateSends.length),
      clickRate: calculateRate(templateClicked, templateOpened),
    };
  }).filter(t => t.sent > 0);

  // Funnel data
  const funnelData = funnelStages.map((stage) => {
    const stageContacts = contactStages.filter((cs) => cs.stage === stage.id);
    return {
      name: stage.name,
      value: stageContacts.length,
      color: stage.color,
    };
  });

  // Status distribution for pie chart
  const statusDistribution = [
    { name: "Delivered", value: delivered - opened, fill: "#3b82f6" },
    { name: "Opened", value: opened - clicked, fill: "#8b5cf6" },
    { name: "Clicked", value: clicked, fill: "#22c55e" },
    { name: "Bounced", value: bounced, fill: "#ef4444" },
  ].filter(s => s.value > 0);

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/campaigns/${campaignId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Campaign Dashboard</h1>
            <p className="text-muted-foreground">{campaign.name}</p>
          </div>
        </div>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sent</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSent}</div>
            <p className="text-xs text-muted-foreground">
              {contacts.length} contacts in campaign
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Rate</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPercentage(openRate)}</div>
            <div className="flex items-center text-xs">
              {openRate > 0.2 ? (
                <>
                  <ArrowUpRight className="h-3 w-3 text-green-500 mr-1" />
                  <span className="text-green-500">Above average</span>
                </>
              ) : (
                <>
                  <ArrowDownRight className="h-3 w-3 text-red-500 mr-1" />
                  <span className="text-red-500">Below average</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Click Rate</CardTitle>
            <MousePointerClick className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPercentage(clickRate)}</div>
            <p className="text-xs text-muted-foreground">
              {clicked} clicks from {opened} opens
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bounce Rate</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPercentage(bounceRate)}</div>
            <p className="text-xs text-muted-foreground">
              {bounced} bounced emails
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Metrics */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contacts</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{contacts.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Companies</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{companies.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Email Activity Over Time */}
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Email Activity Over Time</CardTitle>
            <CardDescription>Sent, opened, and clicked emails</CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      return `${date.getMonth() + 1}/${date.getDate()}`;
                    }}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="sent"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    name="Sent"
                  />
                  <Line
                    type="monotone"
                    dataKey="opened"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    name="Opened"
                  />
                  <Line
                    type="monotone"
                    dataKey="clicked"
                    stroke="#22c55e"
                    strokeWidth={2}
                    name="Clicked"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No email data yet. Send some emails to see activity.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status Distribution */}
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Email Status Distribution</CardTitle>
            <CardDescription>Breakdown by delivery status</CardDescription>
          </CardHeader>
          <CardContent>
            {statusDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={statusDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                  >
                    {statusDistribution.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No email data yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Template Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Template Performance</CardTitle>
          <CardDescription>Compare performance across different email templates</CardDescription>
        </CardHeader>
        <CardContent>
          {templatePerformance.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={templatePerformance} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis
                  type="category"
                  dataKey="subject"
                  width={150}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    if (name.includes("Rate")) {
                      return formatPercentage(value);
                    }
                    return value;
                  }}
                />
                <Legend />
                <Bar dataKey="sent" fill="#3b82f6" name="Sent" />
                <Bar dataKey="opened" fill="#8b5cf6" name="Opened" />
                <Bar dataKey="clicked" fill="#22c55e" name="Clicked" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              No template performance data yet.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Funnel Stages */}
      {funnelStages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Funnel Overview</CardTitle>
            <CardDescription>Contact distribution across pipeline stages</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between gap-2 h-48">
              {funnelData.map((stage, index) => {
                const maxValue = Math.max(...funnelData.map((s) => s.value), 1);
                const heightPercent = (stage.value / maxValue) * 100;

                return (
                  <div
                    key={index}
                    className="flex-1 flex flex-col items-center gap-2"
                  >
                    <span className="text-lg font-bold">{stage.value}</span>
                    <div
                      className="w-full rounded-t-lg transition-all duration-500"
                      style={{
                        height: `${Math.max(heightPercent, 10)}%`,
                        backgroundColor: stage.color || "#3b82f6",
                      }}
                    />
                    <span className="text-xs text-center text-muted-foreground">
                      {stage.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Email Activity</CardTitle>
          <CardDescription>Last 10 email events</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {emailSends.slice(0, 10).map((send) => (
              <div
                key={send.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    variant={
                      send.status === "bounced"
                        ? "destructive"
                        : send.status === "clicked"
                        ? "success"
                        : send.status === "opened"
                        ? "info"
                        : "secondary"
                    }
                  >
                    {send.status}
                  </Badge>
                  <div>
                    <p className="font-medium text-sm">
                      {send.expand?.contact?.email || "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {send.expand?.template?.subject?.slice(0, 50) || "No subject"}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDate(send.sent_at)}
                </span>
              </div>
            ))}
            {emailSends.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                No email activity yet. Send some emails to see activity here.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
