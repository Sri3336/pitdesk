import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Bot,
  TrendingUp,
  TrendingDown,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Play,
  Settings,
} from "lucide-react";
import { Link } from "wouter";

type Broker = "schwab" | "etrade";

interface ProposalLeg {
  action: "BUY" | "SELL";
  putCall: "PUT" | "CALL";
  strike: number;
  expiry: string;
}

interface Proposal {
  id: number;
  ticker: string;
  strategy: string;
  legsJson: string;
  underlyingPrice: string;
  netCredit: string;
  maxProfit: string;
  maxLoss: string;
  breakeven: string;
  pop: string;
  contracts: number;
  bpRequired: string;
  compositeScore: string;
  expiryDate: Date | string;
  targetDte: number;
  status: string;
  broker: string | null;
  createdAt: Date | string;
}

function strategyIcon(strategy: string) {
  if (strategy.includes("Put")) return <TrendingUp className="w-4 h-4 text-emerald-500" />;
  if (strategy.includes("Call")) return <TrendingDown className="w-4 h-4 text-rose-500" />;
  return <Activity className="w-4 h-4 text-blue-500" />;
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "Pending Review", variant: "secondary" },
    approved: { label: "Approved", variant: "default" },
    rejected: { label: "Rejected", variant: "destructive" },
    executed: { label: "Executed", variant: "default" },
    failed: { label: "Failed", variant: "destructive" },
  };
  const s = map[status] ?? { label: status, variant: "outline" };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

function TradeCard({ proposal, onApprove, onReject, connectedBrokers }: {
  proposal: Proposal;
  onApprove: (id: number, broker: Broker) => void;
  onReject: (id: number) => void;
  connectedBrokers: Broker[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedBroker, setSelectedBroker] = useState<Broker | "">(
    connectedBrokers.length === 1 ? connectedBrokers[0] : ""
  );

  const legs: ProposalLeg[] = JSON.parse(proposal.legsJson);
  const netCredit = parseFloat(proposal.netCredit);
  const maxLoss = parseFloat(proposal.maxLoss);
  const pop = parseFloat(proposal.pop) * 100;
  const bpRequired = parseFloat(proposal.bpRequired);
  const score = parseFloat(proposal.compositeScore);
  const underlyingPrice = parseFloat(proposal.underlyingPrice);
  const expiryDate = new Date(proposal.expiryDate);
  const isPending = proposal.status === "pending";

  const creditPerContract = netCredit * 100;
  const maxLossPerContract = maxLoss * 100;

  return (
    <Card className={`border transition-all duration-200 ${isPending ? "border-border shadow-sm hover:shadow-md" : "border-border/50 opacity-75"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {strategyIcon(proposal.strategy)}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-lg">{proposal.ticker}</span>
                <span className="text-sm text-muted-foreground font-medium">{proposal.strategy}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Underlying: ${underlyingPrice.toFixed(2)} · Expiry: {expiryDate.toLocaleDateString()} ({proposal.targetDte} DTE)
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {statusBadge(proposal.status)}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setExpanded(e => !e)}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {/* Key metrics row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground mb-1">Net Credit</div>
            <div className="font-bold text-emerald-600 dark:text-emerald-400">
              ${creditPerContract.toFixed(2)}
              <span className="text-xs font-normal text-muted-foreground"> /contract</span>
            </div>
          </div>
          <div className="bg-rose-50 dark:bg-rose-950/30 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground mb-1">Max Loss</div>
            <div className="font-bold text-rose-600 dark:text-rose-400">
              ${maxLossPerContract.toFixed(2)}
              <span className="text-xs font-normal text-muted-foreground"> /contract</span>
            </div>
          </div>
          <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground mb-1">Prob. of Profit</div>
            <div className="font-bold text-blue-600 dark:text-blue-400">{pop.toFixed(1)}%</div>
          </div>
          <div className="bg-violet-50 dark:bg-violet-950/30 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground mb-1">Score</div>
            <div className="font-bold text-violet-600 dark:text-violet-400">{score.toFixed(1)}/10</div>
          </div>
        </div>

        {/* Summary line */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>{proposal.contracts} contract{proposal.contracts !== 1 ? "s" : ""}</span>
          <span>BP Required: <strong className="text-foreground">${bpRequired.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
          <span>Breakeven: <strong className="text-foreground">${parseFloat(proposal.breakeven).toFixed(2)}</strong></span>
          <span>Total Credit: <strong className="text-emerald-600 dark:text-emerald-400">${(creditPerContract * proposal.contracts).toFixed(2)}</strong></span>
        </div>

        {/* Expanded legs detail */}
        {expanded && (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Action</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Strike</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Expiry</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Qty</th>
                </tr>
              </thead>
              <tbody>
                {legs.map((leg, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2">
                      <Badge variant={leg.action === "SELL" ? "default" : "outline"} className="text-xs">
                        {leg.action}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{leg.putCall}</td>
                    <td className="px-3 py-2 text-right font-mono">${leg.strike}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{leg.expiry}</td>
                    <td className="px-3 py-2 text-right">{proposal.contracts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Approve/Reject controls for pending proposals */}
        {isPending && (
          <>
            <Separator />
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              {connectedBrokers.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-4 h-4" />
                  <span>No broker connected. </span>
                  <Link href="/broker-settings" className="underline font-medium">Connect a broker</Link>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <Select
                      value={selectedBroker}
                      onValueChange={v => setSelectedBroker(v as Broker)}
                    >
                      <SelectTrigger className="w-full sm:w-48">
                        <SelectValue placeholder="Select broker" />
                      </SelectTrigger>
                      <SelectContent>
                        {connectedBrokers.includes("schwab") && (
                          <SelectItem value="schwab">Schwab</SelectItem>
                        )}
                        {connectedBrokers.includes("etrade") && (
                          <SelectItem value="etrade">E*TRADE</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-rose-600 border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                      onClick={() => onReject(proposal.id)}
                    >
                      <XCircle className="w-4 h-4 mr-1.5" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={!selectedBroker}
                      onClick={() => selectedBroker && onApprove(proposal.id, selectedBroker)}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1.5" />
                      Approve & Execute
                    </Button>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* Executed info */}
        {proposal.status === "executed" && proposal.broker && (
          <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            <span>Executed via {proposal.broker === "schwab" ? "Schwab" : "E*TRADE"}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function TradeProposals() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<"pending" | "all">("pending");
  const [approveTarget, setApproveTarget] = useState<{ id: number; broker: Broker } | null>(null);
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);
  const [agentSettings, setAgentSettings] = useState({ accountSize: 25000, targetDte: 30 });

  const utils = trpc.useUtils();

  const { data: proposals = [], isLoading: proposalsLoading, refetch } = trpc.agent.listProposals.useQuery({
    status: statusFilter,
    limit: 50,
  });

  const { data: connections = [] } = trpc.broker.getConnections.useQuery();
  const connectedBrokers = connections.map(c => c.broker as Broker);

  const { data: recentRuns = [], isLoading: runsLoading } = trpc.agent.listRuns.useQuery({ limit: 5 });

  const runAgent = trpc.agent.run.useMutation({
    onSuccess: (data) => {
      toast.success(`Agent completed: ${data.proposalCount} proposal${data.proposalCount !== 1 ? "s" : ""} generated`);
      utils.agent.listProposals.invalidate();
      utils.agent.listRuns.invalidate();
    },
    onError: (err) => toast.error(`Agent failed: ${err.message}`),
  });

  const approveProposal = trpc.agent.approveProposal.useMutation({
    onSuccess: (data) => {
      toast.success(`Trade executed! Order ID: ${data.brokerOrderId ?? "pending"}`);
      setApproveTarget(null);
      utils.agent.listProposals.invalidate();
      utils.tradeLog.list.invalidate();
    },
    onError: (err) => {
      toast.error(`Execution failed: ${err.message}`);
      setApproveTarget(null);
    },
  });

  const rejectProposal = trpc.agent.rejectProposal.useMutation({
    onSuccess: () => {
      toast.success("Proposal rejected");
      setRejectTarget(null);
      utils.agent.listProposals.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const pendingCount = proposals.filter(p => p.status === "pending").length;
  const lastRun = recentRuns[0];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="w-6 h-6 text-primary" />
            Trading Agent
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Credit spread proposals generated from your watchlist — review and approve before execution.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/broker-settings">
            <Button variant="outline" size="sm">
              <Settings className="w-4 h-4 mr-1.5" />
              Broker Settings
            </Button>
          </Link>
          <Button
            size="sm"
            onClick={() => runAgent.mutate(agentSettings)}
            disabled={runAgent.isPending}
          >
            {runAgent.isPending ? (
              <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-1.5" />
            )}
            {runAgent.isPending ? "Scanning…" : "Run Agent"}
          </Button>
        </div>
      </div>

      {/* Status bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-amber-500">{pendingCount}</div>
          <div className="text-xs text-muted-foreground">Pending Review</div>
        </div>
        <div className="bg-card border rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-emerald-500">
            {proposals.filter(p => p.status === "executed").length}
          </div>
          <div className="text-xs text-muted-foreground">Executed</div>
        </div>
        <div className="bg-card border rounded-lg p-3 text-center">
          <div className="text-2xl font-bold">{connectedBrokers.length}</div>
          <div className="text-xs text-muted-foreground">Broker{connectedBrokers.length !== 1 ? "s" : ""} Connected</div>
        </div>
        <div className="bg-card border rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-muted-foreground">
            {lastRun ? new Date(lastRun.createdAt).toLocaleDateString() : "—"}
          </div>
          <div className="text-xs text-muted-foreground">Last Scan</div>
        </div>
      </div>

      {/* No broker warning */}
      {connectedBrokers.length === 0 && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">No broker connected</p>
            <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
              Connect Schwab or E*TRADE in{" "}
              <Link href="/broker-settings" className="underline font-medium">Broker Settings</Link>{" "}
              to approve and execute trades.
            </p>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-2">
        <Button
          variant={statusFilter === "pending" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("pending")}
        >
          <Clock className="w-3.5 h-3.5 mr-1.5" />
          Pending ({pendingCount})
        </Button>
        <Button
          variant={statusFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("all")}
        >
          All Proposals
        </Button>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Proposals list */}
      {proposalsLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-40 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : proposals.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Bot className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No proposals yet</p>
          <p className="text-sm mt-1">
            {statusFilter === "pending"
              ? "Run the agent to scan your watchlist and generate credit spread proposals."
              : "No proposals found for the selected filter."}
          </p>
          {statusFilter === "pending" && (
            <Button
              className="mt-4"
              onClick={() => runAgent.mutate(agentSettings)}
              disabled={runAgent.isPending}
            >
              <Play className="w-4 h-4 mr-1.5" />
              Run Agent Now
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {proposals.map(p => (
            <TradeCard
              key={p.id}
              proposal={p as Proposal}
              connectedBrokers={connectedBrokers}
              onApprove={(id, broker) => setApproveTarget({ id, broker })}
              onReject={(id) => setRejectTarget(id)}
            />
          ))}
        </div>
      )}

      {/* Approve confirmation dialog */}
      <AlertDialog open={!!approveTarget} onOpenChange={open => !open && setApproveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              Confirm Trade Execution
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will place a real money options order via{" "}
              <strong>{approveTarget?.broker === "schwab" ? "Schwab" : "E*TRADE"}</strong>.
              The order will be submitted as a day limit order at the net credit price.
              <br /><br />
              <strong>This action cannot be undone.</strong> Please verify the trade details before confirming.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => approveTarget && approveProposal.mutate({
                proposalId: approveTarget.id,
                broker: approveTarget.broker,
              })}
            >
              {approveProposal.isPending ? "Executing…" : "Execute Trade"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject confirmation dialog */}
      <AlertDialog open={!!rejectTarget} onOpenChange={open => !open && setRejectTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Proposal?</AlertDialogTitle>
            <AlertDialogDescription>
              This proposal will be marked as rejected and removed from the pending queue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => rejectTarget && rejectProposal.mutate({ proposalId: rejectTarget })}
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
