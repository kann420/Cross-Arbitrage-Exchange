import Decimal from "decimal.js";
import { binanceRequest } from "./client";
import { toDecimalStr } from "../utils";
import {
  fetchBinanceFundingIntervalHours,
  fetchBinanceMarkPrice,
  fetchReportingQuoteContext,
} from "../../market-data";
import type {
  ExchangeAdapter,
  NormalizedBalance,
  NormalizedHolding,
  NormalizedPosition,
  NormalizedEvent,
} from "../types";

const ACCOUNT_TTL_MS = 60_000;

interface BinanceFuturesAccount {
  totalWalletBalance: string;
  totalUnrealizedProfit: string;
  totalMarginBalance: string;
  availableBalance: string;
  assets: Array<{
    asset: string;
    walletBalance: string;
    unrealizedProfit: string;
    marginBalance: string;
    availableBalance: string;
  }>;
}

interface BinancePositionRisk {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  unRealizedProfit: string;
  liquidationPrice: string;
  leverage: string;
  marginType: string;
  notional: string;
  isolatedMargin?: string;
  updateTime?: number;
}

interface BinanceIncomeRecord {
  symbol: string;
  incomeType: string;
  income: string;
  asset: string;
  time: number;
  info: string;
  tranId: number;
}

type CacheEntry<T> = {
  ts: number;
  data: T;
};

function getCacheValue<T>(
  entry: CacheEntry<T> | null | undefined,
  ttlMs: number,
  forceRefresh: boolean
): T | null {
  if (!entry || forceRefresh) return null;
  return Date.now() - entry.ts < ttlMs ? entry.data : null;
}

let _accountCache: CacheEntry<BinanceFuturesAccount> | null = null;
let _positionRiskCache: CacheEntry<BinancePositionRisk[]> | null = null;
let _incomeCache: CacheEntry<BinanceIncomeRecord[]> | null = null;

export class BinanceAdapter implements ExchangeAdapter {
  latestRawPayloads: Record<string, unknown> = {};

  constructor(private readonly forceRefresh = false) {}

  async healthcheck() {
    try {
      await binanceRequest("GET", "/fapi/v2/account");
      return {
        ok: true,
        exchange: "binance" as const,
        message: "Authenticated OK",
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, exchange: "binance" as const, message: msg };
    }
  }

  async getBalances(): Promise<NormalizedBalance[]> {
    const now = Date.now();
    try {
      const account = await this.fetchAccountCached();
      this.latestRawPayloads.account = account;

      return account.assets
        .filter((asset) => parseFloat(asset.walletBalance) !== 0)
        .map((asset) => ({
          exchange: "binance" as const,
          accountScope: "futures" as const,
          asset: asset.asset.toUpperCase(),
          available: toDecimalStr(asset.availableBalance),
          locked: toDecimalStr(
            (
              parseFloat(asset.marginBalance) - parseFloat(asset.availableBalance)
            ).toString()
          ),
          total: toDecimalStr(asset.walletBalance),
          usdValue: toDecimalStr(asset.marginBalance),
          ts: now,
        }));
    } catch (e) {
      console.warn("[Binance] Failed to fetch balances:", (e as Error).message);
      return [];
    }
  }

  async getHoldings(): Promise<NormalizedHolding[]> {
    return [];
  }

  async getPositions(): Promise<NormalizedPosition[]> {
    try {
      const [positions, reportingContext] = await Promise.all([
        this.fetchPositionRiskCached(),
        fetchReportingQuoteContext(this.forceRefresh),
      ]);
      this.latestRawPayloads.positions = positions;

      return await Promise.all(
        positions
          .filter((position) => parseFloat(position.positionAmt) !== 0)
          .map(async (position) => {
            const { base, quote } = parseBinanceSymbol(position.symbol);
            const posAmt = new Decimal(position.positionAmt);
            const side =
              posAmt.gt(0) ? "long" : posAmt.lt(0) ? "short" : "flat";
            const [liveMark, fundingIntervalHours] = await Promise.all([
              fetchBinanceMarkPrice(position.symbol, this.forceRefresh),
              fetchBinanceFundingIntervalHours(position.symbol, this.forceRefresh),
            ]);
            const effectiveMark = new Decimal(liveMark?.markPrice ?? position.markPrice);
            const entryPrice = new Decimal(position.entryPrice);
            const unrealized = posAmt.abs().mul(entryPrice.minus(effectiveMark));

            return {
              exchange: "binance" as const,
              instrumentType: "perp" as const,
              canonicalAsset: base,
              baseAsset: base,
              quoteAsset: quote,
              symbolNative: position.symbol,
              side: side as "long" | "short" | "flat",
              quantity: toDecimalStr(position.positionAmt),
              quantityAbs: toDecimalStr(posAmt.abs().toString()),
              entryPrice: toDecimalStr(position.entryPrice),
              markPrice: toDecimalStr(effectiveMark.toString()),
              liquidationPrice: toDecimalStr(position.liquidationPrice),
              leverage: toDecimalStr(position.leverage),
              notional: toDecimalStr(position.notional),
              marginMode: position.marginType,
              unrealizedPnl: toDecimalStr(unrealized.toString()),
              fundingRate: liveMark?.lastFundingRate
                ? toDecimalStr(liveMark.lastFundingRate)
                : undefined,
              fundingIntervalHours,
              nextFundingTime: liveMark?.nextFundingTime ?? null,
              ts: liveMark?.time ?? position.updateTime ?? Date.now(),
              openedAtMs: position.updateTime ?? null,
              quoteToUsdRate: reportingContext.quoteToUsdRates[quote] ?? undefined,
              reportingQuoteAsset: reportingContext.reportingQuoteAsset,
            };
          })
      );
    } catch (e) {
      console.warn("[Binance] Failed to fetch positions:", (e as Error).message);
      return [];
    }
  }

  async getRecentEvents(params?: {
    sinceTs?: number;
    limit?: number;
  }): Promise<NormalizedEvent[]> {
    try {
      const income = params?.sinceTs
        ? await binanceRequest<BinanceIncomeRecord[]>("GET", "/fapi/v1/income", {
            startTime: String(params.sinceTs),
            limit: String(params.limit ?? 100),
          })
        : await this.fetchIncomeCached(params?.limit ?? 100);
      this.latestRawPayloads.income = income;

      return income.map((row) => {
        const { base, quote } = parseBinanceSymbol(row.symbol || "");
        const eventType = mapIncomeType(row.incomeType);

        return {
          exchange: "binance" as const,
          eventType,
          canonicalAsset: base || undefined,
          baseAsset: base || undefined,
          quoteAsset: quote || undefined,
          symbolNative: row.symbol || undefined,
          amount: toDecimalStr(row.income),
          feeAsset: row.asset?.toUpperCase(),
          ts: row.time,
          metadata: {
            tranId: row.tranId,
            incomeType: row.incomeType,
            info: row.info,
          },
        };
      });
    } catch (e) {
      console.warn("[Binance] Failed to fetch income:", (e as Error).message);
      return [];
    }
  }

  private async fetchAccountCached(): Promise<BinanceFuturesAccount> {
    const cached = getCacheValue(_accountCache, ACCOUNT_TTL_MS, this.forceRefresh);
    if (cached) return cached;

    const data = await binanceRequest<BinanceFuturesAccount>(
      "GET",
      "/fapi/v2/account"
    );
    _accountCache = { ts: Date.now(), data };
    return data;
  }

  private async fetchPositionRiskCached(): Promise<BinancePositionRisk[]> {
    const cached = getCacheValue(
      _positionRiskCache,
      ACCOUNT_TTL_MS,
      this.forceRefresh
    );
    if (cached) return cached;

    const data = await binanceRequest<BinancePositionRisk[]>(
      "GET",
      "/fapi/v2/positionRisk"
    );
    _positionRiskCache = { ts: Date.now(), data };
    return data;
  }

  private async fetchIncomeCached(limit: number): Promise<BinanceIncomeRecord[]> {
    const cached = getCacheValue(_incomeCache, ACCOUNT_TTL_MS, this.forceRefresh);
    if (cached) return cached;

    const data = await binanceRequest<BinanceIncomeRecord[]>(
      "GET",
      "/fapi/v1/income",
      { limit: String(limit) }
    );
    _incomeCache = { ts: Date.now(), data };
    return data;
  }
}

const KNOWN_QUOTE_SUFFIXES = [
  "USDT",
  "USDC",
  "FDUSD",
  "BUSD",
  "BTC",
  "ETH",
  "BNB",
];

function parseBinanceSymbol(symbol: string): {
  base: string;
  quote: string;
} {
  if (!symbol) return { base: "UNKNOWN", quote: "UNKNOWN" };

  const upper = symbol.toUpperCase();
  for (const suffix of KNOWN_QUOTE_SUFFIXES) {
    if (upper.endsWith(suffix) && upper.length > suffix.length) {
      return {
        base: upper.slice(0, -suffix.length),
        quote: suffix,
      };
    }
  }
  return { base: upper, quote: "UNKNOWN" };
}

function mapIncomeType(incomeType: string): NormalizedEvent["eventType"] {
  switch (incomeType.toUpperCase()) {
    case "FUNDING_FEE":
      return "funding_fee";
    case "REALIZED_PNL":
      return "trade_fill";
    case "COMMISSION":
      return "fee";
    default:
      return "unknown";
  }
}
