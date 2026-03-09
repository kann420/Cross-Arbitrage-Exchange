import "server-only";
import Decimal from "decimal.js";
import { binanceRequest } from "./exchanges/binance/client";
import { okxRequest } from "./exchanges/okx/client";
import { toUnixMs } from "./exchanges/utils";
import {
  fetchBinanceMarkPrice,
  fetchReportingQuoteContext,
  getQuoteToUsdRate,
} from "./market-data";

interface OkxBillArchiveRow {
  ccy: string;
  instId: string;
  instType: string;
  balChg: string;
  fee: string;
  px: string;
  sz: string;
  ts: string;
}

interface BinanceUserTrade {
  symbol: string;
  side: "BUY" | "SELL";
  price: string;
  qty: string;
  realizedPnl: string;
  commission: string;
  commissionAsset: string;
  time: number;
  positionSide: string;
}

interface BinanceIncomeRecord {
  symbol: string;
  incomeType: string;
  income: string;
  asset: string;
  time: number;
}

interface HistoryLegSnapshot {
  exchange: string;
  side: "long" | "short";
  entryPrice: string | null;
  exitPrice: string | null;
  size: string | null;
  quoteAsset: string | null;
}

interface ClosedLegCycle {
  asset: string;
  openedAtMs: number;
  closedAtMs: number;
  longLeg?: HistoryLegSnapshot;
  shortLeg?: HistoryLegSnapshot;
  longNetPnlUsd?: Decimal | null;
  shortNetPnlUsd?: Decimal | null;
  realizedSpreadPercent?: Decimal | null;
  warnings: string[];
}

export interface HistoryEntryResult {
  historyEntryId: string;
  strategyGroupId: string;
  canonicalAsset: string;
  strategyName: string;
  entryType: "closure";
  status: "Settled";
  openedAtMs: number;
  closedAtMs: number;
  durationMs: number;
  realizedSpreadPercent: string | null;
  finalPnl: string | null;
  pnlPositive: boolean;
  legs: Array<{ label: string; side: "long" | "short" }>;
  details: {
    spotLeg: {
      exchange: string;
      side: "long" | "short";
      entryPrice: string | null;
      exitPrice: string | null;
      size: string | null;
    };
    perpLeg: {
      exchange: string;
      side: "long" | "short";
      entryPrice: string | null;
      exitPrice: string | null;
      size: string | null;
    };
  };
  warnings: string[];
}

export interface HistoryStatsResult {
  totalRealizedPnl: string | null;
  completedArbitrages: number;
  avgStrategyDurationMs: number | null;
}

export interface HistoryApiResult {
  stats: HistoryStatsResult;
  entries: HistoryEntryResult[];
  errors: string[];
  fetchedAt: number;
}

const HISTORY_TTL_MS = 60_000;
let _historyCache:
  | {
      ts: number;
      data: HistoryApiResult;
    }
  | null = null;

function decimalOrNull(value: string | null | undefined): Decimal | null {
  if (value === undefined || value === null || value === "") return null;
  return new Decimal(value);
}

function decimalToString(value: Decimal | null, dp = 2): string | null {
  return value ? value.toFixed(dp) : null;
}

function parseOkxQuote(instId: string): string | null {
  return instId.split("-")[1]?.toUpperCase() ?? null;
}

function parseBinanceSymbol(symbol: string): { base: string; quote: string } {
  const suffixes = ["USDT", "USDC", "FDUSD", "BUSD", "BTC", "ETH", "BNB"];
  for (const suffix of suffixes) {
    if (symbol.endsWith(suffix) && symbol.length > suffix.length) {
      return {
        base: symbol.slice(0, -suffix.length),
        quote: suffix,
      };
    }
  }
  return { base: symbol, quote: "UNKNOWN" };
}

async function convertAssetToUsd(
  asset: string,
  amount: Decimal,
  tradePrice: Decimal | null,
  reportingRates: Awaited<ReturnType<typeof fetchReportingQuoteContext>>
): Promise<Decimal | null> {
  const upper = asset.toUpperCase();

  if (upper === "USD") return amount;

  const directRate = getQuoteToUsdRate(upper, reportingRates);
  if (directRate) {
    return amount.mul(directRate);
  }

  if (tradePrice && upper !== "UNKNOWN") {
    const baseRate = getQuoteToUsdRate("USDT", reportingRates);
    if (upper === "BNB" && baseRate) {
      const bnbMark = await fetchBinanceMarkPrice("BNBUSDT");
      if (bnbMark?.markPrice) {
        return amount.mul(bnbMark.markPrice).mul(baseRate);
      }
    }
  }

  return null;
}

async function buildOkxLongCycles(
  okxBills: OkxBillArchiveRow[]
): Promise<ClosedLegCycle[]> {
  const reportingContext = await fetchReportingQuoteContext();
  const tradeBills = okxBills
    .filter(
      (bill) =>
        bill.instType === "SPOT" &&
        bill.instId &&
        bill.px &&
        bill.sz &&
        bill.ccy &&
        bill.balChg
    )
    .sort((left, right) => toUnixMs(left.ts) - toUnixMs(right.ts));

  const openByAsset = new Map<
    string,
    {
      bill: OkxBillArchiveRow;
      entryCostUsd: Decimal | null;
      entryNetQty: Decimal;
    }
  >();
  const cycles: ClosedLegCycle[] = [];

  for (const bill of tradeBills) {
    const asset = bill.ccy.toUpperCase();
    const baseDelta = new Decimal(bill.balChg);
    const grossQty = new Decimal(bill.sz).abs();
    const tradePrice = new Decimal(bill.px);
    const quoteAsset = parseOkxQuote(bill.instId);
    const quoteToUsd = getQuoteToUsdRate(quoteAsset, reportingContext);
    const feeBase = decimalOrNull(bill.fee)?.abs() ?? new Decimal(0);
    const feeUsd =
      quoteToUsd && feeBase.gt(0) ? feeBase.mul(tradePrice).mul(quoteToUsd) : new Decimal(0);
    const tradeNotionalUsd =
      quoteToUsd ? grossQty.mul(tradePrice).mul(quoteToUsd) : null;

    if (baseDelta.gt(0)) {
      openByAsset.set(asset, {
        bill,
        entryCostUsd: tradeNotionalUsd ? tradeNotionalUsd.plus(feeUsd) : null,
        entryNetQty: baseDelta.abs(),
      });
      continue;
    }

    const open = openByAsset.get(asset);
    if (!open) continue;

    const exitValueUsd = tradeNotionalUsd ? tradeNotionalUsd.minus(feeUsd) : null;
    const warnings: string[] = [];

    if (!open.entryCostUsd || !exitValueUsd) {
      warnings.push(`Missing quote conversion for OKX ${asset} history cycle.`);
    }
    const longNetPnlUsd =
      open.entryCostUsd && exitValueUsd ? exitValueUsd.minus(open.entryCostUsd) : null;

    const entryPriceUsd = quoteToUsd ? tradePrice.mul(quoteToUsd) : null;
    const openBillPriceUsd =
      quoteToUsd && open.bill.px ? new Decimal(open.bill.px).mul(quoteToUsd) : null;
    const spread =
      openBillPriceUsd && entryPriceUsd
        ? null
        : null;

    cycles.push({
      asset,
      openedAtMs: toUnixMs(open.bill.ts),
      closedAtMs: toUnixMs(bill.ts),
      longLeg: {
        exchange: "OKX Spot/Earn",
        side: "long",
        entryPrice: open.bill.px || null,
        exitPrice: bill.px || null,
        size: `${open.entryNetQty.toFixed(8).replace(/\.?0+$/, "")} ${asset}`,
        quoteAsset,
      },
      longNetPnlUsd,
      warnings,
    });
    openByAsset.delete(asset);

    void spread;
  }

  return cycles;
}

async function buildBinanceShortCycles(
  trades: BinanceUserTrade[],
  incomes: BinanceIncomeRecord[]
): Promise<ClosedLegCycle[]> {
  const reportingContext = await fetchReportingQuoteContext();
  const orderedTrades = trades
    .filter((trade) => trade.positionSide === "BOTH")
    .sort((left, right) => left.time - right.time);

  const openByAsset = new Map<
    string,
    {
      symbol: string;
      quoteAsset: string;
      openedAtMs: number;
      qty: Decimal;
      entryNotional: Decimal;
      entryFeesUsd: Decimal;
      warnings: string[];
    }
  >();
  const cycles: ClosedLegCycle[] = [];

  for (const trade of orderedTrades) {
    const { base, quote } = parseBinanceSymbol(trade.symbol);
    const qty = new Decimal(trade.qty);
    const tradePrice = new Decimal(trade.price);
    const quoteToUsd = getQuoteToUsdRate(quote, reportingContext);
    const commission = new Decimal(trade.commission || "0").abs();
    const commissionUsd = await convertAssetToUsd(
      trade.commissionAsset,
      commission,
      tradePrice,
      reportingContext
    );

    if (trade.side === "SELL") {
      const existing = openByAsset.get(base);
      if (existing) {
        existing.qty = existing.qty.plus(qty);
        existing.entryNotional = existing.entryNotional.plus(qty.mul(tradePrice));
        existing.entryFeesUsd = existing.entryFeesUsd.plus(commissionUsd ?? 0);
        if (commissionUsd === null && commission.gt(0)) {
          existing.warnings.push(
            `Unable to convert ${trade.commissionAsset} commission for ${trade.symbol}.`
          );
        }
      } else {
        openByAsset.set(base, {
          symbol: trade.symbol,
          quoteAsset: quote,
          openedAtMs: trade.time,
          qty,
          entryNotional: qty.mul(tradePrice),
          entryFeesUsd: commissionUsd ?? new Decimal(0),
          warnings:
            commissionUsd === null && commission.gt(0)
              ? [`Unable to convert ${trade.commissionAsset} commission for ${trade.symbol}.`]
              : [],
        });
      }
      continue;
    }

    const open = openByAsset.get(base);
    if (!open) continue;

    const realizedPnlQuote = new Decimal(trade.realizedPnl || "0");
    const fundingQuote = incomes
      .filter(
        (income) =>
          income.symbol === trade.symbol &&
          income.incomeType.toUpperCase() === "FUNDING_FEE" &&
          income.time >= open.openedAtMs &&
          income.time <= trade.time
      )
      .reduce((sum, income) => sum.plus(new Decimal(income.income)), new Decimal(0));

    const fundingUsd = quoteToUsd ? fundingQuote.mul(quoteToUsd) : null;
    const realizedUsd = quoteToUsd ? realizedPnlQuote.mul(quoteToUsd) : null;
    const closeFeeUsd = commissionUsd ?? new Decimal(0);
    const shortNetPnlUsd =
      realizedUsd && fundingUsd
        ? realizedUsd.plus(fundingUsd).minus(open.entryFeesUsd).minus(closeFeeUsd)
        : realizedUsd
          ? realizedUsd.minus(open.entryFeesUsd).minus(closeFeeUsd)
          : null;

    const warnings = [...open.warnings];
    if (commissionUsd === null && commission.gt(0)) {
      warnings.push(`Unable to convert ${trade.commissionAsset} commission for ${trade.symbol}.`);
    }
    if (!quoteToUsd) {
      warnings.push(`Missing ${quote}-USD conversion for ${trade.symbol}.`);
    }

    cycles.push({
      asset: base,
      openedAtMs: open.openedAtMs,
      closedAtMs: trade.time,
      shortLeg: {
        exchange: "Binance Perp",
        side: "short",
        entryPrice: open.qty.gt(0) ? open.entryNotional.div(open.qty).toString() : null,
        exitPrice: trade.price,
        size: `${open.qty.toFixed(8).replace(/\.?0+$/, "")} ${base}`,
        quoteAsset: quote,
      },
      shortNetPnlUsd,
      warnings,
    });
    openByAsset.delete(base);
  }

  return cycles;
}

function pairClosedCycles(
  longCycles: ClosedLegCycle[],
  shortCycles: ClosedLegCycle[]
): ClosedLegCycle[] {
  const shortByAsset = new Map<string, ClosedLegCycle[]>();
  for (const cycle of shortCycles) {
    const list = shortByAsset.get(cycle.asset) ?? [];
    list.push(cycle);
    shortByAsset.set(cycle.asset, list);
  }

  const paired: ClosedLegCycle[] = [];
  for (const longCycle of longCycles) {
    const candidates = shortByAsset.get(longCycle.asset) ?? [];
    const matchIndex = candidates.findIndex((candidate) => {
      const openDelta = Math.abs(candidate.openedAtMs - longCycle.openedAtMs);
      const closeDelta = Math.abs(candidate.closedAtMs - longCycle.closedAtMs);
      return openDelta <= 24 * 60 * 60 * 1000 && closeDelta <= 24 * 60 * 60 * 1000;
    });
    if (matchIndex === -1 || !longCycle.longLeg) continue;
    const shortCycle = candidates.splice(matchIndex, 1)[0];
    const longEntry = decimalOrNull(longCycle.longLeg.entryPrice);
    const shortEntry = decimalOrNull(shortCycle.shortLeg?.entryPrice);
    const spread =
      longEntry && shortEntry && longEntry.gt(0)
        ? shortEntry.minus(longEntry).div(longEntry).mul(100)
        : null;

    paired.push({
      asset: longCycle.asset,
      openedAtMs: Math.min(longCycle.openedAtMs, shortCycle.openedAtMs),
      closedAtMs: Math.max(longCycle.closedAtMs, shortCycle.closedAtMs),
      longLeg: longCycle.longLeg,
      shortLeg: shortCycle.shortLeg,
      longNetPnlUsd: longCycle.longNetPnlUsd ?? null,
      shortNetPnlUsd: shortCycle.shortNetPnlUsd ?? null,
      realizedSpreadPercent: spread,
      warnings: [...longCycle.warnings, ...shortCycle.warnings],
    });
  }

  return paired.sort((left, right) => right.closedAtMs - left.closedAtMs);
}

async function fetchOkxBillsArchive(limit = 200): Promise<OkxBillArchiveRow[]> {
  return okxRequest<OkxBillArchiveRow[]>("GET", "/api/v5/account/bills-archive", {
    limit: String(limit),
  });
}
async function fetchBinanceUserTrades(limit = 200): Promise<BinanceUserTrade[]> {
  return binanceRequest<BinanceUserTrade[]>("GET", "/fapi/v1/userTrades", {
    limit: String(limit),
  });
}

async function fetchBinanceIncome(limit = 200): Promise<BinanceIncomeRecord[]> {
  return binanceRequest<BinanceIncomeRecord[]>("GET", "/fapi/v1/income", {
    limit: String(limit),
  });
}

export async function fetchHistory(forceRefresh = false): Promise<HistoryApiResult> {
  const now = Date.now();
  if (!forceRefresh && _historyCache && now - _historyCache.ts < HISTORY_TTL_MS) {
    return _historyCache.data;
  }

  const errors: string[] = [];

  const [okxBills, binanceTrades, binanceIncome] = await Promise.all([
    fetchOkxBillsArchive().catch((error: Error) => {
      errors.push(`OKX bills archive: ${error.message}`);
      return [] as OkxBillArchiveRow[];
    }),
    fetchBinanceUserTrades().catch((error: Error) => {
      errors.push(`Binance user trades: ${error.message}`);
      return [] as BinanceUserTrade[];
    }),
    fetchBinanceIncome().catch((error: Error) => {
      errors.push(`Binance income: ${error.message}`);
      return [] as BinanceIncomeRecord[];
    }),
  ]);

  const [longCycles, shortCycles] = await Promise.all([
    buildOkxLongCycles(okxBills),
    buildBinanceShortCycles(binanceTrades, binanceIncome),
  ]);

  const paired = pairClosedCycles(longCycles, shortCycles);

  const entries: HistoryEntryResult[] = paired.map((cycle) => {
    const finalPnl =
      cycle.longNetPnlUsd || cycle.shortNetPnlUsd
        ? (cycle.longNetPnlUsd ?? new Decimal(0)).plus(cycle.shortNetPnlUsd ?? 0)
        : null;
    const warnings = [...new Set(cycle.warnings)];
    const longLeg = cycle.longLeg!;
    const shortLeg = cycle.shortLeg!;

    return {
      historyEntryId: `history:${cycle.asset}:${cycle.closedAtMs}`,
      strategyGroupId: `closed:${cycle.asset}:${cycle.closedAtMs}`,
      canonicalAsset: cycle.asset,
      strategyName: `${cycle.asset} Hedge`,
      entryType: "closure",
      status: "Settled",
      openedAtMs: cycle.openedAtMs,
      closedAtMs: cycle.closedAtMs,
      durationMs: cycle.closedAtMs - cycle.openedAtMs,
      realizedSpreadPercent: decimalToString(cycle.realizedSpreadPercent ?? null, 2),
      finalPnl: decimalToString(finalPnl),
      pnlPositive: finalPnl ? finalPnl.greaterThanOrEqualTo(0) : false,
      legs: [
        { label: longLeg.exchange, side: "long" as const },
        { label: shortLeg.exchange, side: "short" as const },
      ],
      details: {
        spotLeg: {
          exchange: longLeg.exchange,
          side: "long",
          entryPrice: longLeg.entryPrice,
          exitPrice: longLeg.exitPrice,
          size: longLeg.size,
        },
        perpLeg: {
          exchange: shortLeg.exchange,
          side: "short",
          entryPrice: shortLeg.entryPrice,
          exitPrice: shortLeg.exitPrice,
          size: shortLeg.size,
        },
      },
      warnings,
    };
  });

  const totalRealizedPnl = entries
    .map((entry) => decimalOrNull(entry.finalPnl))
    .filter((value): value is Decimal => value !== null)
    .reduce((sum, value) => sum.plus(value), new Decimal(0));
  const avgDurationMs =
    entries.length > 0
      ? Math.round(entries.reduce((sum, entry) => sum + entry.durationMs, 0) / entries.length)
      : null;

  const result: HistoryApiResult = {
    stats: {
      totalRealizedPnl: decimalToString(totalRealizedPnl),
      completedArbitrages: entries.length,
      avgStrategyDurationMs: avgDurationMs,
    },
    entries,
    errors,
    fetchedAt: now,
  };

  _historyCache = { ts: now, data: result };
  return result;
}
