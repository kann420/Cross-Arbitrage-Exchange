"use client";

import { useState } from "react";
import type { ScanOpportunityClient } from "@/lib/scan-types";
import type { SortField, SortDir } from "@/app/scan/page";

interface ScanTableProps {
  opportunities: ScanOpportunityClient[];
  loading: boolean;
  error: string | null;
  positionScale: number;
  sortField: SortField | null;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
}

const ASSET_ICONS: Record<string, { icon: string; color: string; bg: string }> = {
  BTC: { icon: "currency_bitcoin", color: "text-orange-500", bg: "bg-orange-500/20" },
  ETH: { icon: "diamond", color: "text-blue-500", bg: "bg-blue-500/20" },
  SOL: { icon: "wb_sunny", color: "text-purple-500", bg: "bg-purple-500/20" },
  LINK: { icon: "link", color: "text-blue-600", bg: "bg-blue-600/20" },
  DOGE: { icon: "pets", color: "text-yellow-500", bg: "bg-yellow-500/20" },
  XRP: { icon: "water_drop", color: "text-slate-300", bg: "bg-slate-500/20" },
  ADA: { icon: "hexagon", color: "text-blue-400", bg: "bg-blue-400/20" },
  AVAX: { icon: "ac_unit", color: "text-red-500", bg: "bg-red-500/20" },
  DOT: { icon: "blur_circular", color: "text-pink-500", bg: "bg-pink-500/20" },
  NEAR: { icon: "near_me", color: "text-cyan-400", bg: "bg-cyan-400/20" },
  ARB: { icon: "token", color: "text-blue-400", bg: "bg-blue-400/20" },
  OP: { icon: "circle", color: "text-red-500", bg: "bg-red-500/20" },
  SUI: { icon: "water", color: "text-cyan-300", bg: "bg-cyan-300/20" },
  APT: { icon: "hexagon", color: "text-teal-400", bg: "bg-teal-400/20" },
  INJ: { icon: "bolt", color: "text-blue-500", bg: "bg-blue-500/20" },
  PEPE: { icon: "potted_plant", color: "text-emerald-500", bg: "bg-emerald-500/20" },
  WIF: { icon: "pets", color: "text-amber-400", bg: "bg-amber-400/20" },
  BONK: { icon: "pets", color: "text-orange-400", bg: "bg-orange-400/20" },
  SHIB: { icon: "pets", color: "text-orange-500", bg: "bg-orange-500/20" },
  KITE: { icon: "paragliding", color: "text-green-400", bg: "bg-green-400/20" },
};

const DEFAULT_ICON = {
  icon: "token",
  color: "text-slate-400",
  bg: "bg-slate-500/20",
};

function formatUsd(value: string | null, scale: number): string {
  if (!value) return "\u2014";
  const num = parseFloat(value) * scale;
  if (num === 0) return "$0.00";
  const prefix = num >= 0 ? "+" : "-";
  return `${prefix}$${Math.abs(num).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPrice(value: string | null): string {
  if (!value) return "\u2014";
  const num = parseFloat(value);
  if (num === 0) return "$0";
  if (num >= 1000) return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (num >= 1) return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  if (num >= 0.01) return `$${num.toFixed(4)}`;
  return `$${num.toFixed(6)}`;
}

function fundingIntervalLabel(hours: number | null): string {
  if (!hours) return "8h";
  if (hours === 1) return "1h";
  if (hours === 4) return "4h";
  if (hours === 8) return "8h";
  return `${hours}h`;
}

function SortButton({
  field,
  activeField,
  dir,
  onSort,
}: {
  field: SortField;
  activeField: SortField | null;
  dir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const isActive = activeField === field;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className="ml-1 inline-flex items-center opacity-60 hover:opacity-100 transition-opacity"
      title={`Sort by ${field}`}
    >
      <span
        className={`material-symbols-outlined text-[14px] ${
          isActive ? "text-primary" : "text-slate-500"
        }`}
      >
        {isActive && dir === "asc" ? "arrow_upward" : "arrow_downward"}
      </span>
    </button>
  );
}

function FundingTooltip({ hours }: { hours: number | null }) {
  const [show, setShow] = useState(false);
  const label = fundingIntervalLabel(hours);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span className="material-symbols-outlined ml-1 cursor-help text-[12px] text-slate-500 hover:text-slate-300 transition-colors">
        info
      </span>
      {show && (
        <span className="absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-slate-700 px-2 py-1 text-[10px] font-medium text-slate-200 shadow-lg">
          Funding interval: {label}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-700" />
        </span>
      )}
    </span>
  );
}

export function ScanTable({
  opportunities,
  loading,
  error,
  positionScale,
  sortField,
  sortDir,
  onSort,
}: ScanTableProps) {
  if (loading && opportunities.length === 0) {
    return (
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-slate-400">Scanning markets...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error && opportunities.length === 0) {
    return (
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <span className="material-symbols-outlined text-3xl text-red-500">
              error
            </span>
            <p className="text-sm text-slate-400">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (opportunities.length === 0) {
    return (
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <span className="material-symbols-outlined text-3xl text-slate-500">
              search_off
            </span>
            <p className="text-sm text-slate-400">
              No matching opportunities found. Try lowering the min APR filter.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-slate-800 bg-bg-dark/30">
            <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-400">
              Asset
            </th>
            <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-400">
              <span className="inline-flex items-center">
                OKX APR %
                <SortButton field="okxApr" activeField={sortField} dir={sortDir} onSort={onSort} />
              </span>
            </th>
            <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-400">
              OKX Price
            </th>
            <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-400">
              <span className="inline-flex items-center">
                Binance Funding
                <SortButton field="binanceFunding" activeField={sortField} dir={sortDir} onSort={onSort} />
              </span>
            </th>
            <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-400">
              Binance Price
            </th>
            <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-400">
              <span className="inline-flex items-center">
                Est. Profit (1H)
                <SortButton field="estProfit1h" activeField={sortField} dir={sortDir} onSort={onSort} />
              </span>
            </th>
            <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-400">
              <span className="inline-flex items-center">
                Est. Profit (1D)
                <SortButton field="estProfit1d" activeField={sortField} dir={sortDir} onSort={onSort} />
              </span>
            </th>
            <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-400">
              <span className="inline-flex items-center">
                Est. Profit (30D)
                <SortButton field="estProfit30d" activeField={sortField} dir={sortDir} onSort={onSort} />
              </span>
            </th>
            <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-slate-400">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50">
          {opportunities.map((opp) => {
            const iconData = ASSET_ICONS[opp.asset] ?? DEFAULT_ICON;
            const fundingNum = opp.binanceFundingRatePercent
              ? parseFloat(opp.binanceFundingRatePercent)
              : 0;
            const fundingColor =
              fundingNum >= 0 ? "text-emerald-400" : "text-rose-400";

            return (
              <tr
                key={opp.asset}
                className="transition-colors hover:bg-primary/5"
              >
                {/* Asset */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full ${iconData.bg}`}
                    >
                      <span
                        className={`material-symbols-outlined text-sm ${iconData.color}`}
                      >
                        {iconData.icon}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">
                        {opp.asset}
                        {opp.crossQuote && (
                          <span
                            className="ml-1 text-[10px] text-yellow-400"
                            title="Cross-quote hedge"
                          >
                            (xq)
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] font-medium uppercase text-slate-500">
                        {opp.displayName}
                      </p>
                    </div>
                  </div>
                </td>

                {/* OKX APR */}
                <td className="px-4 py-3 text-right">
                  <p className="text-sm font-semibold text-slate-100">
                    {opp.okxAprPercent ? `${opp.okxAprPercent}%` : "\u2014"}
                  </p>
                </td>

                {/* OKX Price */}
                <td className="px-4 py-3 text-right">
                  <p className="text-sm font-medium text-slate-300">
                    {formatPrice(opp.okxSpotPrice)}
                  </p>
                </td>

                {/* Binance Funding */}
                <td className="px-4 py-3 text-right">
                  <span className="inline-flex items-center">
                    <span className={`text-sm font-semibold ${fundingColor}`}>
                      {opp.binanceFundingRatePercent
                        ? `${opp.binanceFundingRatePercent}%`
                        : "\u2014"}
                    </span>
                    <FundingTooltip hours={opp.binanceFundingIntervalHours} />
                  </span>
                </td>

                {/* Binance Price */}
                <td className="px-4 py-3 text-right">
                  <p className="text-sm font-medium text-slate-300">
                    {formatPrice(opp.binanceMarkPrice)}
                  </p>
                </td>

                {/* Est. Profit 1H */}
                <td className="px-4 py-3 text-right">
                  <div>
                    <p
                      className={`text-sm font-bold ${
                        opp.estimatedProfit1h &&
                        parseFloat(opp.estimatedProfit1h) * positionScale >= 0
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }`}
                    >
                      {formatUsd(opp.estimatedProfit1h, positionScale)}
                    </p>
                    {opp.roi1hPercent && (
                      <p className="text-[10px] italic text-slate-500">
                        ROI: {opp.roi1hPercent}%
                      </p>
                    )}
                  </div>
                </td>

                {/* Est. Profit 1D */}
                <td className="px-4 py-3 text-right">
                  <p
                    className={`text-sm font-bold ${
                      opp.estimatedProfit1d &&
                      parseFloat(opp.estimatedProfit1d) * positionScale >= 0
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }`}
                  >
                    {formatUsd(opp.estimatedProfit1d, positionScale)}
                  </p>
                </td>

                {/* Est. Profit 30D */}
                <td className="px-4 py-3 text-right">
                  <p
                    className={`text-sm font-bold ${
                      opp.estimatedProfit30d &&
                      parseFloat(opp.estimatedProfit30d) * positionScale >= 0
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }`}
                  >
                    {formatUsd(opp.estimatedProfit30d, positionScale)}
                  </p>
                </td>

                {/* Action */}
                <td className="px-4 py-3 text-center">
                  {opp.canInvest ? (
                    <button
                      type="button"
                      className="rounded bg-primary px-3 py-1 text-[10px] font-bold uppercase text-white transition-colors hover:bg-primary/80"
                    >
                      Invest
                    </button>
                  ) : (
                    <span className="text-[10px] font-medium text-slate-500">
                      N/A
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
