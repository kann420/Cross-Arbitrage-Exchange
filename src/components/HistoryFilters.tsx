"use client";

const tabs = ["All History", "Position Closures", "Funding/Fees"] as const;

interface HistoryFiltersProps {
  activeTab: (typeof tabs)[number];
  onTabChange: (tab: (typeof tabs)[number]) => void;
  search: string;
  onSearchChange: (value: string) => void;
  selectedAsset: string;
  onAssetChange: (value: string) => void;
  selectedExchange: string;
  onExchangeChange: (value: string) => void;
  selectedRange: string;
  onRangeChange: (value: string) => void;
  assetOptions: string[];
}

export function HistoryFilters({
  activeTab,
  onTabChange,
  search,
  onSearchChange,
  selectedAsset,
  onAssetChange,
  selectedExchange,
  onExchangeChange,
  selectedRange,
  onRangeChange,
  assetOptions,
}: HistoryFiltersProps) {
  return (
    <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-sm sm:flex-row sm:items-center">
      <div className="flex gap-1">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            className={`rounded px-4 py-2 text-sm font-medium transition ${
              activeTab === tab
                ? "border-b-2 border-primary text-primary"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm">
          <span className="material-symbols-outlined text-[18px] text-slate-400">
            search
          </span>
          <input
            type="text"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search strategy..."
            className="w-32 bg-transparent text-slate-200 outline-none placeholder:text-slate-500"
          />
        </div>
        <select
          value={selectedAsset}
          onChange={(event) => onAssetChange(event.target.value)}
          className="cursor-pointer appearance-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none"
        >
          <option value="All Assets">All Assets</option>
          {assetOptions.map((asset) => (
            <option key={asset} value={asset}>
              {asset}
            </option>
          ))}
        </select>
        <select
          value={selectedExchange}
          onChange={(event) => onExchangeChange(event.target.value)}
          className="cursor-pointer appearance-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none"
        >
          <option>All Exchanges</option>
          <option>OKX</option>
          <option>Binance</option>
        </select>
        <select
          value={selectedRange}
          onChange={(event) => onRangeChange(event.target.value)}
          className="cursor-pointer appearance-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none"
        >
          <option>Last 30 Days</option>
          <option>Last 7 Days</option>
          <option>Last 90 Days</option>
          <option>All Time</option>
        </select>
      </div>
    </div>
  );
}
