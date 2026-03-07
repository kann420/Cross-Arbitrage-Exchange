// ─── Canonical enums ──────────────────────────────────────
export type Exchange = "okx" | "binance";

export type InstrumentType =
  | "spot"
  | "perp"
  | "earn_position"
  | "future"
  | "unknown";

export type PositionSide = "long" | "short" | "flat";

export type AccountScope =
  | "spot"
  | "funding"
  | "earn"
  | "unified"
  | "futures"
  | "unknown";

export type HedgeDirectionHint =
  | "long_exposure"
  | "short_exposure"
  | "yield_exposure"
  | "neutral"
  | "unknown";

// ─── Normalized schemas ───────────────────────────────────

export interface NormalizedBalance {
  exchange: Exchange;
  accountScope: AccountScope;
  asset: string;
  available: string;
  locked: string;
  total: string;
  usdValue?: string;
  ts: number;
}

export interface NormalizedHolding {
  exchange: Exchange;
  instrumentType: "spot" | "earn_position";
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
  accountScope: AccountScope;
  ts: number;
  openedAtMs?: number | null;
  principalQuantity?: string;
  rewardQuantity?: string;
  rewardQuoteValue?: string;
  feeQuoteValue?: string;
  realizedPnlQuoteValue?: string;
  avgEntrySource?: "fills_weighted_average" | "account_balance_accAvgPx" | "unavailable";
  markPriceSource?: string;
  tradeQuoteAsset?: string | null;
  warnings?: string[];
}

export interface NormalizedPosition {
  exchange: Exchange;
  instrumentType: "perp";
  canonicalAsset: string;
  baseAsset: string;
  quoteAsset: string;
  symbolNative: string;
  side: PositionSide;
  quantity: string; // signed: negative = short
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

export interface NormalizedEvent {
  exchange: Exchange;
  eventType: "funding_fee" | "staking_reward" | "earn_reward" | "fee" | "trade_fill" | "unknown";
  canonicalAsset?: string;
  baseAsset?: string;
  quoteAsset?: string;
  symbolNative?: string;
  amount: string; // signed decimal string
  feeAsset?: string;
  feeAmount?: string;
  ts: number;
  metadata?: Record<string, unknown>;
}

// ─── Adapter interface ────────────────────────────────────

export interface ExchangeAdapter {
  getBalances(): Promise<NormalizedBalance[]>;
  getHoldings(): Promise<NormalizedHolding[]>;
  getPositions(): Promise<NormalizedPosition[]>;
  getRecentEvents(params?: {
    sinceTs?: number;
    limit?: number;
  }): Promise<NormalizedEvent[]>;
  healthcheck(): Promise<{
    ok: boolean;
    exchange: Exchange;
    message?: string;
  }>;
}
