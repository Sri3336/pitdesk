import { useState } from "react";
import { Bell, Plus, Trash2, Pause, Play, RefreshCw, TrendingUp, TrendingDown, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { COT_INSTRUMENTS } from "../../../shared/cotTypes";

function StatusBadge({ status }: { status: string }) {
  if (status === "active") return <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>;
  if (status === "paused") return <Badge variant="outline" className="text-gray-500">Paused</Badge>;
  if (status === "triggered") return <Badge className="bg-blue-100 text-blue-800 border-blue-200"><CheckCircle className="h-3 w-3 mr-1" />Triggered</Badge>;
  return null;
}

export default function COTAlerts() {
  const utils = trpc.useUtils();
  const [instrumentId, setInstrumentId] = useState("");
  const [condition, setCondition] = useState<"above" | "below">("above");
  const [threshold, setThreshold] = useState("75");
  const [notes, setNotes] = useState("");

  const { data: alerts, isLoading } = trpc.cotAlerts.list.useQuery(undefined, {
    staleTime: 60 * 1000,
  });

  const createMut = trpc.cotAlerts.create.useMutation({
    onSuccess: () => {
      utils.cotAlerts.list.invalidate();
      setInstrumentId("");
      setThreshold("75");
      setNotes("");
      toast.success("COT alert created");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.cotAlerts.delete.useMutation({
    onSuccess: () => {
      utils.cotAlerts.list.invalidate();
      toast.success("Alert deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleMut = trpc.cotAlerts.togglePause.useMutation({
    onSuccess: () => utils.cotAlerts.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const checkMut = trpc.cotAlerts.checkAll.useMutation({
    onSuccess: (data) => {
      utils.cotAlerts.list.invalidate();
      toast.success(`Checked ${data.checked} alert${data.checked !== 1 ? "s" : ""} — ${data.triggered} triggered`);
    },
    onError: (e) => toast.error(e.message),
  });

  function handleCreate() {
    if (!instrumentId) { toast.error("Select an instrument"); return; }
    const t = parseInt(threshold, 10);
    if (isNaN(t) || t < 0 || t > 100) { toast.error("Threshold must be 0–100"); return; }
    createMut.mutate({ instrumentId, condition, threshold: t, notes: notes || undefined });
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bell className="h-6 w-6 text-green-600" />
            COT Threshold Alerts
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Get notified when a COT Index crosses your threshold. CFTC data drops every Friday — alerts are checked weekly.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => checkMut.mutate()}
          disabled={checkMut.isPending}
        >
          <RefreshCw className={`h-4 w-4 ${checkMut.isPending ? "animate-spin" : ""}`} />
          Check Now
        </Button>
      </div>

      {/* Create form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New Alert
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Instrument</Label>
              <Select value={instrumentId} onValueChange={setInstrumentId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {COT_INSTRUMENTS.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.name} ({inst.category})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Condition</Label>
              <Select value={condition} onValueChange={(v) => setCondition(v as "above" | "below")}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="above">
                    <span className="flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-green-600" />
                      COT Index ≥ (Bullish cross)
                    </span>
                  </SelectItem>
                  <SelectItem value="below">
                    <span className="flex items-center gap-1.5">
                      <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                      COT Index ≤ (Bearish cross)
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Threshold (0–100)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="h-9"
                placeholder="75"
              />
            </div>

            <Button
              onClick={handleCreate}
              disabled={createMut.isPending || !instrumentId}
              className="h-9 bg-green-600 hover:bg-green-700 text-white"
            >
              {createMut.isPending ? "Creating…" : "Add Alert"}
            </Button>
          </div>

          <div className="mt-3">
            <Label className="text-xs">Notes (optional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Watching for Gold bullish reversal setup"
              className="h-9 mt-1.5"
              maxLength={256}
            />
          </div>

          {/* Helper text */}
          <p className="text-xs text-gray-400 mt-3">
            <strong>Tip:</strong> Set threshold to 75 with condition "≥" for a bullish signal (Larry Williams recommends 75+ as strong commercial long).
            Set to 25 with "≤" for a bearish signal.
          </p>
        </CardContent>
      </Card>

      {/* Alerts list */}
      <div className="space-y-3">
        {isLoading && (
          <>
            <Skeleton className="h-20 rounded-lg" />
            <Skeleton className="h-20 rounded-lg" />
          </>
        )}

        {!isLoading && (!alerts || alerts.length === 0) && (
          <div className="text-center py-16 text-gray-400">
            <Bell className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No COT alerts yet</p>
            <p className="text-sm mt-1">Create your first alert above to get notified when COT signals cross your thresholds.</p>
          </div>
        )}

        {alerts?.map((alert) => (
          <Card key={alert.id} className={`border ${alert.status === "triggered" ? "border-blue-200 bg-blue-50/30" : alert.status === "paused" ? "opacity-60" : ""}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                    alert.condition === "above" ? "bg-green-100" : "bg-red-100"
                  }`}>
                    {alert.condition === "above"
                      ? <TrendingUp className="h-4 w-4 text-green-700" />
                      : <TrendingDown className="h-4 w-4 text-red-600" />
                    }
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">{alert.instrumentName}</span>
                      <span className="text-xs text-gray-500">
                        COT Index {alert.condition === "above" ? "≥" : "≤"} {alert.threshold}
                      </span>
                      <StatusBadge status={alert.status} />
                    </div>
                    {alert.notes && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{alert.notes}</p>
                    )}
                    {alert.lastCotIndex !== null && alert.lastCotIndex !== undefined && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Last checked: COT Index = <strong>{alert.lastCotIndex}</strong>
                        {alert.lastTriggeredAt && (
                          <> · Triggered {new Date(alert.lastTriggeredAt).toLocaleDateString()}</>
                        )}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-gray-400 hover:text-gray-700"
                    onClick={() => toggleMut.mutate({ id: alert.id })}
                    title={alert.status === "paused" ? "Resume alert" : "Pause alert"}
                  >
                    {alert.status === "paused" ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-gray-400 hover:text-red-600"
                    onClick={() => deleteMut.mutate({ id: alert.id })}
                    title="Delete alert"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Info box */}
      <Card className="bg-amber-50 border-amber-200">
        <CardContent className="p-4 text-xs text-amber-800 space-y-1">
          <p className="font-semibold">How COT Alerts Work</p>
          <p>CFTC releases new COT data every Friday at 3:30 PM ET (with a 3-day lag). Click "Check Now" after Friday's data drops to evaluate all active alerts against the latest COT Index values.</p>
          <p>When an alert triggers, you'll receive a notification in PitDesk and an email to your registered address.</p>
        </CardContent>
      </Card>
    </div>
  );
}
