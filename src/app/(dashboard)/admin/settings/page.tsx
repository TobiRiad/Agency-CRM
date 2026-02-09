"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getClientPB, getCurrentUser } from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Mail,
  Shield,
  CheckCircle2,
  XCircle,
  ExternalLink,
  AlertCircle,
  Loader2,
  Plus,
  Copy,
  Trash2,
  UserPlus,
  Radio,
  CircleDot,
} from "lucide-react";
import type { User, EmailProvider, AppSetting, Invite } from "@/types";

export default function AdminSettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isConnectingGmail, setIsConnectingGmail] = useState(false);

  // Email provider settings
  const [emailProvider, setEmailProvider] = useState<EmailProvider>("resend");
  const [gmailEmail, setGmailEmail] = useState("");
  const [isGmailConnected, setIsGmailConnected] = useState(false);
  const [senderName, setSenderName] = useState("");

  // Gmail Watch state
  const [isWatchActive, setIsWatchActive] = useState(false);
  const [watchExpiry, setWatchExpiry] = useState<string>("");
  const [isTogglingWatch, setIsTogglingWatch] = useState(false);

  // Invites state
  const [invites, setInvites] = useState<Invite[]>([]);
  const [isAddInviteOpen, setIsAddInviteOpen] = useState(false);
  const [newInviteEmail, setNewInviteEmail] = useState("");
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const pb = getClientPB();
        const currentUser = getCurrentUser(pb);
        setUser(currentUser);

        // Check if user is admin
        if (currentUser?.role !== "admin") {
          toast({
            title: "Access Denied",
            description: "You don't have permission to access admin settings.",
            variant: "destructive",
          });
          router.push("/campaigns");
          return;
        }

        // Load settings
        const settings = await pb.collection("app_settings").getList<AppSetting>(1, 50);
        
        for (const setting of settings.items) {
          if (setting.key === "email_provider") {
            setEmailProvider((setting.value as { provider: EmailProvider })?.provider || "resend");
          }
          if (setting.key === "gmail_email") {
            setGmailEmail((setting.value as { email: string })?.email || "");
          }
          if (setting.key === "sender_name") {
            setSenderName((setting.value as { name: string })?.name || "");
          }
          if (setting.key === "gmail_refresh_token") {
            setIsGmailConnected(true);
          }
          if (setting.key === "gmail_watch_expiry") {
            const expiration = (setting.value as { expiration?: string })?.expiration;
            if (expiration) {
              const expiresAt = parseInt(expiration);
              if (expiresAt > Date.now()) {
                setIsWatchActive(true);
                setWatchExpiry(new Date(expiresAt).toLocaleString());
              }
            }
          }
        }

        // Load invites
        try {
          const invitesList = await pb.collection("invites").getList<Invite>(1, 100, {
            sort: "-created",
            expand: "used_by,created_by",
          });
          setInvites(invitesList.items);
        } catch (e) {
          console.log("Invites collection may not exist yet:", e);
        }

        setIsLoading(false);
      } catch (error) {
        console.error("Failed to load settings:", error);
        setIsLoading(false);
      }
    };

    loadData();
  }, [router]);

  // Handle OAuth callback messages
  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");

    if (success) {
      toast({
        title: "Success",
        description: success,
      });
      setIsGmailConnected(true);
      // Remove query params
      router.replace("/admin/settings");
    }

    if (error) {
      toast({
        title: "Error",
        description: error,
        variant: "destructive",
      });
      router.replace("/admin/settings");
    }
  }, [searchParams, router]);

  const saveEmailProvider = async () => {
    setIsSaving(true);
    try {
      const pb = getClientPB();

      // Save email provider setting
      const existing = await pb.collection("app_settings").getList(1, 1, {
        filter: 'key = "email_provider"',
      });

      if (existing.items.length > 0) {
        await pb.collection("app_settings").update(existing.items[0].id, {
          value: { provider: emailProvider },
        });
      } else {
        await pb.collection("app_settings").create({
          key: "email_provider",
          value: { provider: emailProvider },
        });
      }

      // Save Gmail email if using Gmail
      if (emailProvider === "gmail" && gmailEmail) {
        const gmailExisting = await pb.collection("app_settings").getList(1, 1, {
          filter: 'key = "gmail_email"',
        });

        if (gmailExisting.items.length > 0) {
          await pb.collection("app_settings").update(gmailExisting.items[0].id, {
            value: { email: gmailEmail },
          });
        } else {
          await pb.collection("app_settings").create({
            key: "gmail_email",
            value: { email: gmailEmail },
          });
        }
      }

      // Save sender name (used as the display name for Gmail From:)
      const senderExisting = await pb.collection("app_settings").getList(1, 1, {
        filter: 'key = "sender_name"',
      });
      if (senderExisting.items.length > 0) {
        await pb.collection("app_settings").update(senderExisting.items[0].id, {
          value: { name: senderName },
        });
      } else {
        await pb.collection("app_settings").create({
          key: "sender_name",
          value: { name: senderName },
        });
      }

      toast({
        title: "Settings Saved",
        description: "Email provider settings have been updated.",
      });
    } catch (error) {
      console.error("Failed to save settings:", error);
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const connectGmail = async () => {
    setIsConnectingGmail(true);
    try {
      const response = await fetch("/api/gmail/auth");
      const data = await response.json();

      if (data.success && data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to start Gmail authorization",
          variant: "destructive",
        });
        setIsConnectingGmail(false);
      }
    } catch (error) {
      console.error("Gmail connect error:", error);
      toast({
        title: "Error",
        description: "Failed to connect to Gmail. Please check your Google OAuth credentials.",
        variant: "destructive",
      });
      setIsConnectingGmail(false);
    }
  };

  const disconnectGmail = async () => {
    try {
      const pb = getClientPB();
      
      // Delete the refresh token
      const tokenSetting = await pb.collection("app_settings").getList(1, 1, {
        filter: 'key = "gmail_refresh_token"',
      });

      if (tokenSetting.items.length > 0) {
        await pb.collection("app_settings").delete(tokenSetting.items[0].id);
      }

      setIsGmailConnected(false);
      toast({
        title: "Gmail Disconnected",
        description: "Gmail has been disconnected. You can reconnect anytime.",
      });
    } catch (error) {
      console.error("Failed to disconnect Gmail:", error);
      toast({
        title: "Error",
        description: "Failed to disconnect Gmail.",
        variant: "destructive",
      });
    }
  };

  const startWatch = async () => {
    setIsTogglingWatch(true);
    try {
      const response = await fetch("/api/gmail/watch", { method: "POST" });
      const data = await response.json();

      if (data.success) {
        setIsWatchActive(true);
        if (data.expiration) {
          setWatchExpiry(new Date(parseInt(data.expiration)).toLocaleString());
        }
        toast({
          title: "Gmail Watch Started",
          description: "Now monitoring your inbox for replies. Watch will auto-renew.",
        });
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to start Gmail watch",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Start watch error:", error);
      toast({
        title: "Error",
        description: "Failed to start Gmail watch. Check your Pub/Sub configuration.",
        variant: "destructive",
      });
    } finally {
      setIsTogglingWatch(false);
    }
  };

  const stopWatch = async () => {
    setIsTogglingWatch(true);
    try {
      const response = await fetch("/api/gmail/watch", { method: "DELETE" });
      const data = await response.json();

      if (data.success) {
        setIsWatchActive(false);
        setWatchExpiry("");
        toast({
          title: "Gmail Watch Stopped",
          description: "No longer monitoring your inbox for replies.",
        });
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to stop Gmail watch",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Stop watch error:", error);
      toast({
        title: "Error",
        description: "Failed to stop Gmail watch.",
        variant: "destructive",
      });
    } finally {
      setIsTogglingWatch(false);
    }
  };

  // Generate a random token
  const generateToken = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
  };

  // Create new invite
  const createInvite = async () => {
    if (!newInviteEmail.trim()) {
      toast({
        title: "Email required",
        description: "Please enter an email address for the invite.",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingInvite(true);
    try {
      const pb = getClientPB();
      const token = generateToken();
      
      const invite = await pb.collection("invites").create<Invite>({
        email: newInviteEmail.trim().toLowerCase(),
        token,
        used: false,
        created_by: user?.id,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      });

      setInvites([invite, ...invites]);
      setNewInviteEmail("");
      setIsAddInviteOpen(false);

      // Copy link to clipboard
      const inviteUrl = `${window.location.origin}/register?token=${token}`;
      await navigator.clipboard.writeText(inviteUrl);

      toast({
        title: "Invite created",
        description: "Invite link has been copied to your clipboard.",
      });
    } catch (error) {
      console.error("Failed to create invite:", error);
      toast({
        title: "Error",
        description: "Failed to create invite. Make sure the invites collection exists.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingInvite(false);
    }
  };

  // Copy invite link
  const copyInviteLink = async (token: string) => {
    const inviteUrl = `${window.location.origin}/register?token=${token}`;
    await navigator.clipboard.writeText(inviteUrl);
    toast({
      title: "Copied",
      description: "Invite link copied to clipboard.",
    });
  };

  // Delete invite
  const deleteInvite = async (inviteId: string) => {
    try {
      const pb = getClientPB();
      await pb.collection("invites").delete(inviteId);
      setInvites(invites.filter((i) => i.id !== inviteId));
      toast({
        title: "Invite deleted",
        description: "The invite has been removed.",
      });
    } catch (error) {
      console.error("Failed to delete invite:", error);
      toast({
        title: "Error",
        description: "Failed to delete invite.",
        variant: "destructive",
      });
    }
  };

  // Format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <Shield className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Admin Settings</h1>
          <p className="text-muted-foreground">Manage system-wide configuration</p>
        </div>
      </div>

      {/* Email Provider Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Email Provider
          </CardTitle>
          <CardDescription>
            Choose which email service to use for sending campaign emails.
            Gmail can help avoid spam filters since emails come directly from your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <RadioGroup
            value={emailProvider}
            onValueChange={(value) => setEmailProvider(value as EmailProvider)}
            className="space-y-4"
          >
            {/* Resend Option */}
            <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <RadioGroupItem value="resend" id="resend" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="resend" className="text-base font-medium cursor-pointer">
                  Resend
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Use Resend email service. Good for high-volume sending with tracking features.
                </p>
                {emailProvider === "resend" && (
                  <div className="mt-3 p-3 bg-slate-100 dark:bg-slate-800 rounded-md">
                    <p className="text-sm text-muted-foreground">
                      Configured via RESEND_API_KEY environment variable.
                      <a
                        href="https://resend.com/api-keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-primary hover:underline inline-flex items-center gap-1"
                      >
                        Get API Key <ExternalLink className="w-3 h-3" />
                      </a>
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Gmail Option */}
            <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <RadioGroupItem value="gmail" id="gmail" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="gmail" className="text-base font-medium cursor-pointer">
                  Gmail / Google Workspace
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Send emails from your Google Workspace or Gmail account. Better deliverability
                  and less likely to be marked as spam.
                </p>
                
                {emailProvider === "gmail" && (
                  <div className="mt-4 space-y-4">
                    {/* Gmail Connection Status */}
                    <div className="flex items-center gap-2">
                      {isGmailConnected ? (
                        <>
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                          <span className="text-sm font-medium text-green-600">Gmail Connected</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={disconnectGmail}
                            className="ml-auto"
                          >
                            Disconnect
                          </Button>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-5 h-5 text-amber-500" />
                          <span className="text-sm font-medium text-amber-500">Not Connected</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={connectGmail}
                            disabled={isConnectingGmail}
                            className="ml-auto"
                          >
                            {isConnectingGmail ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Connecting...
                              </>
                            ) : (
                              "Connect Gmail"
                            )}
                          </Button>
                        </>
                      )}
                    </div>

                    {/* Gmail Email Input */}
                    <div className="space-y-2">
                      <Label htmlFor="gmailEmail">Gmail/Workspace Email Address</Label>
                      <Input
                        id="gmailEmail"
                        type="email"
                        placeholder="your@company.com"
                        value={gmailEmail}
                        onChange={(e) => setGmailEmail(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        This email address will be used as the sender for all campaign emails.
                      </p>
                    </div>

                    {/* Sender Name Input */}
                    <div className="space-y-2">
                      <Label htmlFor="senderName">Sender name (display name)</Label>
                      <Input
                        id="senderName"
                        type="text"
                        placeholder="Tobi from JohnRiad Agency"
                        value={senderName}
                        onChange={(e) => setSenderName(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        This controls the name recipients see in their inbox (e.g. “{senderName || "Your Name"} &lt;{gmailEmail || "you@company.com"}&gt;”).
                      </p>
                    </div>

                    {/* Gmail Inbox Watch */}
                    {isGmailConnected && (
                      <div className="p-4 border rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-medium flex items-center gap-2">
                              {isWatchActive ? (
                                <Radio className="w-4 h-4 text-green-600" />
                              ) : (
                                <CircleDot className="w-4 h-4 text-muted-foreground" />
                              )}
                              Inbox Monitoring
                            </h4>
                            <p className="text-xs text-muted-foreground mt-1">
                              {isWatchActive
                                ? `Active — monitoring for replies and out-of-office emails. Expires ${watchExpiry}`
                                : "Start monitoring your inbox to automatically detect replies and out-of-office emails."}
                            </p>
                          </div>
                          <Button
                            variant={isWatchActive ? "outline" : "default"}
                            size="sm"
                            onClick={isWatchActive ? stopWatch : startWatch}
                            disabled={isTogglingWatch}
                          >
                            {isTogglingWatch ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                {isWatchActive ? "Stopping..." : "Starting..."}
                              </>
                            ) : isWatchActive ? (
                              "Stop Monitoring"
                            ) : (
                              "Start Monitoring"
                            )}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Setup Instructions */}
                    {!isGmailConnected && (
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Google Cloud Setup Required</AlertTitle>
                        <AlertDescription className="mt-2 space-y-2">
                          <p>To use Gmail, you need to configure Google OAuth credentials:</p>
                          <ol className="list-decimal list-inside text-sm space-y-1 mt-2">
                            <li>Go to the Google Cloud Console</li>
                            <li>Create a new project or select an existing one</li>
                            <li>Enable the Gmail API</li>
                            <li>Create OAuth 2.0 credentials (Web application)</li>
                            <li>Add the callback URL: <code className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-xs">{process.env.NEXT_PUBLIC_APP_URL}/api/gmail/callback</code></li>
                            <li>Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local</li>
                          </ol>
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}
              </div>
            </div>
          </RadioGroup>

          <div className="flex justify-end pt-4 border-t">
            <Button onClick={saveEmailProvider} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Email Settings"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* User Management Info */}
      <Card>
        <CardHeader>
          <CardTitle>User Roles</CardTitle>
          <CardDescription>
            Manage team access and permissions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                  <Shield className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{user?.name || user?.email}</p>
                  <p className="text-sm text-muted-foreground">{user?.email}</p>
                </div>
              </div>
              <Badge variant="default">Admin</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              To manage user roles, update the &quot;role&quot; field in PocketBase admin panel.
              Admin users have access to system settings. Team users can manage campaigns.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Team Invites */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                Team Invites
              </CardTitle>
              <CardDescription>
                Invite new team members. Only users with a valid invite link can register.
              </CardDescription>
            </div>
            <Dialog open={isAddInviteOpen} onOpenChange={setIsAddInviteOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Invite
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Invite</DialogTitle>
                  <DialogDescription>
                    Enter the email address for the new team member. They will receive a unique invite link.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="invite-email">Email Address</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      placeholder="newmember@company.com"
                      value={newInviteEmail}
                      onChange={(e) => setNewInviteEmail(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsAddInviteOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={createInvite} disabled={isCreatingInvite}>
                    {isCreatingInvite ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create & Copy Link"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {invites.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <UserPlus className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>No invites created yet.</p>
              <p className="text-sm">Create an invite to add team members.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell className="font-medium">{invite.email}</TableCell>
                    <TableCell>
                      {invite.used ? (
                        <Badge variant="secondary" className="bg-green-100 text-green-700">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Used
                        </Badge>
                      ) : invite.expires_at && new Date(invite.expires_at) < new Date() ? (
                        <Badge variant="secondary" className="bg-red-100 text-red-700">
                          <XCircle className="w-3 h-3 mr-1" />
                          Expired
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                          Pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(invite.created)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {invite.expires_at ? formatDate(invite.expires_at) : "Never"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {!invite.used && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyInviteLink(invite.token)}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteInvite(invite.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
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
