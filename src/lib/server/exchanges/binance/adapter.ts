import Decimal from "decimal.js";
import { binanceRequest } from "./client";
import { toDecimalStr } from "../utils";
import {
  fetchBinanceFundingIntervalHours,
  fetchBinanceMarkPrice,
  fetchReportingQuoteContext,
  fetchBinanceSpotPriceAtTs,
  getQuoteToUsdRate,
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
      const [income, reportingContext] = await Promise.all([
        params?.sinceTs
          ? this.fetchIncomeRangeSince(params.sinceTs, params.limit ?? 1000)
          : this.fetchIncomeCached(params?.limit ?? 100),
        fetchReportingQuoteContext(this.forceRefresh),
      ]);
      this.latestRawPayloads.income = income;

      const normalized = await Promise.all(
        income.map(async (row) => {
          const amount = new Decimal(row.income);
          const feeAsset = row.asset?.toUpperCase();
          const { base, quote } = parseBinanceSymbol(row.symbol || "");
          const eventType = mapIncomeType(row.incomeType);
          const quoteToUsd = getQuoteToUsdRate(quote, reportingContext);
          let amountInQuote: Decimal | null = null;
          let amountInReporting: Decimal | null = null;
          let conversionSource: string | null = null;

          if (feeAsset) {
            if (feeAsset === quote) {
              amountInQuote = amount;
              amountInReporting = quoteToUsd ? amount.mul(quoteToUsd) : null;
              conversionSource = `${quote}_direct`;
            } else if (feeAsset === reportingContext.reportingQuoteAsset) {
              amountInReporting = amount;
              conversionSource = `${reportingContext.reportingQuoteAsset}_direct`;
            } else {
              const directToUsd = getQuoteToUsdRate(feeAsset, reportingContext);
              if (directToUsd) {
                amountInReporting = amount.mul(directToUsd);
                conversionSource = `${feeAsset}_direct`;
              }

              if (
                !amountInQuote &&
                quote !== "UNKNOWN" &&
                feeAsset !== "UNKNOWN"
              ) {
                const spotCross = await fetchBinanceSpotPriceAtTs(
                  `${feeAsset}${quote}`,
                  row.time,
                  this.forceRefresh
                );
                if (spotCross) {
                  amountInQuote = amount.mul(spotCross);
                  amountInReporting = quoteToUsd
                    ? amountInQuote.mul(quoteToUsd)
                    : amountInReporting;
                  conversionSource = `spot_1m_close:${feeAsset}${quote}`;
                }
              }
            }
          }

          if (eventType === "fee" && amountInReporting === null) {
            console.warn(
              `[Binance] Missing fee conversion for ${row.symbol} ${feeAsset ?? "UNKNOWN"} at ${row.time}`
            );
          }

          return {
            exchange: "binance" as const,
            eventType,
            canonicalAsset: base || undefined,
            baseAsset: base || undefined,
            quoteAsset: quote || undefined,
            symbolNative: row.symbol || undefined,
            amount: toDecimalStr(row.income),
            feeAsset,
            ts: row.time,
            metadata: {
              tranId: row.tranId,
              incomeType: row.incomeType,
              info: row.info,
              amountInQuote: amountInQuote
                ? toDecimalStr(amountInQuote.toString())
                : null,
              amountInReporting: amountInReporting
                ? toDecimalStr(amountInReporting.toString())
                : null,
              reportingQuoteAsset: reportingContext.reportingQuoteAsset,
              conversionSource,
            },
          };
        })
      );

      console.log(
        `[Binance] Normalized ${normalized.length} income events` +
          (params?.sinceTs ? ` since ${params.sinceTs}` : " from cached window")
      );

      return normalized;
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

  private async fetchIncomeRangeSince(
    sinceTs: number,
    limit: number
  ): Promise<BinanceIncomeRecord[]> {
    const pageSize = Math.min(Math.max(limit, 1), 1000);
    const rows: BinanceIncomeRecord[] = [];
    const seen = new Set<string>();
    let cursor = sinceTs;

    for (let page = 0; page < 20; page += 1) {
      const batch = await binanceRequest<BinanceIncomeRecord[]>(
        "GET",
        "/fapi/v1/income",
        {
          startTime: String(cursor),
          limit: String(pageSize),
        }
      );

      if (batch.length === 0) {
        break;
      }

      let maxTs = cursor;
      for (const row of batch) {
        const key = [
          row.time,
          row.tranId,
          row.incomeType,
          row.asset,
          row.income,
          row.symbol,
        ].join(":");
        if (!seen.has(key)) {
          seen.add(key);
          rows.push(row);
        }
        if (row.time > maxTs) {
          maxTs = row.time;
        }
      }

      if (batch.length < pageSize || maxTs <= cursor) {
        break;
      }
      cursor = maxTs + 1;
    }

    rows.sort((left, right) => left.time - right.time);
    console.log(
      `[Binance] Income range fetch since ${sinceTs}: ${rows.length} rows`
    );
    return rows;
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
