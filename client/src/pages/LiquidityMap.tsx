/**
 * Liquidity Map — AJ Liquidity Hunting Framework
 *
 * Per-ticker zone manager. Mark obvious retail zones (resistance, support,
 * supply/demand, trendlines, Fibonacci levels, VWAP, prior highs/lows).
 * When logging a Morning Session trade, these zones are referenced to flag
 * whether the setup is at a retail trap zone (higher-conviction entry).
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Edit2,
  Archive,
  ArchiveRestore,
  MapPin,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronRight,
  Info,
} from "lucide-react";

// ─── Zone type config ─────────────────────────────────────────────────────────
const ZONE_TYPES = [
  { value: "resistance",    label: "Resistance",     color: "bg-red-100 text-red-700 border-red-200",     icon: TrendingDown },
  { value: "support",       label: "Support",        color: "bg-green-100 text-green-700 border-green-200", icon: TrendingUp },
  { value: "supply",        label: "Supply Zone",    color: "bg-orange-100 text-orange-700 border-orange-200", icon: TrendingDown },
  { value: "demand",        label: "Demand Zone",    color: "bg-blue-100 text-blue-700 border-blue-200",   icon: TrendingUp },
  { value: "trendline",     label: "Trendline",      color: "bg-purple-100 text-purple-700 border-purple-200", icon: Minus },
  { value: "fibonacci",     label: "Fibonacci",      color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: Minus },
  { value: "vwap",          label: "VWAP",           color: "bg-cyan-100 text-cyan-700 border-cyan-200",   icon: Minus },
  { value: "previous_high", label: "Previous High",  color: "bg-rose-100 text-rose-700 border-rose-200",   icon: TrendingDown },
  { value: "previous_low",  label: "Previous Low",   color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: TrendingUp },
  { value: "other",         label: "Other",          color: "bg-gray-100 text-gray-700 border-gray-200",   icon: MapPin },
] as const;

type ZoneTypeValue = typeof ZONE_TYPES[number]["value"];

function getZoneConfig(type: string) {
  return ZONE_TYPES.find(z => z.value === type) ?? ZONE_TYPES[ZONE_TYPES.length - 1];
}

// ─── AJ Framework explanation ─────────────────────────────────────────────────
function AJFrameworkCard() {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpanded(v => !v)}>
        <CardTitle className="text-sm font-semibold text-amber-800 flex items-center gap-2">
          <Info className="h-4 w-4" />
          AJ Liquidity Hunting Framework
          {expanded ? <ChevronDown className="h-4 w-4 ml-auto" /> : <ChevronRight className="h-4 w-4 ml-auto" />}
        </CardTitle>
      </CardHeader>
      {expanded && (
        <CardContent className="text-xs text-amber-700 space-y-2 pt-0">
          <p><strong>Core idea:</strong> Every retail strategy (S/R, Supply/Demand, Fibonacci, SMC) creates predictable stop-loss pools. Institutions hunt those stops before reversing.</p>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div className="bg-white rounded p-2 border border-amber-200">
              <p className="font-semibold mb-1">Step 1 — Mark the obvious zone</p>
              <p>Identify a clean retail level with 3+ touches. This is where retail stops cluster.</p>
            </div>
            <div className="bg-white rounded p-2 border border-amber-200">
              <p className="font-semibold mb-1">Step 2 — Wait for the false signal</p>
              <p>Price approaches zone → retail gets a 1-min bearish BoS → they go short.</p>
            </div>
            <div className="bg-white rounded p-2 border border-amber-200">
              <p className="font-semibold mb-1">Step 3 — Enter the sweep</p>
              <p>Enter long INTO the supply zone. You're fading the retail trap. Target: liquidity pool above.</p>
            </div>
            <div className="bg-white rounded p-2 border border-amber-200">
              <p className="font-semibold mb-1">Step 4 — Exit after sweep</p>
              <p>Once the prior high is swept (stops harvested), exit immediately. Don't hold for more.</p>
            </div>
          </div>
          <p className="mt-2"><strong>For ORB trades:</strong> If your breakout is happening AT an obvious retail zone, flag it as "Near Retail Zone" when logging — it's a higher-conviction setup (AJ would call it a liquidity sweep).</p>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Add / Edit Zone Dialog ───────────────────────────────────────────────────
interface ZoneDialogProps {
  open: boolean;
  onClose: () => void;
  ticker: string;
  editZone?: {
    id: number;
    zoneType: string;
    priceLevel: number;
    priceLevelHigh: number | null;
    notes: string | null;
  } | null;
  onSaved: () => void;
}

function ZoneDialog({ open, onClose, ticker, editZone, onSaved }: ZoneDialogProps) {
  const [zoneType, setZoneType] = useState<ZoneTypeValue>((editZone?.zoneType as ZoneTypeValue) ?? "resistance");
  const [priceLevel, setPriceLevel] = useState(editZone?.priceLevel?.toString() ?? "");
  const [priceLevelHigh, setPriceLevelHigh] = useState(editZone?.priceLevelHigh?.toString() ?? "");
  const [notes, setNotes] = useState(editZone?.notes ?? "");

  const utils = trpc.useUtils();

  const addZone = trpc.liquidityMap.addZone.useMutation({
    onSuccess: () => {
      utils.liquidityMap.listByTicker.invalidate({ ticker });
      utils.liquidityMap.listAll.invalidate();
      toast.success("Zone added");
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });

  const editZoneMut = trpc.liquidityMap.editZone.useMutation({
    onSuccess: () => {
      utils.liquidityMap.listByTicker.invalidate({ ticker });
      utils.liquidityMap.listAll.invalidate();
      toast.success("Zone updated");
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    const pl = parseFloat(priceLevel);
    const plh = priceLevelHigh ? parseFloat(priceLevelHigh) : undefined;
    if (!pl || pl <= 0) { toast.error("Enter a valid price level"); return; }
    if (editZone) {
      editZoneMut.mutate({ id: editZone.id, ticker, zoneType, priceLevel: pl, priceLevelHigh: plh, notes: notes || undefined });
    } else {
      addZone.mutate({ ticker, zoneType, priceLevel: pl, priceLevelHigh: plh, notes: notes || undefined });
    }
  };

  const isLoading = addZone.isPending || editZoneMut.isPending;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editZone ? "Edit Zone" : `Add Zone — ${ticker}`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Zone Type</Label>
            <Select value={zoneType} onValueChange={v => setZoneType(v as ZoneTypeValue)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ZONE_TYPES.map(z => (
                  <SelectItem key={z.value} value={z.value}>{z.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Price Level (lower)</Label>
              <Input
                className="mt-1"
                type="number"
                step="0.01"
                placeholder="e.g. 185.00"
                value={priceLevel}
                onChange={e => setPriceLevel(e.target.value)}
              />
            </div>
            <div>
              <Label>Price Level High <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                className="mt-1"
                type="number"
                step="0.01"
                placeholder="e.g. 187.50"
                value={priceLevelHigh}
                onChange={e => setPriceLevelHigh(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea
              className="mt-1"
              rows={2}
              placeholder="e.g. 3 touches on weekly, heavy OI at this strike"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? "Saving…" : editZone ? "Update Zone" : "Add Zone"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Zone Row ─────────────────────────────────────────────────────────────────
interface ZoneRowProps {
  zone: {
    id: number;
    ticker: string;
    zoneType: string;
    priceLevel: number;
    priceLevelHigh: number | null;
    notes: string | null;
    isActive: boolean;
  };
  onEdit: () => void;
  onRefresh: () => void;
}

function ZoneRow({ zone, onEdit, onRefresh }: ZoneRowProps) {
  const utils = trpc.useUtils();
  const cfg = getZoneConfig(zone.zoneType);
  const Icon = cfg.icon;

  const deleteZone = trpc.liquidityMap.deleteZone.useMutation({
    onSuccess: () => { utils.liquidityMap.listByTicker.invalidate(); utils.liquidityMap.listAll.invalidate(); onRefresh(); toast.success("Zone deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const archiveZone = trpc.liquidityMap.archiveZone.useMutation({
    onSuccess: () => { utils.liquidityMap.listByTicker.invalidate(); utils.liquidityMap.listAll.invalidate(); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${zone.isActive ? "bg-white" : "bg-gray-50 opacity-60"}`}>
      <div className={`p-1.5 rounded border ${cfg.color}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={`text-xs border ${cfg.color}`}>{cfg.label}</Badge>
          <span className="font-mono text-sm font-semibold">
            ${zone.priceLevel.toFixed(2)}
            {zone.priceLevelHigh && <span className="text-muted-foreground"> – ${zone.priceLevelHigh.toFixed(2)}</span>}
          </span>
          {!zone.isActive && <Badge variant="outline" className="text-xs text-gray-500">Archived</Badge>}
        </div>
        {zone.notes && <p className="text-xs text-muted-foreground mt-0.5 truncate">{zone.notes}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit} title="Edit">
          <Edit2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon" variant="ghost" className="h-7 w-7"
          onClick={() => archiveZone.mutate({ id: zone.id, isActive: !zone.isActive })}
          title={zone.isActive ? "Archive" : "Restore"}
        >
          {zone.isActive ? <Archive className="h-3.5 w-3.5" /> : <ArchiveRestore className="h-3.5 w-3.5" />}
        </Button>
        <Button
          size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600"
          onClick={() => { if (confirm("Delete this zone?")) deleteZone.mutate({ id: zone.id }); }}
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Ticker Zones Panel ───────────────────────────────────────────────────────
interface TickerZonesPanelProps {
  ticker: string;
  showArchived: boolean;
}

function TickerZonesPanel({ ticker, showArchived }: TickerZonesPanelProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [editZone, setEditZone] = useState<{
    id: number; zoneType: string; priceLevel: number; priceLevelHigh: number | null; notes: string | null;
  } | null>(null);

  const { data: zones = [], refetch } = trpc.liquidityMap.listByTicker.useQuery({
    ticker,
    includeArchived: showArchived,
  });

  const activeZones = zones.filter(z => z.isActive);
  const archivedZones = zones.filter(z => !z.isActive);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{ticker}</span>
          <Badge variant="secondary" className="text-xs">{activeZones.length} active</Badge>
          {archivedZones.length > 0 && showArchived && (
            <Badge variant="outline" className="text-xs text-gray-500">{archivedZones.length} archived</Badge>
          )}
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Add Zone
        </Button>
      </div>

      {zones.length === 0 ? (
        <div className="text-center py-4 text-muted-foreground text-xs border rounded-lg bg-gray-50">
          No zones marked yet. Add a retail zone to start tracking liquidity levels.
        </div>
      ) : (
        <div className="space-y-1.5">
          {zones.map(zone => (
            <ZoneRow
              key={zone.id}
              zone={zone}
              onEdit={() => setEditZone(zone)}
              onRefresh={() => refetch()}
            />
          ))}
        </div>
      )}

      {addOpen && (
        <ZoneDialog
          open={addOpen}
          onClose={() => setAddOpen(false)}
          ticker={ticker}
          onSaved={() => { setAddOpen(false); refetch(); }}
        />
      )}
      {editZone && (
        <ZoneDialog
          open={!!editZone}
          onClose={() => setEditZone(null)}
          ticker={ticker}
          editZone={editZone}
          onSaved={() => { setEditZone(null); refetch(); }}
        />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function LiquidityMap() {
  const [newTicker, setNewTicker] = useState("");
  const [trackedTickers, setTrackedTickers] = useState<string[]>(["SPY", "QQQ", "NVDA", "TSLA", "AAPL"]);
  const [showArchived, setShowArchived] = useState(false);
  const [addTickerOpen, setAddTickerOpen] = useState(false);
  const [tickerInput, setTickerInput] = useState("");

  const { data: allZones = [] } = trpc.liquidityMap.listAll.useQuery({ includeArchived: showArchived });

  // Merge tickers from DB with manually tracked ones
  const dbTickers = Array.from(new Set(allZones.map(z => z.ticker)));
  const allTickers = Array.from(new Set([...trackedTickers, ...dbTickers])).sort();

  const handleAddTicker = () => {
    const t = tickerInput.toUpperCase().trim();
    if (!t) return;
    if (!trackedTickers.includes(t)) setTrackedTickers(prev => [...prev, t]);
    setTickerInput("");
    setAddTickerOpen(false);
  };

  const handleRemoveTicker = (t: string) => {
    setTrackedTickers(prev => prev.filter(x => x !== t));
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="h-6 w-6 text-primary" />
            Liquidity Map
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Mark obvious retail zones per ticker. Flag Morning Session trades that sweep these levels for higher-conviction entries.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Switch checked={showArchived} onCheckedChange={setShowArchived} id="show-archived" />
            <label htmlFor="show-archived" className="text-muted-foreground cursor-pointer">Show archived</label>
          </div>
          <Button
            size="sm"
            className="gap-1"
            onClick={() => setAddTickerOpen(true)}
          >
            <Plus className="h-4 w-4" /> Add Ticker
          </Button>
        </div>
      </div>

      {/* AJ Framework explanation */}
      <AJFrameworkCard />

      {/* Zone type legend */}
      <div className="flex flex-wrap gap-1.5">
        {ZONE_TYPES.map(z => (
          <Badge key={z.value} variant="outline" className={`text-xs border ${z.color}`}>{z.label}</Badge>
        ))}
      </div>

      <Separator />

      {/* Per-ticker panels */}
      <div className="space-y-6">
        {allTickers.map(ticker => (
          <div key={ticker}>
            <div className="flex items-center gap-2 mb-2">
              <TickerZonesPanel ticker={ticker} showArchived={showArchived} />
              {trackedTickers.includes(ticker) && !allZones.some(z => z.ticker === ticker) && (
                <Button
                  size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-red-500 shrink-0 self-start mt-0.5"
                  onClick={() => handleRemoveTicker(ticker)}
                  title="Remove ticker"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <Separator />
          </div>
        ))}
      </div>

      {allTickers.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <MapPin className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No tickers tracked yet</p>
          <p className="text-sm">Add a ticker to start marking liquidity zones</p>
        </div>
      )}

      {/* Add Ticker Dialog */}
      <Dialog open={addTickerOpen} onOpenChange={v => !v && setAddTickerOpen(false)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Add Ticker</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="e.g. NVDA"
            value={tickerInput}
            onChange={e => setTickerInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && handleAddTicker()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTickerOpen(false)}>Cancel</Button>
            <Button onClick={handleAddTicker}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
