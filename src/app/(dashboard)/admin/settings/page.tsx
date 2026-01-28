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
  Mail,
  Shield,
  CheckCircle2,
  XCircle,
  ExternalLink,
  AlertCircle,
  Loader2,
} from "lucide-react";
import type { User, EmailProvider, AppSetting } from "@/types";

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
    </div>
  );
}
