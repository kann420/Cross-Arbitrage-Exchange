import { NextRequest, NextResponse } from "next/server";
import { fetchAndComputeAll } from "@/lib/server/orchestrator";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const forceRefresh =
      request.nextUrl.searchParams.get("refresh") === "true";
    const result = await fetchAndComputeAll(forceRefresh);

    return NextResponse.json({
      strategyGroups: result.strategyGroups,
      pnlBreakdowns: result.pnlBreakdowns,
      dashboardMetrics: result.dashboardMetrics,
      unmatchedHoldings: result.unmatchedHoldings,
      unmatchedPositions: result.unmatchedPositions,
      errors: result.errors,
      fetchedAt: result.fetchedAt,
      lastRefreshedAt: result.fetchedAt,
    });
  } catch (e) {
    console.error("[API /positions]", e);
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
