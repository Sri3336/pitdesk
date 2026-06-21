import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  BarChart2,
  BookOpen,
  Brain,
  ChevronRight,
  FileText,
  Flame,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Sparkles,
  Target,
  TrendingUp,
  User,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

// ─── Suggested Prompts ────────────────────────────────────────────────────────

const SUGGESTED_PROMPTS = [
  { icon: <FileText className="h-3.5 w-3.5" />, label: "Analyze my trades", prompt: "Analyze my uploaded trades. What patterns do you see in my wins and losses? What should I change?", requiresTrades: true },
  { icon: <TrendingUp className="h-3.5 w-3.5" />, label: "NVDA options play", prompt: "Is NVDA a good options play this week? Give me a full 5-dimension analysis.", requiresTrades: false },
  { icon: <Target className="h-3.5 w-3.5" />, label: "Best strategies for me", prompt: "Based on my trade history, which strategies are working best for me and which should I drop?", requiresTrades: true },
  { icon: <BarChart2 className="h-3.5 w-3.5" />, label: "PCR signal for SPY", prompt: "What does the current PCR signal for SPY tell us about market direction? What options strategy fits best?", requiresTrades: false },
  { icon: <Flame className="h-3.5 w-3.5" />, label: "Iron Condor setup", prompt: "Walk me through setting up an Iron Condor on SPY for this week. What strikes, expiry, and sizing would you recommend?", requiresTrades: false },
  { icon: <AlertTriangle className="h-3.5 w-3.5" />, label: "Review my losers", prompt: "Analyze my losing trades specifically. What are the common mistakes and how do I stop repeating them?", requiresTrades: true },
  { icon: <Zap className="h-3.5 w-3.5" />, label: "ORS setup today", prompt: "Explain the Opening Range Scalper strategy and what makes a high-quality ORS setup. What should I look for?", requiresTrades: false },
  { icon: <Brain className="h-3.5 w-3.5" />, label: "Position sizing", prompt: "How should I size my positions? I'm trading a $50,000 account. Walk me through Kelly criterion and risk management.", requiresTrades: false },
];

const ANALYSIS_MODES = [
  { key: "overall", label: "Overall Review", icon: <BarChart2 className="h-3.5 w-3.5" /> },
  { key: "winners", label: "What's Working", icon: <TrendingUp className="h-3.5 w-3.5" /> },
  { key: "losers", label: "What's Failing", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  { key: "strategies", label: "Strategy Breakdown", icon: <Target className="h-3.5 w-3.5" /> },
  { key: "tickers", label: "Ticker Focus", icon: <Zap className="h-3.5 w-3.5" /> },
] as const;

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold
        ${isUser ? "bg-blue-500" : "bg-gradient-to-br from-green-500 to-emerald-600"}`}>
        {isUser ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
      </div>
      {/* Bubble */}
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm
        ${isUser
          ? "bg-blue-500 text-white rounded-tr-sm"
          : "bg-white border border-border shadow-sm rounded-tl-sm text-foreground"}`}>
        {isUser ? (
          <div className="whitespace-pre-wrap">{msg.content}</div>
        ) : (
          <div className="prose prose-sm max-w-none prose-headings:text-foreground prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-strong:text-foreground prose-code:bg-slate-100 prose-code:px-1 prose-code:rounded prose-code:text-xs">
            <ReactMarkdown>{msg.content}</ReactMarkdown>
          </div>
        )}
        <div className={`text-[10px] mt-1.5 ${isUser ? "text-blue-200" : "text-muted-foreground"}`}>
          {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

// ─── Quick Research Panel ─────────────────────────────────────────────────────

function QuickResearchPanel({ onResult }: { onResult: (content: string, ticker: string) => void }) {
  const [ticker, setTicker] = useState("");
  const [question, setQuestion] = useState("");
  const mutation = trpc.pitAdvisor.quickResearch.useMutation({
    onSuccess: (data) => {
      onResult(data.content, data.ticker);
      setTicker("");
      setQuestion("");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card className="shadow-none">
      <CardHeader className="pb-2 pt-3 px-3">
        <CardTitle className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
          <Zap className="h-3.5 w-3.5 text-yellow-500" />
          Quick Ticker Research
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-2">
        <input
          type="text"
          placeholder="Ticker (e.g. NVDA)"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-green-400"
          maxLength={10}
        />
        <input
          type="text"
          placeholder="Question (optional)"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-green-400"
          maxLength={200}
        />
        <Button
          size="sm"
          className="w-full text-xs h-8 bg-green-500 hover:bg-green-600 text-white"
          disabled={!ticker.trim() || mutation.isPending}
          onClick={() => mutation.mutate({ ticker: ticker.trim(), question: question.trim() || undefined })}
        >
          {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Zap className="h-3.5 w-3.5 mr-1" />}
          {mutation.isPending ? "Researching…" : "Research"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Trade Analysis Panel ──────────────────────────────────────────────────────

function TradeAnalysisPanel({ onResult }: { onResult: (content: string) => void }) {
  const [mode, setMode] = useState<typeof ANALYSIS_MODES[number]["key"]>("overall");
  const mutation = trpc.pitAdvisor.analyzeMyTrades.useMutation({
    onSuccess: (data) => onResult(data.content),
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card className="shadow-none">
      <CardHeader className="pb-2 pt-3 px-3">
        <CardTitle className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
          <FileText className="h-3.5 w-3.5 text-blue-500" />
          Analyze My Trades
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-2">
        <div className="space-y-1">
          {ANALYSIS_MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`w-full flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg text-left transition-colors
                ${mode === m.key ? "bg-green-100 text-green-700 font-medium" : "hover:bg-accent text-muted-foreground"}`}
            >
              {m.icon}
              {m.label}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          className="w-full text-xs h-8 bg-blue-500 hover:bg-blue-600 text-white"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ focus: mode })}
        >
          {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Brain className="h-3.5 w-3.5 mr-1" />}
          {mutation.isPending ? "Analyzing…" : "Analyze"}
        </Button>
        <div className="text-[10px] text-muted-foreground text-center">
          Requires uploaded trades — visit Trade Upload first
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PitAdvisor() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: `# Welcome to Pit Advisor 🎯

I'm your AI trading research assistant, built into PitDesk. I analyze trades across **5 dimensions**: Technical, Fundamental, Geopolitical, Sentiment, and Quantitative/Math.

**What I can do:**
- Analyze specific tickers with full multi-dimensional research
- Review your uploaded trade history and identify patterns
- Help you build options strategies (Iron Condor, Bull Call Spread, etc.)
- Interpret PCR signals, COT data, and scanner results
- Challenge bad setups and help you think through risk

**How to start:**
- Type your question below
- Use the suggested prompts on the right
- Enable "Include My Trades" to get personalized analysis based on your upload history

What would you like to research today?`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState(() => {
    if (typeof window === "undefined") return "";
    const p = new URLSearchParams(window.location.search);
    const prompt = p.get("prompt");
    return prompt ? decodeURIComponent(prompt) : "";
  });
  const [includeTradeContext, setIncludeTradeContext] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Clear the ?prompt= URL param after reading it so back-navigation works cleanly
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("prompt")) {
      window.history.replaceState({}, "", "/pit-advisor");
    }
  }, []);

  const chatMutation = trpc.pitAdvisor.chat.useMutation({
    onSuccess: (data) => {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.content,
        timestamp: new Date(),
      }]);
    },
    onError: (e) => {
      toast.error(`Pit Advisor error: ${e.message}`);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Sorry, I hit an error: ${e.message}. Please try again.`,
        timestamp: new Date(),
      }]);
    },
  });

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = (content: string) => {
    if (!content.trim()) return;
    const userMsg: ChatMessage = { role: "user", content: content.trim(), timestamp: new Date() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");

    // Build history for API (exclude system welcome message if it's the first)
    const history = newMessages
      .filter(m => !(m.role === "assistant" && m.content.startsWith("# Welcome to Pit Advisor")))
      .map(m => ({ role: m.role, content: m.content }));

    chatMutation.mutate({ messages: history, includeTradeContext });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleExternalResult = (content: string, prefix?: string) => {
    const label = prefix ? `**${prefix} Research Result:**\n\n` : "";
    setMessages(prev => [...prev, {
      role: "assistant",
      content: label + content,
      timestamp: new Date(),
    }]);
  };

  const clearChat = () => {
    setMessages([{
      role: "assistant",
      content: "Chat cleared. What would you like to research?",
      timestamp: new Date(),
    }]);
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* ─── Main Chat Area ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-background shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="font-semibold text-sm text-foreground">Pit Advisor</div>
              <div className="text-[10px] text-muted-foreground">AI Trading Research Assistant · 5-Dimension Analysis</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch
                id="trade-context"
                checked={includeTradeContext}
                onCheckedChange={setIncludeTradeContext}
                className="scale-75"
              />
              <label htmlFor="trade-context" className="cursor-pointer select-none">
                Include My Trades
              </label>
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={clearChat}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Clear
            </Button>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 px-5 py-4" ref={scrollRef as any}>
          <div className="space-y-4 max-w-4xl mx-auto pb-4">
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}
            {chatMutation.isPending && (
              <div className="flex gap-3">
                <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <div className="bg-white border border-border shadow-sm rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-green-500" />
                    <span>Analyzing…</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Suggested Prompts */}
        <div className="px-5 py-2 border-t border-border bg-muted/30 shrink-0">
          <div className="flex gap-2 overflow-x-auto pb-1 max-w-4xl mx-auto">
            {SUGGESTED_PROMPTS.map((p, i) => (
              <button
                key={i}
                onClick={() => sendMessage(p.prompt)}
                disabled={chatMutation.isPending}
                className="shrink-0 flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-full border border-border bg-background hover:bg-accent hover:border-green-400 transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {p.icon}
                {p.label}
                {p.requiresTrades && <span className="text-blue-400">*</span>}
              </button>
            ))}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1 max-w-4xl mx-auto">
            * Requires uploaded trades. Enable "Include My Trades" for personalized analysis.
          </div>
        </div>

        {/* Input */}
        <div className="px-5 py-3 border-t border-border bg-background shrink-0">
          <div className="flex gap-3 max-w-4xl mx-auto">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about any ticker, strategy, or your trade history… (Enter to send, Shift+Enter for new line)"
              className="flex-1 min-h-[44px] max-h-32 resize-none text-sm"
              disabled={chatMutation.isPending}
            />
            <Button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || chatMutation.isPending}
              className="bg-green-500 hover:bg-green-600 text-white self-end h-11 px-4"
            >
              {chatMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Right Sidebar ─── */}
      <div className="w-72 border-l border-border bg-muted/20 flex flex-col overflow-y-auto shrink-0">
        <div className="px-3 py-3 border-b border-border">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            Research Tools
          </div>
        </div>

        <div className="p-3 space-y-3">
          {/* Quick Research */}
          <QuickResearchPanel onResult={(content, ticker) => handleExternalResult(content, ticker)} />

          {/* Trade Analysis */}
          <TradeAnalysisPanel onResult={(content) => handleExternalResult(content)} />

          {/* Dimension Guide */}
          <Card className="shadow-none">
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                <Brain className="h-3.5 w-3.5 text-purple-500" />
                5-Dimension Framework
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 space-y-1.5">
              {[
                { label: "Technical", color: "text-blue-600", desc: "Price structure, levels, momentum" },
                { label: "Fundamental", color: "text-green-600", desc: "Earnings, growth, sector health" },
                { label: "Geopolitical", color: "text-orange-600", desc: "Macro, policy, global events" },
                { label: "Sentiment", color: "text-purple-600", desc: "PCR, COT, options flow" },
                { label: "Quant/Math", color: "text-red-600", desc: "R:R, sizing, probability" },
              ].map((d) => (
                <div key={d.label} className="flex items-start gap-2">
                  <ChevronRight className={`h-3 w-3 mt-0.5 shrink-0 ${d.color}`} />
                  <div>
                    <span className={`text-[11px] font-semibold ${d.color}`}>{d.label}</span>
                    <span className="text-[10px] text-muted-foreground ml-1">{d.desc}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Tips */}
          <Card className="shadow-none bg-green-50 border-green-200">
            <CardContent className="px-3 py-3 space-y-1.5">
              <div className="text-[11px] font-semibold text-green-700 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Pro Tips
              </div>
              {[
                "Ask about specific tickers for live price data",
                "Enable 'Include My Trades' for personalized coaching",
                "Use Quick Research for fast ticker analysis",
                "Ask about R:R and position sizing for any setup",
              ].map((tip, i) => (
                <div key={i} className="text-[10px] text-green-700 flex items-start gap-1.5">
                  <span className="text-green-500 font-bold shrink-0">·</span>
                  {tip}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
