// ─── Shared API response types (client-safe, no server imports) ──

export interface PositionsApiResponse {
  strategyGroups: StrategyGroupClient[];
  pnlBreakdowns: PnlBreakdownClient[];
  dashboardMetrics: DashboardMetricClient[];
  unmatchedHoldings: HoldingClient[];
  unmatchedPositions: PositionClient[];
  errors: string[];
  fetchedAt: number;
  lastRefreshedAt: number;
}

export interface DashboardApiResponse {
  stats: {
    totalNetValue: string;
    totalPnl: string;
    averageNetApy: string | null;
    totalActiveHedges: number;
  };
  allocation: AllocationSlice[];
  strategies: StrategyRow[];
  errors: string[];
  fetchedAt: number;
  lastRefreshedAt: number;
}

export interface HealthApiResponse {
  status: "healthy" | "degraded";
  exchanges: {
    okx: { ok: boolean; exchange: string; message?: string };
    binance: { ok: boolean; exchange: string; message?: string };
  };
  ts: number;
}

// ─── Client-side sub-types ───────────────────────────────

export interface HoldingClient {
  exchange: string;
  instrumentType: string;
  canonicalAsset: string;
  baseAsset: string;
  quoteAsset: string | null;
  symbolNative: string | null;
  quantity: string;
  entryPrice?: string;
  markPrice?: string;
  usdValue?: string;
  apr?: string;
  productName?: string;
  ts: number;
  openedAtMs?: number | null;
  principalQuantity?: string;
  rewardQuantity?: string;
  rewardQuoteValue?: string;
  feeQuoteValue?: string;
  realizedPnlQuoteValue?: string;
  avgEntrySource?: string;
  markPriceSource?: string;
  tradeQuoteAsset?: string | null;
  warnings?: string[];
}

export interface PositionClient {
  exchange: string;
  instrumentType: string;
  canonicalAsset: string;
  baseAsset: string;
  quoteAsset: string;
  symbolNative: string;
  side: "long" | "short" | "flat";
  quantity: string;
  quantityAbs: string;
  entryPrice?: string;
  markPrice?: string;
  liquidationPrice?: string;
  leverage?: string;
  notional?: string;
  marginMode?: string;
  unrealizedPnl?: string;
  realizedPnl?: string;
  fundingRate?: string;
  fundingIntervalHours?: number | null;
  nextFundingTime?: number | null;
  ts: number;
  openedAtMs?: number | null;
  quoteToUsdRate?: string;
  reportingQuoteAsset?: string;
  warnings?: string[];
}

export interface StrategyGroupClient {
  strategyGroupId: string;
  strategyType: string;
  status: string;
  canonicalAsset: string;
  primaryVenueLong: string | null;
  primaryVenueShort: string | null;
  longLegs: HoldingClient[];
  shortLegs: PositionClient[];
  longBaseQty: string;
  shortBaseQtyAbs: string;
  hedgeRatio: string | null;
  netBaseExposure: string | null;
  crossQuote: boolean;
  quoteMismatchSummary: string | null;
  matchingConfidence: string;
  matchingReasons: string[];
  warnings: string[];
  openedAtMs: number | null;
  lastActivityAtMs: number | null;
}

export interface DashboardMetricClient {
  strategyGroupId: string;
  canonicalAsset: string;
  status: string;
  totalPositionSize: string | null;
  longBaseQty: string;
  shortBaseQtyAbs: string;
  hedgeRatio: string | null;
  netBaseExposure: string | null;
  longAvgEntry: string | null;
  longMarkPrice: string | null;
  shortAvgEntry: string | null;
  shortMarkPrice: string | null;
  shortLiquidationPrice: string | null;
  shortLeverage: string | null;
  shortMarginMode: string | null;
  currentFundingRate: string | null;
  fundingIntervalHours: number | null;
  nextFundingTime: number | null;
  netPnl: string | null;
  netPnlPercent: string | null;
  longUnrealizedPnl: string | null;
  shortUnrealizedPnl: string | null;
  shortRealizedPnl: string | null;
  totalRewards: string | null;
  totalFunding: string | null;
  totalFees: string | null;
  netApy: string | null;
  crossQuote: boolean;
  warnings: string[];
  livePrice: string | null;
  okxAvgEntry: string | null;
  okxEarnedRewardsBase: string | null;
  okxEarnedRewardsQuote: string | null;
  okxLongPnl: string | null;
  okxFees: string | null;
  binanceFees: string | null;
  fundingPnl: string | null;
  fees: string | null;
  reportingQuoteAsset: string;
  lastRefreshedAt: number;
}

export interface PnlBreakdownClient {
  strategyGroupId: string;
  canonicalAsset: string;
  asOfMs: number;
  crossQuote: boolean;
  warnings: string[];
  summary: {
    okxAvgEntry: string | null;
    okxMarkPrice: string | null;
    okxEarnedRewardsBase: string | null;
    okxEarnedRewardsQuote: string | null;
    okxLongPnl: string | null;
    okxLongRealizedPnl: string | null;
    binanceShortAvgEntry: string | null;
    binanceShortMarkPrice: string | null;
    binanceShortPnl: string | null;
    binanceShortRealizedPnl: string | null;
    currentFundingRate: string | null;
    fundingIntervalHours: number | null;
    nextFundingTime: number | null;
    okxFees: string | null;
    binanceFees: string | null;
    fundingPnl: string | null;
    fees: string | null;
    netPnl: string | null;
    longCurrentValue: string | null;
    shortCurrentValue: string | null;
    lastRefreshedAt: number;
  };
}

export interface AllocationSlice {
  label: string;
  value: string;
  percent: number;
  color: string;
}

export interface StrategyRow {
  strategyGroupId: string;
  canonicalAsset: string;
  status: string;
  totalSize: string | null;
  netPnl: string | null;
  netPnlPercent: string | null;
  netApy: string | null;
  hedgeRatio: string | null;
  crossQuote: boolean;
  warnings: string[];
}
