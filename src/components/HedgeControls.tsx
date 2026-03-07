interface HedgeControlsProps {
  onRefresh?: () => void;
  refreshing?: boolean;
  lastRefreshedAt?: number | null;
  compact?: boolean;
}

function formatLastRefreshed(ts: number | null | undefined): string {
  if (!ts) return "Waiting for first refresh";
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function HedgeControls({
  onRefresh,
  refreshing = false,
  lastRefreshedAt,
  compact = false,
}: HedgeControlsProps) {
  return (
    <div className="flex flex-col rounded-xl bg-slate-900 border border-slate-800 shadow-sm overflow-hidden">
      {!compact && (
        <div className="p-4 border-b border-slate-800 bg-card-dark">
          <h3 className="font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">settings</span>
            Hedge Controls
          </h3>
        </div>
      )}
      <div className={`flex flex-col gap-3 ${compact ? "p-4" : "p-5"}`}>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 px-4 bg-primary/10 text-primary font-bold hover:bg-primary/20 transition-colors border border-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span
            className={`material-symbols-outlined text-[20px] ${refreshing ? "animate-spin" : ""}`}
          >
            sync
          </span>
          {refreshing ? "Refreshing..." : "Refresh Live Data"}
        </button>
        <p className="text-xs text-slate-400">
          Last refreshed: {formatLastRefreshed(lastRefreshedAt)}
        </p>
        {!compact && (
          <>
            <div className="h-px w-full bg-slate-800 my-1" />
            <button className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 px-4 bg-primary/10 text-primary font-bold hover:bg-primary/20 transition-colors border border-primary/20">
              <span className="material-symbols-outlined text-[20px]">sync</span>
              Rebalance Delta
            </button>
            <button className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 px-4 bg-slate-800 text-slate-200 font-bold hover:bg-slate-700 transition-colors border border-slate-700">
              <span className="material-symbols-outlined text-[20px]">
                add_circle
              </span>
              Add Margin
            </button>
            <div className="h-px w-full bg-slate-800 my-2" />
            <button className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 px-4 bg-red-900/20 text-red-400 font-bold hover:bg-red-900/40 transition-colors border border-red-900/50">
              <span className="material-symbols-outlined text-[20px]">close</span>
              Close Strategy
            </button>
          </>
        )}
      </div>
    </div>
  );
}
