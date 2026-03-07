import Decimal from "decimal.js";
import { toUnixMs } from "./exchanges/utils";

const OKX_PUBLIC_BASE = "https://www.okx.com";
const BINANCE_FAPI_BASE = "https://fapi.binance.com";
const PRICE_TTL_MS = 30_000;
const FUNDING_INTERVAL_TTL_MS = 60 * 60 * 1000;
const INSTRUMENT_TTL_MS = 60 * 60 * 1000;

interface OkxPublicEnvelope<T> {
  code: string;
  msg: string;
  data: T;
}

export interface OkxPublicInstrument {
  instId: string;
  instType: string;
  baseCcy?: string;
  quoteCcy?: string;
  state?: string;
  tradeQuoteCcyList?: string[];
}

export interface OkxPublicTicker {
  instId: string;
  last: string;
  bidPx: string;
  askPx: string;
  ts: string;
}

export interface BinancePublicMarkPrice {
  symbol: string;
  markPrice: string;
  lastFundingRate: string;
  nextFundingTime: number;
  time: number;
}

interface BinanceFundingRateRecord {
  symbol: string;
  fundingTime: number;
  fundingRate: string;
  markPrice: string;
}

export interface ReportingQuoteContext {
  reportingQuoteAsset: "USD";
  quoteToUsdRates: Record<string, string>;
  warnings: string[];
  fetchedAt: number;
}

let _spotInstrumentsCache:
  | {
      ts: number;
      data: OkxPublicInstrument[];
    }
  | null = null;

let _quoteContextCache:
  | {
      ts: number;
      data: ReportingQuoteContext;
    }
  | null = null;

const _okxTickerCache = new Map<
  string,
  {
    ts: number;
    data: OkxPublicTicker | null;
  }
>();

const _binanceMarkPriceCache = new Map<
  string,
  {
    ts: number;
    data: BinancePublicMarkPrice | null;
  }
>();

const _binanceFundingIntervalCache = new Map<
  string,
  {
    ts: number;
    data: number | null;
  }
>();

async function okxPublicRequest<T>(
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(`${OKX_PUBLIC_BASE}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OKX public ${path} failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as OkxPublicEnvelope<T>;
  if (json.code !== "0") {
    throw new Error(`OKX public ${path} error: code=${json.code} msg=${json.msg}`);
  }

  return json.data;
}

async function binancePublicRequest<T>(
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(`${BINANCE_FAPI_BASE}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Binance public ${path} failed (${res.status}): ${text}`);
  }

  return (await res.json()) as T;
}

export async function fetchOkxSpotInstruments(
  forceRefresh = false
): Promise<OkxPublicInstrument[]> {
  const now = Date.now();
  if (
    !forceRefresh &&
    _spotInstrumentsCache &&
    now - _spotInstrumentsCache.ts < INSTRUMENT_TTL_MS
  ) {
    return _spotInstrumentsCache.data;
  }

  const data = await okxPublicRequest<OkxPublicInstrument[]>(
    "/api/v5/public/instruments",
    { instType: "SPOT" }
  );

  _spotInstrumentsCache = { ts: now, data };
  return data;
}

export async function fetchOkxTicker(
  instId: string,
  forceRefresh = false
): Promise<OkxPublicTicker | null> {
  const now = Date.now();
  const cached = _okxTickerCache.get(instId);

  if (!forceRefresh && cached && now - cached.ts < PRICE_TTL_MS) {
    return cached.data;
  }

  try {
    const data = await okxPublicRequest<OkxPublicTicker[]>(
      "/api/v5/market/ticker",
      { instId }
    );
    const ticker = data[0] ?? null;
    _okxTickerCache.set(instId, { ts: now, data: ticker });
    return ticker;
  } catch {
    _okxTickerCache.set(instId, { ts: now, data: null });
    return null;
  }
}

export async function fetchBinanceMarkPrice(
  symbol: string,
  forceRefresh = false
): Promise<BinancePublicMarkPrice | null> {
  const now = Date.now();
  const cached = _binanceMarkPriceCache.get(symbol);

  if (!forceRefresh && cached && now - cached.ts < PRICE_TTL_MS) {
    return cached.data;
  }

  try {
    const data = await binancePublicRequest<BinancePublicMarkPrice>(
      "/fapi/v1/premiumIndex",
      { symbol }
    );
    _binanceMarkPriceCache.set(symbol, { ts: now, data });
    return data;
  } catch {
    _binanceMarkPriceCache.set(symbol, { ts: now, data: null });
    return null;
  }
}

export async function fetchBinanceFundingIntervalHours(
  symbol: string,
  forceRefresh = false
): Promise<number | null> {
  const now = Date.now();
  const cached = _binanceFundingIntervalCache.get(symbol);

  if (!forceRefresh && cached && now - cached.ts < FUNDING_INTERVAL_TTL_MS) {
    return cached.data;
  }

  try {
    const data = await binancePublicRequest<BinanceFundingRateRecord[]>(
      "/fapi/v1/fundingRate",
      { symbol, limit: "2" }
    );
    const ordered = data
      .slice()
      .sort((left, right) => left.fundingTime - right.fundingTime);
    const latest = ordered[ordered.length - 1];
    const previous = ordered[ordered.length - 2];
    const intervalHours =
      latest && previous
        ? Math.max(
            1,
            Math.round((latest.fundingTime - previous.fundingTime) / (60 * 60 * 1000))
          )
        : null;
    _binanceFundingIntervalCache.set(symbol, { ts: now, data: intervalHours });
    return intervalHours;
  } catch {
    _binanceFundingIntervalCache.set(symbol, { ts: now, data: null });
    return null;
  }
}

export async function fetchReportingQuoteContext(
  forceRefresh = false
): Promise<ReportingQuoteContext> {
  const now = Date.now();
  if (
    !forceRefresh &&
    _quoteContextCache &&
    now - _quoteContextCache.ts < PRICE_TTL_MS
  ) {
    return _quoteContextCache.data;
  }

  const warnings: string[] = [];
  const quoteToUsdRates: Record<string, string> = { USD: "1" };

  const [usdtUsd, usdgUsdt] = await Promise.all([
    fetchOkxTicker("USDT-USD", forceRefresh),
    fetchOkxTicker("USDG-USDT", forceRefresh),
  ]);

  if (usdtUsd?.last) {
    quoteToUsdRates.USDT = new Decimal(usdtUsd.last).toString();
  } else {
    warnings.push("Missing USDT-USD ticker; USDT values cannot be converted to USD.");
  }

  if (usdgUsdt?.last && quoteToUsdRates.USDT) {
    quoteToUsdRates.USDG = new Decimal(usdgUsdt.last)
      .mul(quoteToUsdRates.USDT)
      .toString();
  } else if (!usdgUsdt?.last) {
    warnings.push("Missing USDG-USDT ticker; USDG values cannot be converted to USD.");
  }

  const fetchedAt = Math.max(
    usdtUsd?.ts ? toUnixMs(usdtUsd.ts) : now,
    usdgUsdt?.ts ? toUnixMs(usdgUsdt.ts) : now
  );

  const data: ReportingQuoteContext = {
    reportingQuoteAsset: "USD",
    quoteToUsdRates,
    warnings,
    fetchedAt,
  };

  _quoteContextCache = { ts: now, data };
  return data;
}

export function getQuoteToUsdRate(
  quoteAsset: string | null | undefined,
  context: ReportingQuoteContext
): Decimal | null {
  if (!quoteAsset) return null;
  const rate = context.quoteToUsdRates[quoteAsset.toUpperCase()];
  if (!rate) return null;
  return new Decimal(rate);
}
