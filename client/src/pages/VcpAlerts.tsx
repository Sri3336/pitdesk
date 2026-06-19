import { useState } from "react";
import { BellRing, Plus, Trash2, Pause, Play, RefreshCw, Target, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Slider } from "@/components/ui/slider";
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

// ─── Alert type ───────────────────────────────────────────────────────────────
type VcpAlertRow = {
  id: number;
  ticker: string;
  proximityPct: string;
  status: "active" | "triggered" | "paused";
  lastDistancePct: string | null;
  lastCheckedAt: Date | null;
  lastTriggeredAt: Date | null;
  notes: string | null;
  createdAt: Date;
};

// ─── Alert row ────────────────────────────────────────────────────────────────
function AlertRow({ alert, onDelete, onTogglePause }: {
  alert: VcpAlertRow;
  onDelete: (id: number) => void;
  onTogglePause: (id: number, paused: boolean) => void;
}) {
  const lastDist = alert.lastDistancePct ? parseFloat(alert.lastDistancePct) : null;
  const threshold = parseFloat(alert.proximityPct);
  const isPaused = alert.status === "paused";
  const isTriggered = alert.status === "triggered";

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card/50 hover:bg-card/80 transition-colors">
      {/* Icon */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
        isTriggered ? "bg-amber-500/15 text-amber-400" : "bg-emerald-500/15 text-emerald-400"
      }`}>
        {isTriggered ? <AlertTriangle className="w-4 h-4" /> : <Target className="w-4 h-4" />}
      </div>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">{alert.ticker}</span>
          <span className="text-xs text-muted-foreground">
            within <span className="font-medium text-foreground">{threshold.toFixed(1)}%</span> of pivot
          </span>
          <StatusBadge status={alert.status} />
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
          {lastDist != null && (
            <span>Last distance: <span className={`font-medium ${
              lastDist <= threshold ? "text-amber-400" : lastDist <= threshold * 2 ? "text-blue-400" : "text-muted-foreground"
            }`}>{lastDist.toFixed(1)}%</span></span>
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
              <Button variant="ghost" size="icon" className="h-7 w-7"
                onClick={() => onTogglePause(alert.id, !isPaused)}>
                {isPaused ? <Play className="h-3.5 w-3.5 text-emerald-400" /> : <Pause className="h-3.5 w-3.5 text-muted-foreground" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isPaused ? "Resume alert" : "Pause alert"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7"
                onClick={() => onDelete(alert.id)}>
                <Trash2 className="h-3.5 w-3.5 text-red-400" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete alert</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}

// ─── Create form ──────────────────────────────────────────────────────────────
function CreateAlertForm({ onCreated }: { onCreated: () => void }) {
  const [ticker, setTicker] = useState("");
  const [proximityPct, setProximityPct] = useState(3);
  const [notes, setNotes] = useState("");

  const createMutation = trpc.vcpAlerts.create.useMutation({
    onSuccess: () => {
      toast.success(`Alert created for ${ticker.toUpperCase()}`);
      setTicker("");
      setProximityPct(3);
      setNotes("");
      onCreated();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker.trim()) return;
    createMutation.mutate({ ticker: ticker.trim().toUpperCase(), notes: notes || undefined });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="vcp-ticker">Ticker</Label>
          <Input
            id="vcp-ticker"
            placeholder="e.g. NVDA"
            value={ticker}
            onChange={e => setTicker(e.target.value.toUpperCase())}
            maxLength={10}
            className="uppercase"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Proximity Threshold: <span className="font-bold text-foreground">{proximityPct.toFixed(1)}%</span></Label>
          <div className="pt-2 px-1">
            <Slider
              min={0.5}
              max={10}
              step={0.5}
              value={[proximityPct]}
              onValueChange={([v]) => setProximityPct(v)}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>0.5% (tight)</span>
              <span>5% (medium)</span>
              <span>10% (wide)</span>
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="vcp-notes">Notes (optional)</Label>
        <Input
          id="vcp-notes"
          placeholder="e.g. Watching for earnings catalyst"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          maxLength={256}
        />
      </div>
      <Button type="submit" disabled={createMutation.isPending || !ticker.trim()} className="w-full sm:w-auto">
        <Plus className="h-4 w-4 mr-2" />
        {createMutation.isPending ? "Creating…" : "Create Alert"}
      </Button>
    </form>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function VcpAlerts() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data: alerts = [], isLoading } = trpc.vcpAlerts.list.useQuery(undefined, {
    enabled: !!user,
  });

  const deleteMutation = trpc.vcpAlerts.delete.useMutation({
    onSuccess: () => { utils.vcpAlerts.list.invalidate(); toast.success("Alert deleted"); },
    onError: (err) => toast.error(err.message),
  });

  const togglePauseMutation = trpc.vcpAlerts.togglePause.useMutation({
    onSuccess: () => utils.vcpAlerts.list.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const checkAllMutation = trpc.vcpAlerts.checkAll.useMutation({
    onSuccess: (data) => toast.success(`Checked ${data.checked} alerts — ${data.triggered} triggered`),
    onError: (err) => toast.error(err.message),
  });

  const handleDelete = (id: number) => deleteMutation.mutate({ id });
  const handleTogglePause = (id: number, paused: boolean) => togglePauseMutation.mutate({ id, paused });

  const activeAlerts = (alerts as VcpAlertRow[]).filter(a => a.status === "active");
  const triggeredAlerts = (alerts as VcpAlertRow[]).filter(a => a.status === "triggered");
  const pausedAlerts = (alerts as VcpAlertRow[]).filter(a => a.status === "paused");

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <BellRing className="h-6 w-6 text-emerald-500" />
            <h1 className="text-2xl font-bold tracking-tight">VCP Breakout Alerts</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Get notified when a ticker approaches its VCP pivot level — the breakout trigger point.
          </p>
        </div>
        {user?.role === "admin" && (
          <Button variant="outline" size="sm" onClick={() => checkAllMutation.mutate()} disabled={checkAllMutation.isPending}>
            <RefreshCw className={`h-4 w-4 mr-2 ${checkAllMutation.isPending ? "animate-spin" : ""}`} />
            Check All Now
          </Button>
        )}
      </div>

      {/* Create form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">New Alert</CardTitle>
          <CardDescription>
            Alert fires when the ticker is within your chosen % of its VCP pivot level and has a valid VCP pattern.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateAlertForm onCreated={() => utils.vcpAlerts.list.invalidate()} />
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center">
          <p className="text-xl font-bold num text-emerald-700">{activeAlerts.length}</p>
          <p className="text-xs text-muted-foreground">Active</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
          <p className="text-xl font-bold num text-amber-700">{triggeredAlerts.length}</p>
          <p className="text-xs text-muted-foreground">Triggered</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
          <p className="text-xl font-bold num text-slate-600">{pausedAlerts.length}</p>
          <p className="text-xs text-muted-foreground">Paused</p>
        </div>
      </div>

      {/* Alert lists */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 rounded-lg border border-border/50 bg-card/50 animate-pulse" />
          ))}
        </div>
      ) : (alerts as VcpAlertRow[]).length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
          <BellRing className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No alerts yet. Create one above to start monitoring VCP breakouts.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {triggeredAlerts.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-amber-600 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" /> Triggered ({triggeredAlerts.length})
              </h3>
              {triggeredAlerts.map(a => (
                <AlertRow key={a.id} alert={a} onDelete={handleDelete} onTogglePause={handleTogglePause} />
              ))}
            </div>
          )}
          {activeAlerts.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-emerald-600 flex items-center gap-1.5">
                <Target className="h-4 w-4" /> Active ({activeAlerts.length})
              </h3>
              {activeAlerts.map(a => (
                <AlertRow key={a.id} alert={a} onDelete={handleDelete} onTogglePause={handleTogglePause} />
              ))}
            </div>
          )}
          {pausedAlerts.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
                <Pause className="h-4 w-4" /> Paused ({pausedAlerts.length})
              </h3>
              {pausedAlerts.map(a => (
                <AlertRow key={a.id} alert={a} onDelete={handleDelete} onTogglePause={handleTogglePause} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* How it works */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-blue-700">How VCP Alerts Work</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <p>An alert fires when two conditions are both true: (1) the ticker has a valid VCP pattern detected (score ≥ 4/9), and (2) the current price is within your chosen proximity % of the pivot level.</p>
          <p>The pivot level is the high of the final contraction — the price at which a breakout is confirmed. Buying a call debit spread just before or at the pivot is the standard options play.</p>
          <p>Alerts are checked by the admin on demand using "Check All Now". Email notifications are sent when an alert triggers. Re-activate a triggered alert to monitor for the next setup.</p>
        </CardContent>
      </Card>
    </div>
  );
}
