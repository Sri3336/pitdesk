import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
import { toast } from "sonner";
import {
  Link2,
  Link2Off,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Shield,
  Building2,
} from "lucide-react";

type Broker = "schwab" | "etrade";

const BROKER_INFO = {
  schwab: {
    name: "Charles Schwab",
    shortName: "Schwab",
    description: "Schwab Individual Trader API — OAuth2 PKCE flow. Supports multi-leg options orders.",
    docsUrl: "https://developer.schwab.com",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
    borderColor: "border-blue-200 dark:border-blue-800",
  },
  etrade: {
    name: "E*TRADE",
    shortName: "E*TRADE",
    description: "E*TRADE API — OAuth 1.0a flow. Supports spread orders via the options chain.",
    docsUrl: "https://developer.etrade.com",
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-950/30",
    borderColor: "border-purple-200 dark:border-purple-800",
  },
};

function BrokerCard({ broker, connection, onConnect, onDisconnect }: {
  broker: Broker;
  connection: { accountLabel: string | null; tokenExpiry: Date | string | null; accountId: string | null } | null;
  onConnect: (broker: Broker) => void;
  onDisconnect: (broker: Broker) => void;
}) {
  const info = BROKER_INFO[broker];
  const isConnected = !!connection;
  const tokenExpiry = connection?.tokenExpiry ? new Date(connection.tokenExpiry) : null;
  const isExpired = tokenExpiry ? tokenExpiry < new Date() : false;

  return (
    <Card className={`border transition-all ${isConnected ? `${info.borderColor}` : "border-border"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${info.bgColor}`}>
              <Building2 className={`w-5 h-5 ${info.color}`} />
            </div>
            <div>
              <CardTitle className="text-base">{info.name}</CardTitle>
              <CardDescription className="text-xs mt-0.5">{info.description}</CardDescription>
            </div>
          </div>
          <div className="shrink-0">
            {isConnected ? (
              <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Not Connected
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {isConnected && connection && (
          <div className="space-y-2 text-sm">
            {connection.accountLabel && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Account</span>
                <span className="font-medium">{connection.accountLabel}</span>
              </div>
            )}
            {connection.accountId && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Account ID</span>
                <span className="font-mono text-xs">{connection.accountId.slice(0, 8)}…</span>
              </div>
            )}
            {tokenExpiry && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Token Expires</span>
                <span className={isExpired ? "text-rose-500 font-medium" : "text-muted-foreground"}>
                  {isExpired ? "Expired — reconnect" : tokenExpiry.toLocaleDateString()}
                </span>
              </div>
            )}
            {!tokenExpiry && broker === "etrade" && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Token</span>
                <span className="text-emerald-600 dark:text-emerald-400">Long-lived (no expiry)</span>
              </div>
            )}
          </div>
        )}

        {isConnected && isExpired && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Your access token has expired. Reconnect to continue trading.</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => onConnect(broker)}
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Reconnect
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-rose-600 border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                onClick={() => onDisconnect(broker)}
              >
                <Link2Off className="w-3.5 h-3.5 mr-1.5" />
                Disconnect
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              className="flex-1"
              onClick={() => onConnect(broker)}
            >
              <Link2 className="w-3.5 h-3.5 mr-1.5" />
              Connect {info.shortName}
            </Button>
          )}
          <a href={info.docsUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

export default function BrokerSettings() {
  const [disconnectTarget, setDisconnectTarget] = useState<Broker | null>(null);
  const [oauthWindow, setOauthWindow] = useState<Window | null>(null);
  const [pendingBroker, setPendingBroker] = useState<Broker | null>(null);
  const [pendingStateKey, setPendingStateKey] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data: connections = [], isLoading } = trpc.broker.getConnections.useQuery();

  const schwabConn = connections.find(c => c.broker === "schwab") ?? null;
  const etradeConn = connections.find(c => c.broker === "etrade") ?? null;

  const getSchwabAuthUrl = trpc.broker.getSchwabAuthUrl.useMutation({
    onSuccess: (data) => {
      setPendingStateKey(data.state);
      setPendingBroker("schwab");
      const w = window.open(data.url, "schwab_auth", "width=600,height=700");
      setOauthWindow(w);
    },
    onError: (err) => toast.error(`Schwab auth error: ${err.message}`),
  });

  const getEtradeAuthUrl = trpc.broker.getEtradeAuthUrl.useMutation({
    onSuccess: (data) => {
      setPendingStateKey(data.stateKey);
      setPendingBroker("etrade");
      const w = window.open(data.url, "etrade_auth", "width=600,height=700");
      setOauthWindow(w);
    },
    onError: (err) => toast.error(`E*TRADE auth error: ${err.message}`),
  });

  const completeSchwabAuth = trpc.broker.completeSchwabAuth.useMutation({
    onSuccess: (data) => {
      toast.success(`Schwab connected: ${data.accountLabel}`);
      utils.broker.getConnections.invalidate();
      setPendingBroker(null);
      setPendingStateKey(null);
    },
    onError: (err) => toast.error(`Schwab connection failed: ${err.message}`),
  });

  const completeEtradeAuth = trpc.broker.completeEtradeAuth.useMutation({
    onSuccess: (data) => {
      toast.success(`E*TRADE connected: ${data.accountLabel}`);
      utils.broker.getConnections.invalidate();
      setPendingBroker(null);
      setPendingStateKey(null);
    },
    onError: (err) => toast.error(`E*TRADE connection failed: ${err.message}`),
  });

  const disconnectBroker = trpc.broker.disconnectBroker.useMutation({
    onSuccess: () => {
      toast.success(`${disconnectTarget === "schwab" ? "Schwab" : "E*TRADE"} disconnected`);
      setDisconnectTarget(null);
      utils.broker.getConnections.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // Listen for OAuth callback message from popup window
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const { type, code, oauthToken, oauthVerifier, state, stateKey } = event.data ?? {};

      if (type === "schwab_oauth_callback" && pendingBroker === "schwab" && pendingStateKey) {
        completeSchwabAuth.mutate({
          code,
          state: state ?? pendingStateKey,
          redirectUri: `${window.location.origin}/broker/schwab/callback`,
        });
        oauthWindow?.close();
      } else if (type === "etrade_oauth_callback" && pendingBroker === "etrade" && pendingStateKey) {
        completeEtradeAuth.mutate({
          oauthToken,
          oauthVerifier,
          stateKey: stateKey ?? pendingStateKey,
        });
        oauthWindow?.close();
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [pendingBroker, pendingStateKey, oauthWindow]);

  const handleConnect = (broker: Broker) => {
    if (broker === "schwab") {
      getSchwabAuthUrl.mutate({
        redirectUri: `${window.location.origin}/broker/schwab/callback`,
      });
    } else {
      getEtradeAuthUrl.mutate({
        callbackUrl: `${window.location.origin}/broker/etrade/callback`,
      });
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" />
          Broker Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect your brokerage accounts to enable automated trade execution from the Trading Agent.
        </p>
      </div>

      {/* Security note */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50 border text-sm">
        <Shield className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <div className="text-muted-foreground">
          <strong className="text-foreground">Your credentials are never stored.</strong>{" "}
          OAuth tokens are encrypted and stored in your private database. Tokens are only used to place orders you explicitly approve.
          You can disconnect at any time.
        </div>
      </div>

      <Separator />

      {/* Broker cards */}
      {isLoading ? (
        <div className="space-y-4">
          <div className="h-40 rounded-lg bg-muted animate-pulse" />
          <div className="h-40 rounded-lg bg-muted animate-pulse" />
        </div>
      ) : (
        <div className="space-y-4">
          <BrokerCard
            broker="schwab"
            connection={schwabConn}
            onConnect={handleConnect}
            onDisconnect={b => setDisconnectTarget(b)}
          />
          <BrokerCard
            broker="etrade"
            connection={etradeConn}
            onConnect={handleConnect}
            onDisconnect={b => setDisconnectTarget(b)}
          />
        </div>
      )}

      {/* OAuth in progress indicator */}
      {pendingBroker && (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 text-sm">
          <RefreshCw className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
          <div>
            <p className="font-medium text-blue-800 dark:text-blue-300">
              Waiting for {pendingBroker === "schwab" ? "Schwab" : "E*TRADE"} authorization…
            </p>
            <p className="text-blue-700 dark:text-blue-400 mt-0.5">
              Complete the login in the popup window. If the popup was blocked, allow popups for this site and try again.
            </p>
          </div>
        </div>
      )}

      {/* API credentials setup guide */}
      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="font-semibold text-sm">Setting Up API Credentials</h3>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Schwab:</strong> Register at{" "}
            <a href="https://developer.schwab.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">
              developer.schwab.com
            </a>{" "}
            → Create an app → Copy your Client ID and Client Secret → add them in{" "}
            <strong className="text-foreground">Settings → Secrets</strong> as{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-xs">SCHWAB_CLIENT_ID</code> and{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-xs">SCHWAB_CLIENT_SECRET</code>.
          </p>
          <p>
            <strong className="text-foreground">E*TRADE:</strong> Register at{" "}
            <a href="https://developer.etrade.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">
              developer.etrade.com
            </a>{" "}
            → Create an app → Copy your Consumer Key and Consumer Secret → add them as{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-xs">ETRADE_CONSUMER_KEY</code> and{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-xs">ETRADE_CONSUMER_SECRET</code>.
            Set{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-xs">ETRADE_ENV=production</code>{" "}
            for live trading (default is sandbox).
          </p>
        </div>
      </div>

      {/* Disconnect confirmation */}
      <AlertDialog open={!!disconnectTarget} onOpenChange={open => !open && setDisconnectTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {disconnectTarget === "schwab" ? "Schwab" : "E*TRADE"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove your stored OAuth tokens. You will not be able to execute trades via{" "}
              {disconnectTarget === "schwab" ? "Schwab" : "E*TRADE"} until you reconnect.
              Any open positions will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => disconnectTarget && disconnectBroker.mutate({ broker: disconnectTarget })}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
