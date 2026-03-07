import type { ScanSummaryClient } from "@/lib/scan-types";

interface ScanSummaryCardsProps {
  summary: ScanSummaryClient | null;
  loading: boolean;
  error: string | null;
}

export function ScanSummaryCards({
  summary,
  loading,
  error,
}: ScanSummaryCardsProps) {
  if (loading && !summary) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex animate-pulse flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900 p-5"
          >
            <div className="h-4 w-24 rounded bg-slate-800" />
            <div className="h-8 w-20 rounded bg-slate-800" />
            <div className="h-3 w-32 rounded bg-slate-800" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {/* Avg Funding Rate */}
      <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-400">
            Avg Funding Rate
          </p>
          <span className="material-symbols-outlined text-lg text-primary">
            trending_up
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold text-white">
            {summary?.avgFundingRatePercent
              ? `${summary.avgFundingRatePercent}%`
              : "—"}
          </p>
        </div>
        <p className="text-xs italic text-slate-500">
          Aggregated across scanned assets
        </p>
      </div>

      {/* Top APR Asset */}
      <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-400">Top APR Asset</p>
          <span className="material-symbols-outlined text-lg text-amber-400">
            star
          </span>
        </div>
        <p className="text-2xl font-bold text-white">
          {summary?.topAprAsset ? (
            <>
              {summary.topAprAsset}{" "}
              <span className="text-lg text-primary">
                ({summary.topAprPercent}%)
              </span>
            </>
          ) : (
            "—"
          )}
        </p>
        <p className="text-xs italic text-slate-500">
          {summary?.topAprAsset ? "Highest OKX earn rate" : "No APR data available"}
        </p>
      </div>

      {/* Total Opportunities */}
      <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-400">
            Total Opportunities
          </p>
          <span className="material-symbols-outlined text-lg text-slate-400">
            grid_view
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold text-white">
            {summary?.totalOpportunities ?? 0}
          </p>
        </div>
        <p className="text-xs italic text-slate-500">
          Filtered by your constraints
        </p>
      </div>
    </div>
  );
}
