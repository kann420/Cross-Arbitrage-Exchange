"use client";

import { useState } from "react";

const tabs = ["All History", "Position Closures", "Funding/Fees"] as const;

export function HistoryFilters() {
  const [activeTab, setActiveTab] = useState<string>("All History");

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
      {/* Tabs */}
      <div className="flex gap-1">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded transition ${
              activeTab === tab
                ? "text-primary border-b-2 border-primary"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm">
          <span className="material-symbols-outlined text-slate-400 text-[18px]">
            search
          </span>
          <input
            type="text"
            placeholder="Search strategy..."
            className="bg-transparent outline-none text-slate-200 placeholder:text-slate-500 w-32"
          />
        </div>
        <select className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 outline-none appearance-none cursor-pointer">
          <option>All Assets</option>
          <option>BTC</option>
          <option>ETH</option>
          <option>SOL</option>
        </select>
        <select className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 outline-none appearance-none cursor-pointer">
          <option>All Exchanges</option>
          <option>Binance</option>
          <option>OKX</option>
          <option>Kraken</option>
        </select>
        <select className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 outline-none appearance-none cursor-pointer">
          <option>Last 30 Days</option>
          <option>Last 7 Days</option>
          <option>Last 90 Days</option>
          <option>All Time</option>
        </select>
      </div>
    </div>
  );
}
