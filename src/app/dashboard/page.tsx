"use client";

import { Header } from "@/components/Header";
import { StatCard } from "@/components/StatCard";
import { PnlChart } from "@/components/PnlChart";
import { PortfolioAllocation } from "@/components/PortfolioAllocation";
import { MarketInsights } from "@/components/MarketInsights";
import { ActiveAlerts, type AlertItem } from "@/components/ActiveAlerts";
import { StrategiesTable } from "@/components/StrategiesTable";
import { useApi } from "@/lib/use-api";
import type { DashboardApiResponse } from "@/lib/api-types";

function formatUsd(value: string | null): string {
  if (!value) return "$0.00";
  const num = parseFloat(value);
  return num.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

export default function DashboardPage() {
  const { data, error, loading } = useApi<DashboardApiResponse>("/api/dashboard");

  const alerts: AlertItem[] = [];
  if (error) {
    alerts.push({
      icon: "error",
      iconColor: "text-red-500",
      title: "API Error",
      description: error,
    });
  }
  if (data?.errors && data.errors.length > 0) {
    for (const err of data.errors) {
      alerts.push({
        icon: "warning",
        iconColor: "text-orange-500",
        title: "Exchange Warning",
        description: err,
      });
    }
  }

  const stats = data?.stats;
  const pnlPositive = parseFloat(stats?.totalPnl ?? "0") >= 0;

  return (
    <div className="relative flex min-h-screen w-full flex-col">
      <Header />

      <div className="flex flex-1 justify-center py-6 px-4 lg:px-10">
        <div className="flex flex-col lg:flex-row max-w-[1400px] w-full gap-6">
          {/* Main content */}
          <div className="flex flex-col flex-1 gap-6">
            {loading && (
              <div className="flex items-center justify-center py-20">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-slate-400 text-sm">Loading dashboard...</p>
                </div>
              </div>
            )}

            {!loading && stats && (
              <>
                {/* Stats row */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard
                    label="Total Net Value"
                    value={formatUsd(stats.totalNetValue)}
                    large
                  />
                  <StatCard
                    label="Total PnL"
                    value={`${pnlPositive ? "+" : ""}${formatUsd(stats.totalPnl)}`}
                    color={pnlPositive ? "green" : "red"}
                    large
                  />
                  <StatCard
                    label="Average Net APY"
                    value={stats.averageNetApy ? `${stats.averageNetApy}%` : "—"}
                    large
                  />
                  <StatCard
                    label="Total Active Hedges"
                    value={stats.totalActiveHedges.toString()}
                    large
                  />
                </div>

                {/* Charts row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <PnlChart />
                  <PortfolioAllocation
                    allocation={data.allocation}
                    totalValue={stats.totalNetValue}
                  />
                </div>

                {/* Strategies table */}
                <StrategiesTable strategies={data.strategies} />
              </>
            )}

            {!loading && !stats && (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <span className="material-symbols-outlined text-4xl mb-3">cloud_off</span>
                <p className="text-lg font-medium">Unable to load dashboard data</p>
                <p className="text-sm mt-1">Check your API keys and exchange connectivity.</p>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="flex flex-col w-full lg:w-80 gap-6">
            <MarketInsights />
            <ActiveAlerts alerts={alerts.length > 0 ? alerts : undefined} />
          </div>
        </div>
      </div>
    </div>
  );
}
