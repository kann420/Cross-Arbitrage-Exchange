"use client";

import { useState } from "react";

const timeframes = ["1W", "1M", "ALL"] as const;

export function PnlChart() {
  const [active, setActive] = useState<string>("1M");

  return (
    <div className="flex flex-col rounded-xl bg-slate-900 border border-slate-800 shadow-sm overflow-hidden p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-lg">Combined PnL History</h3>
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
          viewBox="0 0 200 100"
        >
          {/* PnL area fill */}
          <path
            d="M0,90 Q15,88 30,85 Q50,80 70,78 Q90,75 110,72 Q130,65 150,55 Q170,42 185,35 Q195,30 200,25 L200,100 L0,100 Z"
            fill="url(#pnlGradient)"
          />
          {/* PnL line */}
          <path
            d="M0,90 Q15,88 30,85 Q50,80 70,78 Q90,75 110,72 Q130,65 150,55 Q170,42 185,35 Q195,30 200,25"
            fill="none"
            stroke="#22c55e"
            strokeWidth="1.5"
          />
          <defs>
            <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0.02" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}
