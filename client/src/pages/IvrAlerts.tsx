import { useState } from "react";
import { Bell, Plus, Trash2, Pause, Play, RefreshCw, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "active")
    return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs">Active</Badge>;
  if (status === "triggered")
    return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-xs">Triggered</Badge>;
  return <Badge className="bg-slate-500/15 text-slate-400 border-slate-500/30 text-xs">Paused</Badge>;
}

// ─── Alert row ────────────────────────────────────────────────────────────────

type Alert = {
  id: number;
  ticker: string;
  condition: "above" | "below";
  threshold: string;
  status: "active" | "triggered" | "paused";
  lastIvr: string | null;
  lastCheckedAt: Date | null;
  lastTriggeredAt: Date | null;
  notes: string | null;
  createdAt: Date;
};

function AlertRow({ alert, onDelete, onTogglePause }: {
  alert: Alert;
  onDelete: (id: number) => void;
  onTogglePause: (id: number, paused: boolean) => void;
}) {
  const lastIvr = alert.lastIvr ? parseFloat(alert.lastIvr) : null;
  const threshold = parseFloat(alert.threshold);
  const isPaused = alert.status === "paused";
  const isTriggered = alert.status === "triggered";

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card/50 hover:bg-card/80 transition-colors">
      {/* Condition icon */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
        alert.condition === "above" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
      }`}>
        {alert.condition === "above" ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
      </div>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">{alert.ticker}</span>
          <span className="text-xs text-muted-foreground">
            IVR {alert.condition} <span className="font-medium text-foreground">{threshold.toFixed(0)}%</span>
          </span>
          <StatusBadge status={alert.status} />
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
          {lastIvr != null && (
            <span>Last IVR: <span className={`font-medium ${
              lastIvr >= 50 ? "text-emerald-400" : lastIvr >= 30 ? "text-amber-400" : "text-red-400"
            }`}>{lastIvr.toFixed(1)}%</span></span>
          )}
          {alert.lastCheckedAt && (
            <span>Checked: {new Date(alert.lastCheckedAt).toLocaleDateString()}</span>
          )}
          {alert.lastTriggeredAt && (
            <span className="text-amber-400">Triggered: {new Date(alert.lastTriggeredAt).toLocaleDateString()}</span>
          )}
          {alert.notes && <span className="truncate max-w-[200px]">{alert.notes}</span>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => onTogglePause(alert.id, !isPaused)}
                disabled={isTriggered}
              >
                {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isPaused ? "Resume alert" : "Pause alert"}</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-red-400"
                onClick={() => onDelete(alert.id)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete alert</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}

// ─── Create alert form ────────────────────────────────────────────────────────

function CreateAlertForm({ onCreated }: { onCreated: () => void }) {
  const [ticker, setTicker] = useState("");
  const [condition, setCondition] = useState<"above" | "below">("above");
  const [threshold, setThreshold] = useState("50");
  const [notes, setNotes] = useState("");

  const create = trpc.ivrAlerts.create.useMutation({
    onSuccess: () => {
      toast.success(`Alert created for ${ticker.toUpperCase()}`);
      setTicker("");
      setThreshold("50");
      setNotes("");
      onCreated();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Ticker</Label>
        <Input
          placeholder="e.g. AAPL"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          className="h-9 text-sm uppercase"
          maxLength={10}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Condition</Label>
        <Select value={condition} onValueChange={(v) => setCondition(v as "above" | "below")}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="above">IVR rises above threshold</SelectItem>
            <SelectItem value="below">IVR falls below threshold</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">IVR Threshold (%)</Label>
        <Input
          type="number"
          min={0}
          max={100}
          step={5}
          placeholder="50"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          className="h-9 text-sm"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Notes (optional)</Label>
        <div className="flex gap-2">
          <Input
            placeholder="Optional note"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="h-9 text-sm flex-1"
            maxLength={256}
          />
          <Button
            size="sm"
            className="h-9 px-3 flex-shrink-0"
            disabled={!ticker || !threshold || create.isPending}
            onClick={() => create.mutate({ ticker, ivrThreshold: parseFloat(threshold), direction: condition, notes: notes || undefined })}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function IvrAlerts() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data: alerts = [], isLoading, refetch } = trpc.ivrAlerts.list.useQuery(undefined, {
    enabled: !!user,
  });

  const deleteAlert = trpc.ivrAlerts.delete.useMutation({
    onSuccess: () => { toast.success("Alert deleted"); utils.ivrAlerts.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const togglePause = trpc.ivrAlerts.togglePause.useMutation({
    onSuccess: () => utils.ivrAlerts.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const checkAll = trpc.ivrAlerts.checkAll.useMutation({
    onSuccess: (r) => {
      toast.success(`Checked ${r.checked} alerts — ${r.triggered} triggered`);
      utils.ivrAlerts.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const activeAlerts = alerts.filter((a) => a.status === "active");
  const triggeredAlerts = alerts.filter((a) => a.status === "triggered");
  const pausedAlerts = alerts.filter((a) => a.status === "paused");

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="w-6 h-6 text-amber-400" />
            IVR Alerts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Get email notifications when a ticker's IV Percentile Rank crosses your threshold.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {user?.role === "admin" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => checkAll.mutate()}
              disabled={checkAll.isPending}
              className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
            >
              <AlertTriangle className="w-4 h-4 mr-1.5" />
              {checkAll.isPending ? "Checking..." : "Check All Now"}
            </Button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-emerald-500/20">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-emerald-400">{activeAlerts.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Active</div>
          </CardContent>
        </Card>
        <Card className="border-amber-500/20">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-amber-400">{triggeredAlerts.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Triggered</div>
          </CardContent>
        </Card>
        <Card className="border-slate-500/20">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-slate-400">{pausedAlerts.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Paused</div>
          </CardContent>
        </Card>
      </div>

      {/* Create form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Create New Alert</CardTitle>
          <CardDescription className="text-xs">
            Alerts are checked daily. You will receive an email when the condition is met.
            IVR &gt; 50% = elevated IV (good for premium selling). IVR &lt; 30% = cheap IV (avoid selling premium).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateAlertForm onCreated={() => utils.ivrAlerts.list.invalidate()} />
        </CardContent>
      </Card>

      {/* Alert list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Your Alerts ({alerts.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center text-muted-foreground py-8 text-sm">Loading alerts...</div>
          ) : alerts.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 text-sm">
              No alerts yet. Create one above to get started.
            </div>
          ) : (
            <div className="space-y-2">
              {/* Triggered first */}
              {triggeredAlerts.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-amber-400 uppercase tracking-wider px-1">Triggered</div>
                  {triggeredAlerts.map((a) => (
                    <AlertRow
                      key={a.id}
                      alert={a as Alert}
                      onDelete={(id) => deleteAlert.mutate({ id })}
                      onTogglePause={(id, paused) => togglePause.mutate({ id, paused })}
                    />
                  ))}
                </div>
              )}
              {/* Active */}
              {activeAlerts.length > 0 && (
                <div className="space-y-2">
                  {triggeredAlerts.length > 0 && <div className="text-xs font-medium text-emerald-400 uppercase tracking-wider px-1 mt-3">Active</div>}
                  {activeAlerts.map((a) => (
                    <AlertRow
                      key={a.id}
                      alert={a as Alert}
                      onDelete={(id) => deleteAlert.mutate({ id })}
                      onTogglePause={(id, paused) => togglePause.mutate({ id, paused })}
                    />
                  ))}
                </div>
              )}
              {/* Paused */}
              {pausedAlerts.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-400 uppercase tracking-wider px-1 mt-3">Paused</div>
                  {pausedAlerts.map((a) => (
                    <AlertRow
                      key={a.id}
                      alert={a as Alert}
                      onDelete={(id) => deleteAlert.mutate({ id })}
                      onTogglePause={(id, paused) => togglePause.mutate({ id, paused })}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* How it works */}
      <Card className="border-border/30 bg-card/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">How IVR Alerts Work</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1.5">
          <p><span className="text-foreground font-medium">IV Percentile Rank (IVR)</span> compares today's implied volatility against the past 52-week range. IVR = 0% means IV is at its yearly low; IVR = 100% means it's at its yearly high.</p>
          <p><span className="text-emerald-400 font-medium">IVR above 50%</span> — elevated IV, good conditions for selling premium (Iron Condor, Short Strangle, Naked Put).</p>
          <p><span className="text-red-400 font-medium">IVR below 30%</span> — cheap IV, unfavourable for premium selling; consider debit strategies instead.</p>
          <p>Alerts are checked once daily by the system. When triggered, you receive an email and the alert status changes to "Triggered". Re-activate it manually to monitor again.</p>
        </CardContent>
      </Card>
    </div>
  );
}
