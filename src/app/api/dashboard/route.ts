import { NextRequest, NextResponse } from "next/server";
import { fetchAndComputeAll } from "@/lib/server/orchestrator";
import Decimal from "decimal.js";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const forceRefresh =
      request.nextUrl.searchParams.get("refresh") === "true";
    const result = await fetchAndComputeAll(forceRefresh);

    // Aggregate dashboard-level stats from all strategy groups
    let totalNetValue = new Decimal(0);
    let totalPnl = new Decimal(0);
    let apySum = new Decimal(0);
    let apyCount = 0;

    for (const m of result.dashboardMetrics) {
      if (m.totalPositionSize) {
        totalNetValue = totalNetValue.plus(new Decimal(m.totalPositionSize).div(2));
      }
      if (m.netPnl) {
        totalPnl = totalPnl.plus(new Decimal(m.netPnl));
      }
      if (m.netApy) {
        apySum = apySum.plus(new Decimal(m.netApy));
        apyCount++;
      }
    }

    const avgApy = apyCount > 0 ? apySum.div(apyCount).toFixed(1) : null;

    // Build portfolio allocation from strategy groups
    const allocationMap = new Map<string, Decimal>();
    for (const m of result.dashboardMetrics) {
      if (m.totalPositionSize) {
        const current = allocationMap.get(m.canonicalAsset) ?? new Decimal(0);
        allocationMap.set(
          m.canonicalAsset,
          current.plus(new Decimal(m.totalPositionSize).div(2))
        );
      }
    }

    const allocationColors: Record<string, string> = {
      BTC: "#f97316",
      ETH: "#3b82f6",
      SOL: "#a855f7",
      KITE: "#22c55e",
    };
    const defaultColors = ["#3713ec", "#ec4899", "#14b8a6", "#eab308", "#6b7280"];
    let colorIdx = 0;

    const allocation = [...allocationMap.entries()].map(([asset, value]) => ({
      label: asset,
      value: value.toFixed(2),
      percent: totalNetValue.isZero()
        ? 0
        : value.div(totalNetValue).mul(100).toNumber(),
      color:
        allocationColors[asset] ??
        defaultColors[colorIdx++ % defaultColors.length],
    }));

    // Build strategies list for table
    const strategies = result.dashboardMetrics.map((m) => ({
      strategyGroupId: m.strategyGroupId,
      canonicalAsset: m.canonicalAsset,
      status: m.status,
      totalSize: m.totalPositionSize,
      netPnl: m.netPnl,
      netPnlPercent: m.netPnlPercent,
      netApy: m.netApy,
      hedgeRatio: m.hedgeRatio,
      crossQuote: m.crossQuote,
      warnings: m.warnings,
    }));

    return NextResponse.json({
      stats: {
        totalNetValue: totalNetValue.toFixed(2),
        totalPnl: totalPnl.toFixed(2),
        averageNetApy: avgApy,
        totalActiveHedges: result.strategyGroups.length,
      },
      allocation,
      strategies,
      errors: result.errors,
      fetchedAt: result.fetchedAt,
      lastRefreshedAt: result.fetchedAt,
    });
  } catch (e) {
    console.error("[API /dashboard]", e);
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
