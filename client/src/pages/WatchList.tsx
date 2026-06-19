import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Trash2, TrendingUp, StickyNote, Check, X } from "lucide-react";

export default function WatchList() {
  const [, navigate] = useLocation();
  const [newTicker, setNewTicker] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNotes, setEditNotes] = useState("");

  const utils = trpc.useUtils();
  const { data: items, isLoading } = trpc.watchlist.list.useQuery();

  const addMutation = trpc.watchlist.add.useMutation({
    onSuccess: () => {
      utils.watchlist.list.invalidate();
      setNewTicker("");
      setNewNotes("");
      toast.success("Ticker added to watch list");
    },
    onError: (e) => toast.error(e.message),
  });

  const removeMutation = trpc.watchlist.remove.useMutation({
    onSuccess: () => {
      utils.watchlist.list.invalidate();
      toast.success("Removed from watch list");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateNotesMutation = trpc.watchlist.updateNotes.useMutation({
    onSuccess: () => {
      utils.watchlist.list.invalidate();
      setEditingId(null);
      toast.success("Notes updated");
    },
    onError: (e) => toast.error(e.message),
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const ticker = newTicker.trim().toUpperCase();
    if (!ticker) return;
    addMutation.mutate({ ticker, notes: newNotes.trim() || undefined });
  }

  function handleAnalyze(ticker: string) {
    navigate(`/analyzer?ticker=${encodeURIComponent(ticker)}`);
  }

  function startEdit(id: number, notes: string) {
    setEditingId(id);
    setEditNotes(notes ?? "");
  }

  function saveNotes(id: number) {
    updateNotesMutation.mutate({ id, notes: editNotes });
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Watch List</h1>
        <p className="text-slate-500 mt-1 text-sm">
          Save tickers you want to monitor and launch analysis with one click.
        </p>
      </div>

      {/* Add form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-800">Add a ticker</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="e.g. SPY"
                value={newTicker}
                onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
                className="w-32 font-mono uppercase"
                maxLength={10}
              />
              <Input
                placeholder="Optional notes (e.g. IV rank high, watch for earnings)"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                className="flex-1"
                maxLength={512}
              />
              <Button type="submit" disabled={!newTicker.trim() || addMutation.isPending}>
                <Plus className="w-4 h-4 mr-1" />
                Add
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* List */}
      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))
        ) : !items || items.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No tickers yet. Add one above to get started.</p>
          </div>
        ) : (
          items.map((item) => (
            <Card key={item.id} className="border border-slate-200 hover:border-slate-300 transition-colors">
              <CardContent className="py-4 px-5">
                <div className="flex items-start gap-3">
                  {/* Ticker badge */}
                  <Badge className="mt-0.5 font-mono text-sm px-3 py-1 bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
                    {item.ticker}
                  </Badge>

                  {/* Notes area */}
                  <div className="flex-1 min-w-0">
                    {editingId === item.id ? (
                      <div className="flex gap-2 items-start">
                        <Textarea
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          className="text-sm resize-none h-16"
                          maxLength={512}
                          autoFocus
                        />
                        <div className="flex flex-col gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-green-600 hover:text-green-700"
                            onClick={() => saveNotes(item.id)}
                            disabled={updateNotesMutation.isPending}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-slate-400 hover:text-slate-600"
                            onClick={() => setEditingId(null)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="text-sm text-slate-500 cursor-pointer hover:text-slate-700 min-h-[1.5rem] flex items-center gap-1 group"
                        onClick={() => startEdit(item.id, item.notes ?? "")}
                        title="Click to edit notes"
                      >
                        {item.notes ? (
                          <span>{item.notes}</span>
                        ) : (
                          <span className="italic text-slate-300 group-hover:text-slate-400">
                            Click to add notes…
                          </span>
                        )}
                        <StickyNote className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity ml-1" />
                      </div>
                    )}
                    <p className="text-xs text-slate-300 mt-1">
                      Added {new Date(item.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 shrink-0">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            onClick={() => handleAnalyze(item.ticker)}
                            className="gap-1"
                          >
                            <TrendingUp className="w-3.5 h-3.5" />
                            Analyze
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Run analysis for {item.ticker}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-slate-400 hover:text-red-500"
                            onClick={() => removeMutation.mutate({ id: item.id })}
                            disabled={removeMutation.isPending}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Remove from watch list</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
