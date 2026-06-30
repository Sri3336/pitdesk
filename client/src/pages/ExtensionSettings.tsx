import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Plus, Trash2, Copy, RefreshCw, Chrome, Zap, CheckCircle2, AlertCircle, ToggleLeft, ToggleRight
} from "lucide-react";

export default function ExtensionSettings() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // ── Tracked accounts ──────────────────────────────────────────────────────
  const { data: accounts = [], isLoading: loadingAccounts } = trpc.userAccounts.getTrackedAccounts.useQuery();
  const [broker, setBroker] = useState<"etrade" | "schwab" | "other">("etrade");
  const [suffix, setSuffix] = useState("");
  const [label, setLabel] = useState("");

  const addAccount = trpc.userAccounts.addTrackedAccount.useMutation({
    onSuccess: (d) => {
      toast.success(`Added ${d.accountLabel}`);
      setSuffix(""); setLabel("");
      utils.userAccounts.getTrackedAccounts.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const removeAccount = trpc.userAccounts.removeTrackedAccount.useMutation({
    onSuccess: () => {
      toast.success("Account removed");
      utils.userAccounts.getTrackedAccounts.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleAccount = trpc.userAccounts.toggleTrackedAccount.useMutation({
    onSuccess: () => utils.userAccounts.getTrackedAccounts.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  // ── Extension sync token ──────────────────────────────────────────────────
  const { data: tokenData, refetch: refetchToken } = trpc.playbook.getExtensionToken.useQuery();
  const [showToken, setShowToken] = useState(false);

  const generateToken = trpc.playbook.generateExtensionToken.useMutation({
    onSuccess: () => {
      toast.success("New sync token generated");
      refetchToken();
    },
    onError: (e) => toast.error(e.message),
  });

  const copyToken = () => {
    if (tokenData?.maskedToken) {
      // We only show masked; user needs to copy from the reveal
      toast.info("Use the Reveal button to see and copy the full token.");
    }
  };

  const brokerLabel = (b: string) => {
    if (b === "etrade") return "E*TRADE";
    if (b === "schwab") return "Schwab";
    return "Other";
  };

  const brokerColor = (b: string) => {
    if (b === "etrade") return "bg-purple-500/10 text-purple-400 border-purple-500/20";
    if (b === "schwab") return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    return "bg-gray-500/10 text-gray-400 border-gray-500/20";
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-green-500/10 p-2">
          <Chrome className="w-5 h-5 text-green-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Extension Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure which brokerage accounts the PitDesk Chrome extension tracks for you.
          </p>
        </div>
      </div>

      {/* How it works */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-start gap-3">
            <Zap className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">How it works</p>
              <p>
                1. Add the account numbers you want to track below (last 4 digits is enough).
              </p>
              <p>
                2. Generate a sync token and paste it into the PitDesk Chrome extension.
              </p>
              <p>
                3. When the extension syncs, it will only save data for your registered accounts.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tracked Accounts */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Tracked Accounts</CardTitle>
          <CardDescription>
            Add the brokerage accounts you want the extension to sync. Use the last 4 digits of your account number.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add form */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Broker</Label>
              <Select value={broker} onValueChange={(v) => setBroker(v as any)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="etrade">E*TRADE</SelectItem>
                  <SelectItem value="schwab">Schwab</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Account # (last 4)</Label>
              <Input
                className="h-9"
                placeholder="e.g. 4723"
                value={suffix}
                onChange={(e) => setSuffix(e.target.value.trim())}
                maxLength={16}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Label (optional)</Label>
              <Input
                className="h-9"
                placeholder="e.g. My E*TRADE"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={100}
              />
            </div>
            <Button
              size="sm"
              className="h-9 gap-1"
              disabled={!suffix || addAccount.isPending}
              onClick={() => addAccount.mutate({ broker, accountSuffix: suffix, accountLabel: label || undefined })}
            >
              <Plus className="w-4 h-4" />
              Add
            </Button>
          </div>

          <Separator />

          {/* Account list */}
          {loadingAccounts ? (
            <div className="text-sm text-muted-foreground py-2">Loading...</div>
          ) : accounts.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">
              No accounts added yet. Add your first account above.
            </div>
          ) : (
            <div className="space-y-2">
              {accounts.map((acct) => (
                <div
                  key={acct.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className={`text-xs shrink-0 ${brokerColor(acct.broker)}`}>
                      {brokerLabel(acct.broker)}
                    </Badge>
                    <span className="text-sm font-medium truncate">{acct.accountLabel}</span>
                    <span className="text-xs text-muted-foreground shrink-0">·{acct.accountId}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {acct.isActive ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-muted-foreground" />
                    )}
                    <button
                      className="p-1 hover:text-primary transition-colors"
                      title={acct.isActive ? "Disable" : "Enable"}
                      onClick={() => toggleAccount.mutate({ id: acct.id, isActive: !acct.isActive })}
                    >
                      {acct.isActive ? (
                        <ToggleRight className="w-4 h-4 text-green-400" />
                      ) : (
                        <ToggleLeft className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>
                    <button
                      className="p-1 hover:text-red-400 transition-colors"
                      title="Remove"
                      onClick={() => removeAccount.mutate({ id: acct.id })}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync Token */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Sync Token</CardTitle>
          <CardDescription>
            Paste this token into the PitDesk Chrome extension so it can authenticate as you.
            Keep it secret — anyone with this token can write data to your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {tokenData?.hasToken ? (
            <>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-muted px-3 py-2 text-xs font-mono truncate">
                  {showToken ? tokenData.maskedToken : "••••••••••••••••••••••••••••••••"}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? "Hide" : "Reveal"}
                </Button>
              </div>
              {tokenData.lastUsedAt && (
                <p className="text-xs text-muted-foreground">
                  Last used: {new Date(tokenData.lastUsedAt).toLocaleString()}
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => generateToken.mutate()}
                disabled={generateToken.isPending}
              >
                <RefreshCw className="w-3 h-3" />
                Regenerate Token
              </Button>
              <p className="text-xs text-amber-500">
                Regenerating will invalidate the old token — you'll need to update the extension.
              </p>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">No sync token yet. Generate one to connect the Chrome extension.</p>
              <Button
                size="sm"
                className="gap-1"
                onClick={() => generateToken.mutate()}
                disabled={generateToken.isPending}
              >
                <Zap className="w-4 h-4" />
                Generate Sync Token
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* User info */}
      <p className="text-xs text-muted-foreground text-center">
        Logged in as <span className="font-medium">{user?.email}</span> · User ID {user?.id}
      </p>
    </div>
  );
}
