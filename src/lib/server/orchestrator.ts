import "server-only";
import { OkxAdapter } from "./exchanges/okx/adapter";
import { BinanceAdapter } from "./exchanges/binance/adapter";
import { matchHedgePositions, type HedgeStrategyGroup } from "./matching";
import {
  computePnl,
  buildDashboardMetrics,
  type HedgePnlBreakdown,
  type HedgeDashboardMetrics,
} from "./pnl-engine";
import {
  fetchReportingQuoteContext,
  type ReportingQuoteContext,
} from "./market-data";
import type {
  NormalizedBalance,
  NormalizedHolding,
  NormalizedPosition,
  NormalizedEvent,
} from "./exchanges/types";

export interface OrchestratorResult {
  balances: NormalizedBalance[];
  holdings: NormalizedHolding[];
  positions: NormalizedPosition[];
  events: NormalizedEvent[];
  strategyGroups: HedgeStrategyGroup[];
  pnlBreakdowns: HedgePnlBreakdown[];
  dashboardMetrics: HedgeDashboardMetrics[];
  unmatchedHoldings: NormalizedHolding[];
  unmatchedPositions: NormalizedPosition[];
  errors: string[];
  fetchedAt: number;
  rawSources: {
    okx: Record<string, unknown>;
    binance: Record<string, unknown>;
    reportingContext: ReportingQuoteContext | null;
  };
}

// Price-level cache only. Account and rewards are cached inside adapters/services.
let _cache: OrchestratorResult | null = null;
let _cacheTs = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds

export async function fetchAndComputeAll(
  forceRefresh = false
): Promise<OrchestratorResult> {
  if (!forceRefresh && _cache && Date.now() - _cacheTs < CACHE_TTL_MS) {
    return _cache;
  }

  const okx = new OkxAdapter(forceRefresh);
  const binance = new BinanceAdapter(forceRefresh);
  const errors: string[] = [];
  const now = Date.now();

  // Fetch all data in parallel
  const [
    okxBalances,
    okxHoldings,
    okxPositions,
    okxEvents,
    binanceBalances,
    binancePositions,
    binanceEvents,
  ] = await Promise.all([
    okx.getBalances().catch((e: Error) => {
      errors.push(`OKX balances: ${e.message}`);
      return [] as NormalizedBalance[];
    }),
    okx.getHoldings().catch((e: Error) => {
      errors.push(`OKX holdings: ${e.message}`);
      return [] as NormalizedHolding[];
    }),
    okx.getPositions().catch((e: Error) => {
      errors.push(`OKX positions: ${e.message}`);
      return [] as NormalizedPosition[];
    }),
    okx.getRecentEvents({ limit: 50 }).catch((e: Error) => {
      errors.push(`OKX events: ${e.message}`);
      return [] as NormalizedEvent[];
    }),
    binance.getBalances().catch((e: Error) => {
      errors.push(`Binance balances: ${e.message}`);
      return [] as NormalizedBalance[];
    }),
    binance.getPositions().catch((e: Error) => {
      errors.push(`Binance positions: ${e.message}`);
      return [] as NormalizedPosition[];
    }),
    binance.getRecentEvents({ limit: 100 }).catch((e: Error) => {
      errors.push(`Binance events: ${e.message}`);
      return [] as NormalizedEvent[];
    }),
  ]);

  const allBalances = [...okxBalances, ...binanceBalances];
  const allHoldings = [...okxHoldings];
  const allPositions = [...okxPositions, ...binancePositions];
  const allEvents = [...okxEvents, ...binanceEvents];
  const reportingContext = await fetchReportingQuoteContext(forceRefresh).catch(
    (e: Error) => {
      errors.push(`Reporting FX context: ${e.message}`);
      return null;
    }
  );

  // Match positions into strategy groups
  const { groups, unmatchedHoldings, unmatchedPositions } =
    matchHedgePositions(allHoldings, allPositions);

  // Compute PnL for each group
  const pnlBreakdowns: HedgePnlBreakdown[] = [];
  const dashboardMetrics: HedgeDashboardMetrics[] = [];

  for (const group of groups) {
    const pnl = computePnl(
      group,
      allEvents,
      reportingContext ?? {
        reportingQuoteAsset: "USD",
        quoteToUsdRates: { USD: "1" },
        warnings: ["Reporting FX context unavailable."],
        fetchedAt: now,
      }
    );
    pnlBreakdowns.push(pnl);
    dashboardMetrics.push(buildDashboardMetrics(group, pnl));
  }

  if (errors.length > 0) {
    console.warn("[Orchestrator] Partial errors:", errors);
  }

  console.log(
    `[Orchestrator] Fetched: ${allBalances.length} balances, ${allHoldings.length} holdings, ${allPositions.length} positions, ${allEvents.length} events, ${groups.length} strategy groups`
  );

  const result: OrchestratorResult = {
    balances: allBalances,
    holdings: allHoldings,
    positions: allPositions,
    events: allEvents,
    strategyGroups: groups,
    pnlBreakdowns,
    dashboardMetrics,
    unmatchedHoldings,
    unmatchedPositions,
    errors,
    fetchedAt: now,
    rawSources: {
      okx: okx.latestRawPayloads,
      binance: binance.latestRawPayloads,
      reportingContext,
    },
  };

  _cache = result;
  _cacheTs = now;
  return result;
}
