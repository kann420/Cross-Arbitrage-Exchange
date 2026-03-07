import "server-only";
import Decimal from "decimal.js";
import {
  fetchOkxSpotInstruments,
  fetchBinanceMarkPrice,
  fetchBinanceFundingIntervalHours,
  type BinancePublicMarkPrice,
} from "./market-data";
import { okxRequest } from "./exchanges/okx/client";

// ─── Types ─────────────────────────────────────────────────

export interface ScanOpportunity {
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

export interface ScanResult {
  opportunities: ScanOpportunity[];
  summary: {
    avgFundingRatePercent: string | null;
    topAprAsset: string | null;
    topAprPercent: string | null;
    totalOpportunities: number;
  };
  referencePositionUsd: number;
  errors: string[];
  fetchedAt: number;
  exchangeStatus: {
    okx: "online" | "degraded" | "offline";
    binance: "online" | "degraded" | "offline";
  };
}

// ─── OKX earn product types ───────────────────────────────

interface OkxSavingsBalance {
  ccy: string;
  amt: string;
  earnings: string;
  lendingAmt?: string;
  rate?: string;
  productId?: string;
}

interface OkxLendingProduct {
  ccy: string;
  rate: string;
  term?: string;
  earlyRedeem?: boolean;
}

// ─── Binance exchange info types ──────────────────────────

interface BinanceExchangeInfoSymbol {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  contractType?: string;
  underlyingType?: string;
}

interface BinanceExchangeInfo {
  symbols: BinanceExchangeInfoSymbol[];
}

interface BinancePremiumIndex {
  symbol: string;
  markPrice: string;
  lastFundingRate: string;
  nextFundingTime: number;
  time: number;
}

// ─── Known asset display names ────────────────────────────

const ASSET_NAMES: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  SOL: "Solana",
  LINK: "Chainlink",
  DOGE: "Dogecoin",
  XRP: "Ripple",
  ADA: "Cardano",
  AVAX: "Avalanche",
  DOT: "Polkadot",
  MATIC: "Polygon",
  NEAR: "Near Protocol",
  ARB: "Arbitrum",
  OP: "Optimism",
  SUI: "Sui",
  SEI: "Sei",
  APT: "Aptos",
  INJ: "Injective",
  TIA: "Celestia",
  PEPE: "Pepe Coin",
  WIF: "dogwifhat",
  KITE: "Kite",
  FIL: "Filecoin",
  ATOM: "Cosmos",
  UNI: "Uniswap",
  LTC: "Litecoin",
  BCH: "Bitcoin Cash",
  AAVE: "Aave",
  MKR: "Maker",
  CRV: "Curve",
  RENDER: "Render",
  FET: "Fetch.ai",
  BONK: "Bonk",
  SHIB: "Shiba Inu",
  FLOKI: "Floki",
};

const STABLE_ASSETS = new Set([
  "USDT", "USDC", "USDG", "FDUSD", "DAI", "BUSD", "TUSD", "UST", "PYUSD",
]);

const REFERENCE_POSITION_USD = 100;

// ─── Scanner Implementation ───────────────────────────────

export async function runScan(): Promise<ScanResult> {
  const errors: string[] = [];
  let okxStatus: "online" | "degraded" | "offline" = "offline";
  let binanceStatus: "online" | "degraded" | "offline" = "offline";

  // 1) Fetch OKX savings/earn rates (public lending endpoint)
  let okxEarnProducts = new Map<string, { rate: string; productName: string | null }>();
  try {
    const savingsData = await fetchOkxEarnRates();
    okxEarnProducts = savingsData;
    okxStatus = "online";
  } catch (e) {
    errors.push(`OKX earn fetch failed: ${(e as Error).message}`);
    okxStatus = "degraded";
  }

  // 2) Fetch Binance perpetual markets + funding rates (public)
  let binancePerps = new Map<
    string,
    {
      symbol: string;
      baseAsset: string;
      quoteAsset: string;
      fundingRate: string | null;
      markPrice: string | null;
      intervalHours: number | null;
    }
  >();
  try {
    binancePerps = await fetchBinancePerpData();
    binanceStatus = "online";
  } catch (e) {
    errors.push(`Binance perp fetch failed: ${(e as Error).message}`);
    binanceStatus = "degraded";
  }

  // 3) Fetch OKX spot prices (public, bulk)
  let okxSpotPrices = new Map<string, string>();
  try {
    okxSpotPrices = await fetchOkxSpotPrices();
  } catch (e) {
    errors.push(`OKX spot prices failed: ${(e as Error).message}`);
  }

  // 4) Fetch Binance funding interval info (public, bulk)
  let binanceFundingIntervals = new Map<string, number>();
  try {
    binanceFundingIntervals = await fetchBinanceFundingIntervals();
  } catch (e) {
    errors.push(`Binance funding intervals failed: ${(e as Error).message}`);
  }

  console.log(`[Scanner] OKX earn: ${okxEarnProducts.size}, Binance perps: ${binancePerps.size}, OKX spot prices: ${okxSpotPrices.size}, Funding intervals: ${binanceFundingIntervals.size}`);

  // 5) Match: find base assets that exist on both sides
  const opportunities: ScanOpportunity[] = [];

  // Build a set of base assets available on Binance perps
  const binanceBaseAssets = new Map<string, typeof binancePerps extends Map<string, infer V> ? V : never>();
  for (const [, perp] of binancePerps) {
    // Index by base asset - prefer USDT pairs
    const existing = binanceBaseAssets.get(perp.baseAsset);
    if (!existing || perp.quoteAsset === "USDT") {
      binanceBaseAssets.set(perp.baseAsset, perp);
    }
  }

  // For each OKX earn product, check if Binance has a matching perp
  for (const [asset, okxData] of okxEarnProducts) {
    if (STABLE_ASSETS.has(asset)) continue;

    const binanceData = binanceBaseAssets.get(asset);
    if (!binanceData) continue;

    const warnings: string[] = [];
    const okxAprDecimal = okxData.rate ? new Decimal(okxData.rate) : null;
    const okxAprPercent = okxAprDecimal
      ? okxAprDecimal.mul(100).toFixed(2)
      : null;

    // OKX spot price for this asset (try USDT pair)
    const okxSpotPrice = okxSpotPrices.get(asset) ?? null;

    // Enrich Binance funding interval
    const enrichedInterval = binanceFundingIntervals.get(binanceData.symbol) ?? null;

    const fundingRateDecimal = binanceData.fundingRate
      ? new Decimal(binanceData.fundingRate)
      : null;
    const fundingRatePercent = fundingRateDecimal
      ? fundingRateDecimal.mul(100).toFixed(4)
      : null;

    // Determine cross-quote status
    // OKX earn is typically quoted in the asset itself (no pair), but if there's a spot market
    // it would be USDT or USDG. Binance perp is USDT.
    const shortQuote = binanceData.quoteAsset;
    const longQuote: string | null = null; // earn positions are in native token
    const crossQuote = false; // earn positions don't have a quote mismatch concern

    // Total spread = APR contribution per period + funding rate per period
    let totalSpreadPercent: string | null = null;
    let estProfit1h: string | null = null;
    let estProfit1d: string | null = null;
    let estProfit30d: string | null = null;
    let roi1hPercent: string | null = null;

    const intervalHours = enrichedInterval ?? binanceData.intervalHours ?? 8;

    if (okxAprDecimal && fundingRateDecimal) {
      // APR is annual, convert to per-hour rate
      const aprPerHour = okxAprDecimal.div(365 * 24);
      // Funding rate per hour (from per-interval)
      const fundingPerHour = fundingRateDecimal.div(intervalHours);
      // Total hourly carry = earn APR/hr + funding income/hr (funding is income when short)
      const totalPerHour = aprPerHour.plus(fundingPerHour);
      const totalPerDay = totalPerHour.mul(24);
      const totalPer30d = totalPerDay.mul(30);

      totalSpreadPercent = totalPerDay.mul(100).toFixed(3);

      // Profit estimates on $10k position
      const posDecimal = new Decimal(REFERENCE_POSITION_USD);
      estProfit1h = totalPerHour.mul(posDecimal).toFixed(2);
      estProfit1d = totalPerDay.mul(posDecimal).toFixed(2);
      estProfit30d = totalPer30d.mul(posDecimal).toFixed(2);
      roi1hPercent = totalPerHour.mul(100).toFixed(4);
    } else if (okxAprDecimal) {
      // Only OKX APR available
      warnings.push("Binance funding rate unavailable; estimate uses APR only");
      const aprPerHour = okxAprDecimal.div(365 * 24);
      const aprPerDay = okxAprDecimal.div(365);
      const aprPer30d = aprPerDay.mul(30);
      totalSpreadPercent = aprPerDay.mul(100).toFixed(3);
      const posDecimal = new Decimal(REFERENCE_POSITION_USD);
      estProfit1h = aprPerHour.mul(posDecimal).toFixed(2);
      estProfit1d = aprPerDay.mul(posDecimal).toFixed(2);
      estProfit30d = aprPer30d.mul(posDecimal).toFixed(2);
      roi1hPercent = aprPerHour.mul(100).toFixed(4);
    } else if (fundingRateDecimal) {
      warnings.push("OKX APR unavailable; estimate uses funding rate only");
      const fundingPerHour = fundingRateDecimal.div(intervalHours);
      const fundingPerDay = fundingPerHour.mul(24);
      totalSpreadPercent = fundingPerDay.mul(100).toFixed(3);
      const posDecimal = new Decimal(REFERENCE_POSITION_USD);
      estProfit1h = fundingPerHour.mul(posDecimal).toFixed(2);
      estProfit1d = fundingPerDay.mul(posDecimal).toFixed(2);
      estProfit30d = fundingPerDay.mul(30).mul(posDecimal).toFixed(2);
      roi1hPercent = fundingPerHour.mul(100).toFixed(4);
    } else {
      warnings.push("Both APR and funding rate unavailable");
    }

    if (!okxAprDecimal) {
      warnings.push("OKX earn APR not available for this asset");
    }

    // Rank score: higher is better. Use 30d estimated profit as primary rank.
    const rankScore = estProfit30d ? parseFloat(estProfit30d) : 0;

    const sourceCompleteness =
      okxAprDecimal && fundingRateDecimal
        ? "full"
        : okxAprDecimal || fundingRateDecimal
          ? "partial"
          : "minimal";

    const canInvest = sourceCompleteness !== "minimal" && rankScore > 0;

    opportunities.push({
      asset,
      displayName: ASSET_NAMES[asset] ?? asset,
      okxAprPercent,
      okxAprSource: okxAprDecimal ? "savings" : null,
      okxProductName: okxData.productName,
      okxSpotPrice,
      binanceFundingRatePercent: fundingRatePercent,
      binanceFundingIntervalHours: intervalHours,
      binanceMarkPrice: binanceData.markPrice,
      totalSpreadPercent,
      estimatedProfit1h: estProfit1h,
      estimatedProfit1d: estProfit1d,
      estimatedProfit30d: estProfit30d,
      roi1hPercent,
      crossQuote,
      longQuote,
      shortQuote,
      warnings,
      canInvest,
      rankScore,
      dataFreshness: "live",
      sourceCompleteness,
    });
  }

  // Sort by rank score descending
  opportunities.sort((a, b) => b.rankScore - a.rankScore);

  // Build summary
  let avgFundingRate: string | null = null;
  const fundingRates = opportunities
    .filter((o) => o.binanceFundingRatePercent !== null)
    .map((o) => new Decimal(o.binanceFundingRatePercent!));
  if (fundingRates.length > 0) {
    const sum = fundingRates.reduce((acc, r) => acc.plus(r), new Decimal(0));
    avgFundingRate = sum.div(fundingRates.length).toFixed(4);
  }

  let topAprAsset: string | null = null;
  let topAprPercent: string | null = null;
  for (const opp of opportunities) {
    if (opp.okxAprPercent) {
      const current = new Decimal(opp.okxAprPercent);
      if (!topAprPercent || current.gt(new Decimal(topAprPercent))) {
        topAprAsset = opp.asset;
        topAprPercent = opp.okxAprPercent;
      }
    }
  }

  return {
    opportunities,
    summary: {
      avgFundingRatePercent: avgFundingRate,
      topAprAsset,
      topAprPercent,
      totalOpportunities: opportunities.length,
    },
    referencePositionUsd: REFERENCE_POSITION_USD,
    errors,
    fetchedAt: Date.now(),
    exchangeStatus: { okx: okxStatus, binance: binanceStatus },
  };
}

// ─── OKX Earn Rates Fetcher ───────────────────────────────

let _okxEarnCache: {
  ts: number;
  data: Map<string, { rate: string; productName: string | null }>;
} | null = null;
const OKX_EARN_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchOkxEarnRates(): Promise<
  Map<string, { rate: string; productName: string | null }>
> {
  const now = Date.now();
  if (_okxEarnCache && now - _okxEarnCache.ts < OKX_EARN_TTL) {
    return _okxEarnCache.data;
  }

  const result = new Map<string, { rate: string; productName: string | null }>();

  // Strategy 1: Try the lending-rate-summary endpoint (authenticated)
  try {
    const savingsProducts = await okxRequest<OkxLendingProduct[]>(
      "GET",
      "/api/v5/finance/savings/lending-rate-summary"
    );
    console.log(`[Scanner] OKX lending-rate-summary returned ${Array.isArray(savingsProducts) ? savingsProducts.length : "non-array"} items`);

    if (Array.isArray(savingsProducts) && savingsProducts.length > 0) {
      // Log first few items to understand the shape
      const sample = savingsProducts.slice(0, 3);
      console.log(`[Scanner] OKX lending-rate-summary sample:`, JSON.stringify(sample));

      for (const product of savingsProducts) {
        // The response may use different field names - check all possible rate fields
        const raw = product as unknown as Record<string, unknown>;
        // preRate = last confirmed/settled rate (most accurate "current" rate)
        // estRate = estimated next-period rate
        // avgRate = historical average (not current)
        const rateSrc = (raw.preRate as string) ?? (raw.estRate as string) ?? product.rate ?? (raw.avgRate as string) ?? (raw.lendingRate as string);
        if (product.ccy && rateSrc) {
          const rateDecimal = new Decimal(rateSrc);
          if (rateDecimal.gt(0)) {
            const existing = result.get(product.ccy);
            if (!existing || new Decimal(existing.rate).lt(rateDecimal)) {
              result.set(product.ccy, {
                rate: rateSrc,
                productName: "Simple Earn",
              });
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn("[Scanner] OKX lending-rate-summary failed:", (e as Error).message);
  }

  // Strategy 2: If summary returned nothing, try savings balance (user's earn positions)
  if (result.size === 0) {
    try {
      const savingsBalances = await okxRequest<OkxSavingsBalance[]>(
        "GET",
        "/api/v5/finance/savings/balance"
      );
      console.log(`[Scanner] OKX savings/balance returned ${Array.isArray(savingsBalances) ? savingsBalances.length : "non-array"} items`);

      if (Array.isArray(savingsBalances)) {
        for (const bal of savingsBalances) {
          if (bal.ccy && bal.rate) {
            const rateDecimal = new Decimal(bal.rate);
            if (rateDecimal.gt(0)) {
              result.set(bal.ccy, {
                rate: bal.rate,
                productName: "Simple Earn (from balance)",
              });
            }
          }
        }
      }
    } catch (e2) {
      console.warn("[Scanner] OKX savings/balance fallback failed:", (e2 as Error).message);
    }
  }

  // Strategy 3: If still nothing, try fetching lending rate history for popular assets
  // This is a per-currency endpoint, so we limit to top assets
  if (result.size === 0) {
    console.log("[Scanner] Falling back to per-asset OKX lending-rate-history");
    const popularAssets = [
      "BTC", "ETH", "SOL", "DOGE", "XRP", "ADA", "AVAX", "DOT",
      "LINK", "NEAR", "ARB", "OP", "SUI", "APT", "INJ", "PEPE",
      "WIF", "BONK", "SHIB", "KITE", "FIL", "ATOM", "UNI", "LTC",
      "TIA", "SEI", "FET", "RENDER", "TON", "PENGU",
    ];

    const results = await Promise.allSettled(
      popularAssets.map(async (ccy) => {
        try {
          const history = await okxRequest<Array<{ ccy: string; lendingAmt: string; rate: string; ts: string }>>(
            "GET",
            "/api/v5/finance/savings/lending-rate-history",
            { ccy }
          );
          if (Array.isArray(history) && history.length > 0) {
            // Use the most recent rate
            const latest = history[0];
            if (latest.rate && new Decimal(latest.rate).gt(0)) {
              return { ccy, rate: latest.rate };
            }
          }
          return null;
        } catch {
          return null;
        }
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        result.set(r.value.ccy, {
          rate: r.value.rate,
          productName: "Simple Earn (from rate history)",
        });
      }
    }
    console.log(`[Scanner] Per-asset lending-rate-history found ${result.size} rates`);
  }

  console.log(`[Scanner] OKX earn rates total: ${result.size} currencies`);
  _okxEarnCache = { ts: now, data: result };
  return result;
}

// ─── Binance Perpetual Data Fetcher ───────────────────────

let _binancePerpCache: {
  ts: number;
  data: Map<
    string,
    {
      symbol: string;
      baseAsset: string;
      quoteAsset: string;
      fundingRate: string | null;
      markPrice: string | null;
      intervalHours: number | null;
    }
  >;
} | null = null;
const BINANCE_PERP_TTL = 60_000; // 1 minute

async function fetchBinancePerpData(): Promise<
  Map<
    string,
    {
      symbol: string;
      baseAsset: string;
      quoteAsset: string;
      fundingRate: string | null;
      markPrice: string | null;
      intervalHours: number | null;
    }
  >
> {
  const now = Date.now();
  if (_binancePerpCache && now - _binancePerpCache.ts < BINANCE_PERP_TTL) {
    return _binancePerpCache.data;
  }

  const result = new Map<
    string,
    {
      symbol: string;
      baseAsset: string;
      quoteAsset: string;
      fundingRate: string | null;
      markPrice: string | null;
      intervalHours: number | null;
    }
  >();

  // Fetch exchange info (symbol list with base/quote metadata)
  const exchangeInfo = await binancePublicFetch<BinanceExchangeInfo>(
    "/fapi/v1/exchangeInfo"
  );

  // Fetch all mark prices + funding rates in one bulk call
  const allPremiums = await binancePublicFetch<BinancePremiumIndex[]>(
    "/fapi/v1/premiumIndex"
  );

  const premiumMap = new Map<string, BinancePremiumIndex>();
  for (const p of allPremiums) {
    premiumMap.set(p.symbol, p);
  }

  for (const sym of exchangeInfo.symbols) {
    if (sym.status !== "TRADING") continue;
    if (sym.contractType && sym.contractType !== "PERPETUAL") continue;

    const premium = premiumMap.get(sym.symbol);

    result.set(sym.symbol, {
      symbol: sym.symbol,
      baseAsset: sym.baseAsset,
      quoteAsset: sym.quoteAsset ?? "USDT",
      fundingRate: premium?.lastFundingRate ?? null,
      markPrice: premium?.markPrice ?? null,
      intervalHours: null, // Will be enriched if needed
    });
  }

  _binancePerpCache = { ts: now, data: result };
  return result;
}

async function binancePublicFetch<T>(
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(`https://fapi.binance.com${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Binance public ${path} failed (${res.status})`);
  }
  return (await res.json()) as T;
}

// ─── OKX Spot Prices Fetcher ────────────────────────────

interface OkxTicker {
  instId: string;
  last: string;
}

let _okxSpotPriceCache: { ts: number; data: Map<string, string> } | null = null;
const OKX_SPOT_TTL = 60_000; // 1 minute

async function fetchOkxSpotPrices(): Promise<Map<string, string>> {
  const now = Date.now();
  if (_okxSpotPriceCache && now - _okxSpotPriceCache.ts < OKX_SPOT_TTL) {
    return _okxSpotPriceCache.data;
  }

  const result = new Map<string, string>();

  // Bulk fetch all spot tickers (public, no auth needed)
  const res = await fetch(
    "https://www.okx.com/api/v5/market/tickers?instType=SPOT"
  );
  if (!res.ok) throw new Error(`OKX spot tickers failed (${res.status})`);
  const json = await res.json();
  const tickers: OkxTicker[] = json.data ?? [];

  for (const t of tickers) {
    // instId like "BTC-USDT" → base = "BTC"
    if (t.instId.endsWith("-USDT") && t.last) {
      const base = t.instId.replace("-USDT", "");
      result.set(base, t.last);
    }
  }

  _okxSpotPriceCache = { ts: now, data: result };
  return result;
}

// ─── Binance Funding Intervals Fetcher ──────────────────

interface BinanceFundingInfo {
  symbol: string;
  adjustedFundingRateCap: string;
  adjustedFundingRateFloor: string;
  fundingIntervalHours: number;
}

let _binanceFundingIntervalsCache: {
  ts: number;
  data: Map<string, number>;
} | null = null;
const BINANCE_FUNDING_INFO_TTL = 5 * 60_000; // 5 minutes

async function fetchBinanceFundingIntervals(): Promise<Map<string, number>> {
  const now = Date.now();
  if (
    _binanceFundingIntervalsCache &&
    now - _binanceFundingIntervalsCache.ts < BINANCE_FUNDING_INFO_TTL
  ) {
    return _binanceFundingIntervalsCache.data;
  }

  const result = new Map<string, number>();
  const infos = await binancePublicFetch<BinanceFundingInfo[]>(
    "/fapi/v1/fundingInfo"
  );

  for (const info of infos) {
    if (info.fundingIntervalHours) {
      result.set(info.symbol, info.fundingIntervalHours);
    }
  }

  _binanceFundingIntervalsCache = { ts: now, data: result };
  return result;
}
