"use client";

interface ScanFiltersProps {
  minApr: string;
  onMinAprChange: (val: string) => void;
  assetSearch: string;
  onAssetSearchChange: (val: string) => void;
  onScan: () => void;
  scanning: boolean;
}

export function ScanFilters({
  minApr,
  onMinAprChange,
  assetSearch,
  onAssetSearchChange,
  onScan,
  scanning,
}: ScanFiltersProps) {
  return (
    <div className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-sm">
      <div className="flex min-w-[180px] flex-1 flex-col">
        <p className="pb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
          Min Stake APR %
        </p>
        <div className="relative">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-xl text-slate-500">
            percent
          </span>
          <input
            type="number"
            step="0.1"
            value={minApr}
            onChange={(e) => onMinAprChange(e.target.value)}
            placeholder="5.0"
            className="h-12 w-full rounded-lg border border-slate-800 bg-bg-dark pl-12 pr-4 text-sm font-medium text-slate-100 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div className="flex min-w-[240px] flex-[2] flex-col">
        <p className="pb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
          Asset Search
        </p>
        <div className="relative">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-xl text-slate-500">
            search
          </span>
          <input
            type="text"
            value={assetSearch}
            onChange={(e) => onAssetSearchChange(e.target.value)}
            placeholder="Search BTC, ETH, SOL..."
            className="h-12 w-full rounded-lg border border-slate-800 bg-bg-dark pl-12 pr-4 text-sm font-medium text-slate-100 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onScan}
        disabled={scanning}
        className="flex h-12 items-center justify-center rounded-lg bg-primary px-8 text-sm font-bold tracking-wide text-white shadow-[0_0_20px_rgba(55,19,236,0.3)] transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span
          className={`material-symbols-outlined mr-2 ${scanning ? "animate-spin" : ""}`}
        >
          {scanning ? "sync" : "radar"}
        </span>
        {scanning ? "SCANNING..." : "SCAN MARKET"}
      </button>
    </div>
  );
}
