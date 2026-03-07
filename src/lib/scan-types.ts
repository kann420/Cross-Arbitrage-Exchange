// ─── Client-safe scan API response types ──────────────────

export interface ScanOpportunityClient {
  asset: string;
  displayName: string;
  okxAprPercent: string | null;
  okxAprSource: "savings" | "estimated" | null;
  okxProductName: string | null;
  okxSpotPrice: string | null;
  binanceFundingRatePercent: string | null;
  binanceFundingIntervalHours: number | null;
  binanceMarkPrice: string | null;
  totalSpreadPercent: string | null;
  estimatedProfit1h: string | null;
  estimatedProfit1d: string | null;
  estimatedProfit30d: string | null;
  roi1hPercent: string | null;
  crossQuote: boolean;
  longQuote: string | null;
  shortQuote: string;
  warnings: string[];
  canInvest: boolean;
  rankScore: number;
  dataFreshness: "live" | "stale" | "partial";
  sourceCompleteness: "full" | "partial" | "minimal";
}

export interface ScanSummaryClient {
  avgFundingRatePercent: string | null;
  topAprAsset: string | null;
  topAprPercent: string | null;
  totalOpportunities: number;
}

export interface ScanApiResponse {
  opportunities: ScanOpportunityClient[];
  summary: ScanSummaryClient;
  referencePositionUsd: number;
  errors: string[];
  fetchedAt: number;
  exchangeStatus: {
    okx: "online" | "degraded" | "offline";
    binance: "online" | "degraded" | "offline";
  };
}
