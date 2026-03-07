import { StatCard } from "./StatCard";
import type { DashboardMetricClient, StrategyGroupClient } from "@/lib/api-types";

function formatUsd(value: string | null): string {
  if (!value) return "—";
  const num = parseFloat(value);
  return num.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function signedUsd(value: string | null): string {
  if (!value) return "—";
  const num = parseFloat(value);
  const prefix = num >= 0 ? "+" : "";
  return `${prefix}${formatUsd(value)}`;
}

function formatTimestamp(value: number | null): string {
  if (!value) return "Waiting for first refresh";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export interface HedgeOverviewProps {
  group: StrategyGroupClient;
  metrics: DashboardMetricClient;
}

export function HedgeOverview({ group, metrics }: HedgeOverviewProps) {
  const pair = `${group.canonicalAsset}/USDT`;
  const strategy = `${group.primaryVenueShort?.toUpperCase() ?? "?"} Short + ${group.primaryVenueLong?.toUpperCase() ?? "?"} Spot/Earn`;
  const statusColor =
    group.status === "open"
      ? "bg-green-900/30 text-green-400"
      : "bg-yellow-900/30 text-yellow-400";
  const pnlPositive = parseFloat(metrics.netPnl ?? "0") >= 0;

  return (
    <div className="flex flex-col gap-4 p-6 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
      <div className="flex w-full flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
        <div className="flex items-center gap-4">
          <div className="flex -space-x-3">
            <div className="w-12 h-12 rounded-full bg-slate-800 border-2 border-slate-900 flex items-center justify-center">
              <span className="text-xl font-bold">{group.canonicalAsset.charAt(0)}</span>
            </div>
            <div className="w-12 h-12 rounded-full bg-green-900/30 border-2 border-slate-900 flex items-center justify-center text-green-400">
              <span className="text-xl font-bold">$</span>
            </div>
          </div>
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold leading-tight flex items-center gap-2">
              {pair} Hedge
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusColor}`}>
                {group.status}
              </span>
            </h1>
            <p className="text-slate-400 text-sm">{strategy}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="mt-1 text-xs text-slate-500">
            Refreshed {formatTimestamp(metrics.lastRefreshedAt)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-2">
        <StatCard label="Total Position Size" value={formatUsd(metrics.totalPositionSize)} />
        <StatCard
          label="Net PnL"
          value={signedUsd(metrics.netPnl)}
          sub={
            metrics.netPnlPercent
              ? `${parseFloat(metrics.netPnlPercent) >= 0 ? "+" : ""}${metrics.netPnlPercent}%`
              : undefined
          }
          color={pnlPositive ? "green" : "red"}
        />
        <StatCard label="Net APY" value={metrics.netApy ? `${metrics.netApy}%` : "—"} />
        <StatCard
          label="Delta Exposure"
          value={
            metrics.netBaseExposure ? `${metrics.netBaseExposure} ${group.canonicalAsset}` : "—"
          }
          color={parseFloat(metrics.netBaseExposure ?? "0") !== 0 ? "red" : undefined}
        />
      </div>
    </div>
  );
}
