import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Save, Plus, Trash2, Globe, Palette, Users, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";

function SettingField({
  label,
  description,
  value,
  onChange,
  type = "text",
  placeholder,
  multiline = false,
  maxLength,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
}) {
  return (
    <div className="space-y-1.5">
      <div>
        <label className="text-sm font-medium text-foreground">{label}</label>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {multiline ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={4}
          className="bg-input border-border text-sm font-mono"
        />
      ) : (
        <Input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="bg-input border-border text-sm"
          maxLength={maxLength}
        />
      )}
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const isAdmin = user?.role === "admin";

  const { data: allSettings, isLoading } = trpc.settings.getAll.useQuery();
  const { data: editors, isLoading: editorsLoading } = trpc.editors.list.useQuery(undefined, { enabled: isAdmin });

  // WordPress settings
  const [wpUrl, setWpUrl] = useState("");
  const [wpUsername, setWpUsername] = useState("");
  const [wpAppPassword, setWpAppPassword] = useState("");

  // Brand settings
  const [brandVoice, setBrandVoice] = useState("");
  const [approvedCTAs, setApprovedCTAs] = useState("");
  const [targetMarkets, setTargetMarkets] = useState("");
  const [forbiddenClaims, setForbiddenClaims] = useState("");
  const [styleGuide, setStyleGuide] = useState("");

  // Editor invite
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");

  const wpPasswordIsSet = !!(allSettings?.["wp_app_password"]);

  useEffect(() => {
    if (allSettings) {
      setWpUrl(allSettings["wp_url"] || "");
      setWpUsername(allSettings["wp_username"] || "");
      // Never pre-populate the app password — it is write-only
      // setWpAppPassword is left empty so user must enter a new value to change it
      setBrandVoice(allSettings["brand_voice"] || "");
      setApprovedCTAs(allSettings["approved_ctas"] || "");
      setTargetMarkets(allSettings["target_markets"] || "");
      setForbiddenClaims(allSettings["forbidden_claims"] || "");
      setStyleGuide(allSettings["style_guide"] || "");
    }
  }, [allSettings]);

  const updateSettings = trpc.settings.update.useMutation({
    onSuccess: () => {
      utils.settings.getAll.invalidate();
      toast.success("Settings saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const inviteEditor = trpc.editors.invite.useMutation({
    onSuccess: () => {
      utils.editors.list.invalidate();
      setInviteEmail("");
      setInviteName("");
      toast.success("Editor invited");
    },
    onError: (e) => toast.error(e.message),
  });

  const removeEditor = trpc.editors.remove.useMutation({
    onSuccess: () => {
      utils.editors.list.invalidate();
      toast.success("Editor removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const saveWordPress = () => {
    const payload: Parameters<typeof updateSettings.mutate>[0] = { wp_url: wpUrl, wp_username: wpUsername };
    // Only send the app password if the user has typed a new one
    if (wpAppPassword.trim()) {
      payload.wp_app_password = wpAppPassword;
    }
    updateSettings.mutate(payload);
  };

  const saveBrand = () => {
    updateSettings.mutate({
      brand_voice: brandVoice,
      approved_ctas: approvedCTAs,
      target_markets: targetMarkets,
      forbidden_claims: forbiddenClaims,
      style_guide: styleGuide,
    });
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldCheck className="w-10 h-10 text-muted-foreground mb-3" />
        <h2 className="text-lg font-semibold text-foreground">Admin Access Required</h2>
        <p className="text-sm text-muted-foreground mt-1">Only administrators can manage settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure WordPress integration, brand voice, and team access.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : (
        <Tabs defaultValue="wordpress">
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="wordpress" className="gap-2">
              <Globe className="w-3.5 h-3.5" /> WordPress
            </TabsTrigger>
            <TabsTrigger value="brand" className="gap-2">
              <Palette className="w-3.5 h-3.5" /> Brand & Voice
            </TabsTrigger>
            <TabsTrigger value="team" className="gap-2">
              <Users className="w-3.5 h-3.5" /> Team Access
            </TabsTrigger>
          </TabsList>

          {/* WordPress Tab */}
          <TabsContent value="wordpress" className="mt-4">
            <div className="rounded-xl border border-border bg-card p-6 space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-foreground">WordPress Integration</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Connect to your SimpleShowing WordPress site using a dedicated Application Password.
                  Never use your main admin password here.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <p className="text-xs text-amber-400 font-medium">Security Note</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Create a dedicated WordPress user with Editor role and generate an Application Password
                  under <strong>Users → Profile → Application Passwords</strong>. Do not use your admin credentials.
                </p>
              </div>

              <div className="space-y-4">
                <SettingField
                  label="WordPress Site URL"
                  description="Your WordPress site root URL (no trailing slash)"
                  value={wpUrl}
                  onChange={setWpUrl}
                  placeholder="https://www.simpleshowing.com"
                />
                <SettingField
                  label="WordPress Username"
                  description="The WordPress username for the dedicated editor account"
                  value={wpUsername}
                  onChange={setWpUsername}
                  placeholder="content-agent"
                />
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Application Password</label>
                  {wpPasswordIsSet && (
                    <div className="flex items-center gap-2 text-xs text-emerald-400 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                      Password is set — enter a new value below only if you want to replace it
                    </div>
                  )}
                  <input
                    type="password"
                    className="flex h-9 w-full rounded-md border border-input bg-input px-3 py-1 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={wpAppPassword}
                    onChange={e => setWpAppPassword(e.target.value)}
                    placeholder={wpPasswordIsSet ? "Leave blank to keep existing password" : "xxxx xxxx xxxx xxxx xxxx xxxx"}
                    autoComplete="new-password"
                  />
                  <p className="text-xs text-muted-foreground">Generated from WordPress → Users → Profile → Application Passwords. This field is write-only and is never returned to the browser.</p>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-secondary border border-border">
                <p className="text-xs font-medium text-foreground mb-1">Rank Math SEO Fields</p>
                <p className="text-xs text-muted-foreground">
                  When pushing to WordPress, the agent automatically populates:
                  <code className="ml-1 text-primary">rank_math_title</code>,{" "}
                  <code className="text-primary">rank_math_description</code>,{" "}
                  <code className="text-primary">rank_math_focus_keyword</code>, and{" "}
                  <code className="text-primary">rank_math_canonical_url</code> via the post meta API.
                </p>
              </div>

              <Button
                onClick={saveWordPress}
                disabled={updateSettings.isPending}
                className="gap-2"
              >
                {updateSettings.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save WordPress Settings
              </Button>
            </div>
          </TabsContent>

          {/* Brand Tab */}
          <TabsContent value="brand" className="mt-4">
            <div className="rounded-xl border border-border bg-card p-6 space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Brand Voice & Content Rules</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  These rules are injected into every AI brief and draft generation prompt.
                </p>
              </div>

              <div className="space-y-4">
                <SettingField
                  label="Brand Voice"
                  description="Describe SimpleShowing's tone, personality, and writing style"
                  value={brandVoice}
                  onChange={setBrandVoice}
                  multiline
                  placeholder="Friendly, expert, transparent. SimpleShowing helps buyers and sellers save money on real estate commissions..."
                />
                <SettingField
                  label="Approved CTAs"
                  description="Comma-separated list of approved calls-to-action"
                  value={approvedCTAs}
                  onChange={setApprovedCTAs}
                  multiline
                  placeholder="Get a free home valuation, See how much you can save, Book a free consultation, Calculate your buyer rebate"
                />
                <SettingField
                  label="Target Markets"
                  description="Comma-separated list of target cities/states for local SEO"
                  value={targetMarkets}
                  onChange={setTargetMarkets}
                  multiline
                  placeholder="Atlanta GA, Tampa FL, Orlando FL, Dallas TX, Denver CO, Charlotte NC"
                />
                <SettingField
                  label="Forbidden Claims"
                  description="Claims the AI must never make (compliance and legal)"
                  value={forbiddenClaims}
                  onChange={setForbiddenClaims}
                  multiline
                  placeholder="Guaranteed sale, Lowest price guaranteed, We will sell your home in X days..."
                />
                <SettingField
                  label="Style Guide"
                  description="Additional writing rules and formatting preferences"
                  value={styleGuide}
                  onChange={setStyleGuide}
                  multiline
                  placeholder="Use second-person (you/your). Avoid jargon. Include real numbers and examples. Always link to relevant SimpleShowing pages..."
                />
              </div>

              <Button
                onClick={saveBrand}
                disabled={updateSettings.isPending}
                className="gap-2"
              >
                {updateSettings.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Brand Settings
              </Button>
            </div>
          </TabsContent>

          {/* Team Tab */}
          <TabsContent value="team" className="mt-4">
            <div className="rounded-xl border border-border bg-card p-6 space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Team Access</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Only invited editors and the owner can access this dashboard.
                </p>
              </div>

              {/* Invite form */}
              <div className="p-4 rounded-lg border border-border bg-secondary space-y-3">
                <p className="text-sm font-medium text-foreground">Invite Editor</p>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    placeholder="editor@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="bg-input border-border text-sm"
                  />
                  <Input
                    placeholder="Name (optional)"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    className="bg-input border-border text-sm"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={() => inviteEditor.mutate({ email: inviteEmail, name: inviteName || undefined })}
                  disabled={!inviteEmail.trim() || inviteEditor.isPending}
                  className="gap-2"
                >
                  {inviteEditor.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Invite Editor
                </Button>
              </div>

              {/* Editor list */}
              {editorsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
                </div>
              ) : !editors || editors.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-border rounded-xl">
                  <Users className="w-7 h-7 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No editors invited yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {editors.map((editor) => (
                    <div key={editor.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-secondary">
                      <div>
                        <p className="text-sm font-medium text-foreground">{editor.name || editor.email}</p>
                        <p className="text-xs text-muted-foreground">{editor.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-full",
                          editor.isActive ? "bg-green-500/10 text-green-400" : "bg-zinc-500/10 text-zinc-400"
                        )}>
                          {editor.isActive ? "Active" : "Inactive"}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 h-7 w-7 p-0"
                          onClick={() => removeEditor.mutate({ id: editor.id })}
                          disabled={removeEditor.isPending}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
