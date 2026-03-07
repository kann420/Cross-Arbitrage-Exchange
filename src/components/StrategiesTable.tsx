"use client";

import { useRouter } from "next/navigation";
import type { StrategyRow } from "@/lib/api-types";

interface StrategiesTableProps {
  strategies: StrategyRow[];
}

function formatUsd(value: string | null): string {
  if (!value) return "—";
  const num = parseFloat(value);
  const prefix = num >= 0 ? "+" : "-";
  return `${prefix}$${Math.abs(num).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function StrategiesTable({ strategies }: StrategiesTableProps) {
  const router = useRouter();

  return (
    <div className="glass-card p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Active Strategies Overview</h2>
        <button
          type="button"
          className="text-sm font-medium text-primary transition-colors hover:text-primary-bright"
          onClick={() => router.push("/")}
        >
          View All
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.06] text-left text-xs uppercase tracking-[0.12em] text-slate-400">
              <th className="pb-4 font-medium">Strategy Name</th>
              <th className="pb-4 font-medium">Total Size</th>
              <th className="pb-4 font-medium">Net PnL</th>
              <th className="pb-4 font-medium">Net APY</th>
              <th className="pb-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {strategies.map((strategy) => {
              const pnlPositive = parseFloat(strategy.netPnl ?? "0") >= 0;
              const apyPositive = parseFloat(strategy.netApy ?? "0") >= 0;

              return (
                <tr
                  key={strategy.strategyGroupId}
                  className="cursor-pointer border-b border-white/[0.04] text-sm transition-colors hover:bg-white/[0.03]"
                  onClick={() =>
                    router.push(`/?strategy=${encodeURIComponent(strategy.strategyGroupId)}`)
                  }
                >
                  <td className="py-5">
                    <div className="flex items-center gap-4">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-white/80">
                        <span className="text-sm font-semibold">
                          {strategy.canonicalAsset.slice(0, 1)}
                        </span>
                      </div>
                      <div>
                        <div className="font-semibold text-white">
                          {strategy.canonicalAsset}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-5 font-medium text-white">
                    {strategy.totalSize
                      ? `$${parseFloat(strategy.totalSize).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}`
                      : "—"}
                  </td>
                  <td
                    className={`py-5 font-semibold ${
                      pnlPositive ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {formatUsd(strategy.netPnl)}
                  </td>
                  <td
                    className={`py-5 font-semibold ${
                      apyPositive ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {strategy.netApy ? `${strategy.netApy}%` : "—"}
                  </td>
                  <td className="py-5">
                    <span className="rounded-md bg-emerald-500/12 px-2 py-1 text-xs font-semibold text-emerald-400">
                      {strategy.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
