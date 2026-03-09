"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { HedgeOverview } from "@/components/HedgeOverview";
import { LegCard } from "@/components/LegCard";
import { SpreadChart } from "@/components/SpreadChart";
import { HedgeControls } from "@/components/HedgeControls";
import { ActiveAlerts, type AlertItem } from "@/components/ActiveAlerts";
import { useApi } from "@/lib/use-api";
import type { PositionsApiResponse } from "@/lib/api-types";

function formatUsdAmount(value: string | null | undefined): string {
  if (!value) return "—";
  const num = parseFloat(value);
  return `$${num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function signedUsd(value: string | null | undefined): string {
  if (!value) return "—";
  const num = parseFloat(value);
  const prefix = num >= 0 ? "+" : "-";
  return `${prefix}$${Math.abs(num).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPrice(value: string | null | undefined): string {
  if (!value) return "—";
  const num = parseFloat(value);
  return num.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: Math.abs(num) >= 1 ? 4 : 6,
  });
}

function formatBaseAmount(
  value: string | null | undefined,
  asset: string | null | undefined
): string | null {
  if (!value || !asset) return null;
  const num = parseFloat(value);
  return `${num.toLocaleString("en-US", {
    minimumFractionDigits: num >= 100 ? 2 : 4,
    maximumFractionDigits: 8,
  })} ${asset}`;
}

function formatApr(value: string | null | undefined): string {
  if (!value) return "—";
  return `${(parseFloat(value) * 100).toFixed(2)}%`;
}

function formatFundingRate(
  rate: string | null | undefined,
  intervalHours: number | null | undefined
): string {
  if (!rate) return "—";
  const num = parseFloat(rate) * 100;
  const intervalLabel = intervalHours ? ` / fd ${intervalHours}h` : "";
  return `${num >= 0 ? "+" : ""}${num.toFixed(4)}%${intervalLabel}`;
}

function PositionsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, error, loading, refreshing, refetch } =
    useApi<PositionsApiResponse>("/api/positions", 30_000);

  const selectedStrategyId = searchParams.get("strategy");
  const strategyGroups = data?.strategyGroups ?? [];
  const group =
    strategyGroups.find((item) => item.strategyGroupId === selectedStrategyId) ??
    strategyGroups[0] ??
    null;
  const metrics =
    data?.dashboardMetrics.find((item) => item.strategyGroupId === group?.strategyGroupId) ??
    null;
  const rewardBaseLabel = formatBaseAmount(
    metrics?.okxEarnedRewardsBase,
    group?.canonicalAsset
  );
  const latestOkxApr = group?.longLegs[0]?.apr ?? null;

  function selectStrategy(strategyGroupId: string): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set("strategy", strategyGroupId);
    router.replace(`/?${params.toString()}`, { scroll: false });
  }

  const alerts: AlertItem[] = [];
  if (error) {
    alerts.push({
      icon: "error",
      iconColor: "text-red-500",
      title: "API Error",
      description: error,
    });
  }

  for (const err of data?.errors ?? []) {
    alerts.push({
      icon: "warning",
      iconColor: "text-orange-500",
      title: "Exchange Warning",
      description: err,
    });
  }

  for (const warning of metrics?.warnings ?? []) {
    alerts.push({
      icon: "info",
      iconColor: "text-yellow-400",
      title: "Strategy Warning",
      description: warning,
    });
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col">
      <Header />

      <div className="flex flex-1 justify-center px-4 py-6 lg:px-10">
        <div className="flex w-full max-w-[1400px] flex-col gap-6 lg:flex-row">
          <div className="flex flex-1 flex-col gap-6">
            {loading && (
              <div className="flex items-center justify-center py-20">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <p className="text-sm text-slate-400">Loading live data...</p>
                </div>
              </div>
            )}

            {!loading && group && metrics && (
              <>
                {strategyGroups.length > 1 && (
                  <div className="glass-card p-4">
                    <div className="flex flex-wrap gap-3">
                      {strategyGroups.map((strategy) => {
                        const active = strategy.strategyGroupId === group.strategyGroupId;
                        return (
                          <button
                            key={strategy.strategyGroupId}
                            type="button"
                            onClick={() => selectStrategy(strategy.strategyGroupId)}
                            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                              active
                                ? "border-primary bg-primary/15 text-primary"
                                : "border-white/[0.08] bg-white/[0.02] text-slate-300 hover:border-primary/40 hover:text-white"
                            }`}
                          >
                            {strategy.canonicalAsset}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="lg:hidden">
                  <HedgeControls
                    onRefresh={() => refetch(true)}
                    refreshing={refreshing}
                    lastRefreshedAt={metrics.lastRefreshedAt ?? data?.lastRefreshedAt ?? null}
                    compact
                  />
                </div>

                <HedgeOverview group={group} metrics={metrics} />

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <LegCard
                    label={`${group.primaryVenueLong?.toUpperCase() ?? "OKX"} Spot / Earn Leg`}
                    type="Long Spot"
                    typeBadgeColor="blue"
                    icon="account_balance"
                    iconColor="text-primary"
                    primaryLabel="Asset Balance"
                    primaryValue={`${group.longBaseQty} ${group.canonicalAsset}`}
                    details={[
                      {
                        label: "Avg Entry",
                        value: formatPrice(metrics.okxAvgEntry ?? metrics.longAvgEntry),
                      },
                      {
                        label: "Mark Price",
                        value: formatPrice(metrics.longMarkPrice),
                        highlight: true,
                      },
                      {
                        label: "Notional Value",
                        value: formatUsdAmount(
                          metrics.totalPositionSize
                            ? (parseFloat(metrics.totalPositionSize) / 2).toFixed(2)
                            : null
                        ),
                      },
                    ]}
                    stats={[
                      {
                        label: "Earned Rewards",
                        value: metrics.okxEarnedRewardsQuote
                          ? `${signedUsd(metrics.okxEarnedRewardsQuote)}${rewardBaseLabel ? ` (${rewardBaseLabel})` : ""}`
                          : "—",
                        color:
                          parseFloat(metrics.okxEarnedRewardsQuote ?? "0") >= 0
                            ? ("green" as const)
                            : ("red" as const),
                      },
                      {
                        label: "Long PnL",
                        value: metrics.okxLongPnl ? signedUsd(metrics.okxLongPnl) : "—",
                        color:
                          parseFloat(metrics.okxLongPnl ?? "0") >= 0
                            ? ("green" as const)
                            : ("red" as const),
                      },
                      {
                        label: "Sold",
                        value: metrics.okxLongRealizedPnl
                          ? signedUsd(metrics.okxLongRealizedPnl)
                          : "â€”",
                        color:
                          parseFloat(metrics.okxLongRealizedPnl ?? "0") >= 0
                            ? ("green" as const)
                            : ("red" as const),
                      },
                      {
                        label: "Fees",
                        value: metrics.okxFees ? signedUsd(metrics.okxFees) : "—",
                        color:
                          parseFloat(metrics.okxFees ?? "0") >= 0
                            ? ("green" as const)
                            : ("red" as const),
                      },
                      {
                        label: "APR",
                        value: formatApr(latestOkxApr),
                        color:
                          parseFloat(latestOkxApr ?? "0") >= 0
                            ? ("green" as const)
                            : ("red" as const),
                      },
                    ]}
                  />

                  <LegCard
                    label={`${group.primaryVenueShort?.toUpperCase() ?? "Binance"} Short Hedge Leg`}
                    type="Short Perp"
                    typeBadgeColor="red"
                    icon="trending_down"
                    iconColor="text-red-500"
                    primaryLabel="Position Size"
                    primaryValue={`-${group.shortBaseQtyAbs} ${group.canonicalAsset}`}
                    details={[
                      {
                        label: "Avg Entry",
                        value: formatPrice(metrics.shortAvgEntry),
                      },
                      {
                        label: "Mark Price",
                        value: formatPrice(metrics.shortMarkPrice),
                        highlight: true,
                      },
                      {
                        label: "Current Funding",
                        value: formatFundingRate(
                          metrics.currentFundingRate,
                          metrics.fundingIntervalHours
                        ),
                      },
                    ]}
                    stats={[
                      {
                        label: "Funding PnL",
                        value: metrics.fundingPnl ? signedUsd(metrics.fundingPnl) : "—",
                        color:
                          parseFloat(metrics.fundingPnl ?? "0") >= 0
                            ? ("green" as const)
                            : ("red" as const),
                      },
                      {
                        label: "Fees",
                        value: metrics.binanceFees ? signedUsd(metrics.binanceFees) : "—",
                        color:
                          parseFloat(metrics.binanceFees ?? "0") >= 0
                            ? ("green" as const)
                            : ("red" as const),
                      },
                      {
                        label: "Liq Price",
                        value: formatPrice(metrics.shortLiquidationPrice),
                        color: "red" as const,
                      },
                      {
                        label: "Short PnL",
                        value: metrics.shortUnrealizedPnl
                          ? signedUsd(metrics.shortUnrealizedPnl)
                          : "—",
                        color:
                          parseFloat(metrics.shortUnrealizedPnl ?? "0") >= 0
                            ? ("green" as const)
                            : ("red" as const),
                      },
                    ]}
                  />
                </div>

                <SpreadChart />
              </>
            )}

            {!loading && !group && (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <span className="material-symbols-outlined mb-3 text-4xl">
                  search_off
                </span>
                <p className="text-lg font-medium">No matched hedge strategies found</p>
                <p className="mt-1 text-sm">
                  Make sure you have open positions on both OKX and Binance.
                </p>
              </div>
            )}
          </div>

          <div className="flex w-full flex-col gap-6 lg:w-80">
            <div className="hidden lg:block">
              <HedgeControls
                onRefresh={() => refetch(true)}
                refreshing={refreshing}
                lastRefreshedAt={metrics?.lastRefreshedAt ?? data?.lastRefreshedAt ?? null}
              />
            </div>
            <ActiveAlerts alerts={alerts.length > 0 ? alerts : undefined} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PositionsPage() {
  return (
    <Suspense fallback={null}>
      <PositionsContent />
    </Suspense>
  );
}
