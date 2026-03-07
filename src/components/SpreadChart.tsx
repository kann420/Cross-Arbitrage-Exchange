"use client";

import { useState } from "react";

const timeframes = ["1D", "1W", "1M"] as const;

export function SpreadChart() {
  const [active, setActive] = useState<string>("1W");

  return (
    <div className="flex flex-col rounded-xl bg-slate-900 border border-slate-800 shadow-sm overflow-hidden p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-lg">Spread History (Binance vs OKX)</h3>
        <div className="flex gap-2">
          {timeframes.map((tf) => (
            <button
              key={tf}
              onClick={() => setActive(tf)}
              className={`px-3 py-1 text-xs font-medium rounded transition ${
                active === tf
                  ? "bg-primary text-white"
                  : "bg-slate-800 hover:bg-slate-700"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full h-64 bg-slate-800/50 rounded-lg border border-slate-700 flex flex-col justify-end p-4 relative overflow-hidden">
        <svg
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          <path
            className="text-primary opacity-50"
            d="M0,80 Q20,70 40,75 T80,60 T100,50"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            className="text-green-500 opacity-50"
            d="M0,85 Q20,75 40,80 T80,65 T100,55"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
        <div className="absolute inset-0 bg-gradient-to-t from-primary/10 to-transparent opacity-20" />
      </div>
    </div>
  );
}
