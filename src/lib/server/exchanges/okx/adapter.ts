import Decimal from "decimal.js";
import { okxRequest } from "./client";
import { toUnixMs, toDecimalStr } from "../utils";
import type {
  ExchangeAdapter,
  NormalizedBalance,
  NormalizedHolding,
  NormalizedPosition,
  NormalizedEvent,
} from "../types";
import {
  fetchOkxSpotInstruments,
  fetchOkxTicker,
  fetchReportingQuoteContext,
  getQuoteToUsdRate,
  type OkxPublicInstrument,
  type ReportingQuoteContext,
} from "../../market-data";

const STABLE_ASSETS = new Set(["USDT", "USDC", "USDG", "FDUSD", "DAI", "BUSD"]);
const ACCOUNT_TTL_MS = 60_000;
const REWARDS_TTL_MS = 60 * 60 * 1000;

interface OkxBalanceDetail {
  ccy: string;
  availBal: string;
  frozenBal: string;
  cashBal: string;
  uTime: string;
  eqUsd?: string;
  accAvgPx?: string;
}

interface OkxAccountBalance {
  details: OkxBalanceDetail[];
  uTime: string;
}

interface OkxPosition {
  instId: string;
  instType: string;
  posSide: string;
  pos: string;
  avgPx: string;
  markPx: string;
  liqPx: string;
  lever: string;
  mgnMode: string;
  notionalUsd: string;
  upl: string;
  uplRatio: string;
  realizedPnl: string;
  baseCcy?: string;
  quoteCcy?: string;
  cTime: string;
  uTime: string;
}

interface OkxSavingsBalance {
  ccy: string;
  amt: string;
  earnings: string;
  rate: string;
  loanAmt?: string;
  pendingAmt?: string;
  redemptAmt?: string;
}

interface OkxSavingsLendingHistory {
  amt: string;
  ccy: string;
  earnings: string;
  rate: string;
  ts: string;
}

interface OkxAssetBalance {
  ccy: string;
  availBal: string;
  frozenBal: string;
  bal: string;
}

interface OkxTradeFill {
  billId: string;
  fee: string;
  feeCcy: string;
  fillPx: string;
  fillSz: string;
  fillTime: string;
  instId: string;
  side: string;
  subType: string;
  tradeQuoteCcy?: string;
  ts: string;
}

interface OkxAccountBill {
  billId: string;
  instId: string;
  instType?: string;
  subType: string;
  balChg: string;
  ccy: string;
  fee: string;
  ts: string;
}

interface CostBasisResult {
  principalQty: Decimal | null;
  avgEntryUsd: Decimal | null;
  totalFeesUsd: Decimal | null;
  realizedPnlUsd: Decimal | null;
  tradeQuoteAsset: string | null;
  openedAtMs: number | null;
  warnings: string[];
}

interface BuiltHolding {
  holding: NormalizedHolding;
  rawSources: Record<string, unknown>;
}

type CacheEntry<T> = {
  ts: number;
  data: T;
};

let _accountBalanceCache: CacheEntry<OkxAccountBalance[]> | null = null;
let _assetBalancesCache: CacheEntry<OkxAssetBalance[]> | null = null;
let _savingsBalanceCache: CacheEntry<OkxSavingsBalance[]> | null = null;
let _positionsCache: CacheEntry<OkxPosition[]> | null = null;
const _accountBillsCache = new Map<string, CacheEntry<OkxAccountBill[]>>();
const _rewardHistoryCache = new Map<string, CacheEntry<OkxSavingsLendingHistory[]>>();
const _fillsHistoryCache = new Map<string, CacheEntry<OkxTradeFill[]>>();

function getBaseAssetFromInstId(instId: string | null | undefined): string {
  return (instId?.split("-")[0] ?? "UNKNOWN").toUpperCase();
}

function getQuoteAssetFromInstId(instId: string | null | undefined): string | null {
  return (instId?.split("-")[1] ?? null)?.toUpperCase() ?? null;
}

function preferredInstrumentOrder(inst: OkxPublicInstrument): number {
  switch ((inst.quoteCcy ?? "").toUpperCase()) {
    case "USD":
      return 0;
    case "USDT":
      return 1;
    case "USDC":
      return 2;
    case "EUR":
      return 3;
    default:
      return 4;
  }
}

function normalizeDecimalOrNull(value: Decimal | null): string | undefined {
  return value ? value.toString() : undefined;
}

function getCacheValue<T>(
  entry: CacheEntry<T> | null | undefined,
  ttlMs: number,
  forceRefresh: boolean
): T | null {
  if (!entry || forceRefresh) return null;
  return Date.now() - entry.ts < ttlMs ? entry.data : null;
}

function reconstructCostBasisFromFills(
  asset: string,
  fills: OkxTradeFill[],
  reportingContext: ReportingQuoteContext
): CostBasisResult {
  if (fills.length === 0) {
    return {
      principalQty: null,
      avgEntryUsd: null,
      totalFeesUsd: null,
      realizedPnlUsd: null,
      tradeQuoteAsset: null,
      openedAtMs: null,
      warnings: [],
    };
  }

  const ordered = fills
    .slice()
    .sort((left, right) => toUnixMs(left.fillTime) - toUnixMs(right.fillTime));

  let openQty = new Decimal(0);
  let openCostUsd = new Decimal(0);
  let totalFeesUsd = new Decimal(0);
  let realizedPnlUsd = new Decimal(0);
  let tradeQuoteAsset: string | null = null;
  const warnings: string[] = [];

  for (const fill of ordered) {
    const fillQty = new Decimal(fill.fillSz);
    const fillPx = new Decimal(fill.fillPx);
    const fee = fill.fee ? new Decimal(fill.fee) : new Decimal(0);
    const feeCcy = fill.feeCcy?.toUpperCase() ?? null;
    const quoteAsset =
      fill.tradeQuoteCcy?.toUpperCase() ??
      getQuoteAssetFromInstId(fill.instId);

    if (!tradeQuoteAsset && quoteAsset) {
      tradeQuoteAsset = quoteAsset;
    }

    const quoteToUsd = getQuoteToUsdRate(quoteAsset, reportingContext);
    if (!quoteToUsd) {
      warnings.push(
        `Missing ${quoteAsset ?? "unknown"}-USD conversion for OKX fills on ${asset}.`
      );
      continue;
    }

    const fillNotionalUsd = fillQty.mul(fillPx).mul(quoteToUsd);
    let feeUsd = new Decimal(0);
    let baseFeeQty = new Decimal(0);

    if (!fee.isZero()) {
      if (feeCcy === asset) {
        baseFeeQty = fee.abs();
        feeUsd = baseFeeQty.mul(fillPx).mul(quoteToUsd);
      } else if (feeCcy === quoteAsset) {
        feeUsd = fee.abs().mul(quoteToUsd);
      } else if (feeCcy === "USD") {
        feeUsd = fee.abs();
      } else if (feeCcy) {
        warnings.push(`Unconverted OKX fill fee currency ${feeCcy} for ${asset}.`);
      }
    }

    if (fill.side.toLowerCase() === "buy") {
      const netQty = fillQty.minus(baseFeeQty);
      openQty = openQty.plus(netQty);
      openCostUsd = openCostUsd.plus(fillNotionalUsd).plus(feeUsd);
    } else if (fill.side.toLowerCase() === "sell") {
      if (openQty.lte(0)) {
        warnings.push(`Encountered OKX sell fill for ${asset} without open quantity.`);
      } else {
        const avgCostUsd = openCostUsd.div(openQty);
        const qtyLeaving = fillQty.plus(baseFeeQty);
        const proceedsUsd = fillNotionalUsd.minus(feeUsd);
        realizedPnlUsd = realizedPnlUsd.plus(
          proceedsUsd.minus(avgCostUsd.mul(fillQty)).minus(avgCostUsd.mul(baseFeeQty))
        );
        openCostUsd = Decimal.max(
          new Decimal(0),
          openCostUsd.minus(avgCostUsd.mul(qtyLeaving))
        );
        openQty = Decimal.max(new Decimal(0), openQty.minus(qtyLeaving));
      }
    } else {
      warnings.push(`Unsupported OKX fill side "${fill.side}" for ${asset}.`);
    }

    totalFeesUsd = totalFeesUsd.minus(feeUsd);
  }

  return {
    principalQty: openQty,
    avgEntryUsd: openQty.gt(0) ? openCostUsd.div(openQty) : null,
    totalFeesUsd,
    realizedPnlUsd,
    tradeQuoteAsset,
    openedAtMs: ordered.length > 0 ? toUnixMs(ordered[0].fillTime) : null,
    warnings,
  };
}

export class OkxAdapter implements ExchangeAdapter {
  latestRawPayloads: Record<string, unknown> = {};

  constructor(private readonly forceRefresh = false) {}

  async healthcheck() {
    try {
      await okxRequest("GET", "/api/v5/account/balance");
      return { ok: true, exchange: "okx" as const, message: "Authenticated OK" };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, exchange: "okx" as const, message: msg };
    }
  }

  private async fetchAccountBalanceCached(): Promise<OkxAccountBalance[]> {
    const cached = getCacheValue(
      _accountBalanceCache,
      ACCOUNT_TTL_MS,
      this.forceRefresh
    );
    if (cached) return cached;

    const data = await okxRequest<OkxAccountBalance[]>(
      "GET",
      "/api/v5/account/balance"
    );
    _accountBalanceCache = { ts: Date.now(), data };
    return data;
  }

  private async fetchAssetBalancesCached(): Promise<OkxAssetBalance[]> {
    const cached = getCacheValue(
      _assetBalancesCache,
      ACCOUNT_TTL_MS,
      this.forceRefresh
    );
    if (cached) return cached;

    const data = await okxRequest<OkxAssetBalance[]>(
      "GET",
      "/api/v5/asset/balances"
    );
    _assetBalancesCache = { ts: Date.now(), data };
    return data;
  }

  private async fetchSavingsBalanceCached(): Promise<OkxSavingsBalance[]> {
    const cached = getCacheValue(
      _savingsBalanceCache,
      ACCOUNT_TTL_MS,
      this.forceRefresh
    );
    if (cached) return cached;

    const data = await okxRequest<OkxSavingsBalance[]>(
      "GET",
      "/api/v5/finance/savings/balance"
    );
    _savingsBalanceCache = { ts: Date.now(), data };
    return data;
  }

  private async fetchPositionsCached(): Promise<OkxPosition[]> {
    const cached = getCacheValue(_positionsCache, ACCOUNT_TTL_MS, this.forceRefresh);
    if (cached) return cached;

    const data = await okxRequest<OkxPosition[]>(
      "GET",
      "/api/v5/account/positions"
    );
    _positionsCache = { ts: Date.now(), data };
    return data;
  }

  private async fetchAccountBillsCached(cacheKey: string): Promise<OkxAccountBill[]> {
    const cached = getCacheValue(
      _accountBillsCache.get(cacheKey),
      ACCOUNT_TTL_MS,
      this.forceRefresh
    );
    if (cached) return cached;

    const params: Record<string, string> =
      cacheKey === "default"
        ? { limit: "100" }
        : { ccy: cacheKey, limit: "100" };
    const data = await okxRequest<OkxAccountBill[]>(
      "GET",
      "/api/v5/account/bills",
      params
    );
    _accountBillsCache.set(cacheKey, { ts: Date.now(), data });
    return data;
  }

  async getBalances(): Promise<NormalizedBalance[]> {
    const now = Date.now();
    const results: NormalizedBalance[] = [];

    try {
      const accounts = await this.fetchAccountBalanceCached();
      this.latestRawPayloads.accountBalance = accounts;

      for (const acct of accounts) {
        for (const detail of acct.details) {
          if (parseFloat(detail.cashBal) === 0 && parseFloat(detail.availBal) === 0) {
            continue;
          }

          results.push({
            exchange: "okx",
            accountScope: "unified",
            asset: detail.ccy.toUpperCase(),
            available: toDecimalStr(detail.availBal),
            locked: toDecimalStr(detail.frozenBal),
            total: toDecimalStr(detail.cashBal),
            usdValue: detail.eqUsd ? toDecimalStr(detail.eqUsd) : undefined,
            ts: detail.uTime ? toUnixMs(detail.uTime) : now,
          });
        }
      }
    } catch (e) {
      console.warn("[OKX] Failed to fetch account balance:", (e as Error).message);
    }

    try {
      const funding = await this.fetchAssetBalancesCached();
      this.latestRawPayloads.assetBalances = funding;

      for (const balance of funding) {
        if (parseFloat(balance.bal) === 0) continue;

        results.push({
          exchange: "okx",
          accountScope: "funding",
          asset: balance.ccy.toUpperCase(),
          available: toDecimalStr(balance.availBal),
          locked: toDecimalStr(balance.frozenBal),
          total: toDecimalStr(balance.bal),
          ts: now,
        });
      }
    } catch (e) {
      console.warn("[OKX] Failed to fetch funding balance:", (e as Error).message);
    }

    return results;
  }

  async getHoldings(): Promise<NormalizedHolding[]> {
    const now = Date.now();
    const [accounts, savings, spotInstruments, reportingContext] = await Promise.all([
      this.fetchAccountBalanceCached().catch(() => []),
      this.fetchSavingsBalanceCached().catch(() => []),
      fetchOkxSpotInstruments(this.forceRefresh).catch(() => []),
      fetchReportingQuoteContext(this.forceRefresh).catch(() => ({
        reportingQuoteAsset: "USD" as const,
        quoteToUsdRates: { USD: "1" },
        warnings: ["Failed to fetch quote conversion context."],
        fetchedAt: now,
      })),
    ]);

    const rawAssetSources: Record<string, unknown> = {};
    this.latestRawPayloads.holdings = {
      accountBalance: accounts,
      savingsBalance: savings,
      reportingContext,
    };

    const accountDetails = accounts.flatMap((account) => account.details);
    const assets = new Set<string>();

    for (const detail of accountDetails) {
      const asset = detail.ccy.toUpperCase();
      if (STABLE_ASSETS.has(asset)) continue;
      if (parseFloat(detail.cashBal) > 0) {
        assets.add(asset);
      }
    }

    for (const row of savings) {
      if (parseFloat(row.amt) > 0) {
        assets.add(row.ccy.toUpperCase());
      }
    }

    const holdings: NormalizedHolding[] = [];
    for (const asset of assets) {
      try {
        const built = await this.buildHoldingForAsset(
          asset,
          accountDetails.find((detail) => detail.ccy.toUpperCase() === asset) ?? null,
          savings.find((row) => row.ccy.toUpperCase() === asset) ?? null,
          spotInstruments,
          reportingContext
        );

        if (built) {
          rawAssetSources[asset] = built.rawSources;
          holdings.push(built.holding);
        }
      } catch (error) {
        console.warn(`[OKX] Failed to build holding for ${asset}:`, (error as Error).message);
      }
    }

    this.latestRawPayloads.holdingSources = rawAssetSources;
    return holdings;
  }

  async getPositions(): Promise<NormalizedPosition[]> {
    try {
      const positions = await this.fetchPositionsCached();
      this.latestRawPayloads.positions = positions;

      return positions
        .filter((position) => parseFloat(position.pos) !== 0)
        .map((position) => {
          const baseAsset = getBaseAssetFromInstId(position.instId);
          const quoteAsset =
            position.quoteCcy?.toUpperCase() ??
            getQuoteAssetFromInstId(position.instId) ??
            "USDT";

          const posNum = parseFloat(position.pos);
          const side = posNum > 0 ? "long" : posNum < 0 ? "short" : "flat";

          return {
            exchange: "okx",
            instrumentType: "perp",
            canonicalAsset: baseAsset,
            baseAsset,
            quoteAsset,
            symbolNative: position.instId,
            side,
            quantity: toDecimalStr(position.pos),
            quantityAbs: toDecimalStr(Math.abs(posNum).toString()),
            entryPrice: position.avgPx ? toDecimalStr(position.avgPx) : undefined,
            markPrice: position.markPx ? toDecimalStr(position.markPx) : undefined,
            liquidationPrice: position.liqPx ? toDecimalStr(position.liqPx) : undefined,
            leverage: position.lever ? toDecimalStr(position.lever) : undefined,
            notional: position.notionalUsd
              ? toDecimalStr(position.notionalUsd)
              : undefined,
            marginMode: position.mgnMode,
            unrealizedPnl: position.upl ? toDecimalStr(position.upl) : undefined,
            realizedPnl: position.realizedPnl
              ? toDecimalStr(position.realizedPnl)
              : undefined,
            ts: position.uTime ? toUnixMs(position.uTime) : Date.now(),
            openedAtMs: position.cTime ? toUnixMs(position.cTime) : null,
          };
        });
    } catch (e) {
      console.warn("[OKX] Failed to fetch positions:", (e as Error).message);
      return [];
    }
  }

  async getRecentEvents(params?: {
    sinceTs?: number;
    limit?: number;
  }): Promise<NormalizedEvent[]> {
    try {
      const reqParams: Record<string, string> = {
        limit: String(params?.limit ?? 50),
      };
      if (params?.sinceTs) {
        reqParams.begin = String(params.sinceTs);
      }

      const bills = params?.sinceTs
        ? await okxRequest<OkxAccountBill[]>("GET", "/api/v5/account/bills", reqParams)
        : await this.fetchAccountBillsCached("default");
      this.latestRawPayloads.events = bills;

      return bills.map((bill) => {
        const base = getBaseAssetFromInstId(bill.instId || bill.ccy);
        const quoteAsset = getQuoteAssetFromInstId(bill.instId);

        return {
          exchange: "okx",
          eventType: "unknown",
          canonicalAsset: base,
          baseAsset: base,
          quoteAsset: quoteAsset ?? undefined,
          symbolNative: bill.instId || undefined,
          amount: toDecimalStr(bill.balChg),
          feeAsset: bill.ccy?.toUpperCase(),
          feeAmount: bill.fee ? toDecimalStr(bill.fee) : undefined,
          ts: toUnixMs(bill.ts),
          metadata: { billId: bill.billId, subType: bill.subType },
        };
      });
    } catch (e) {
      console.warn("[OKX] Failed to fetch events:", (e as Error).message);
      return [];
    }
  }

  private async buildHoldingForAsset(
    asset: string,
    accountDetail: OkxBalanceDetail | null,
    savingsRow: OkxSavingsBalance | null,
    spotInstruments: OkxPublicInstrument[],
    reportingContext: ReportingQuoteContext
  ): Promise<BuiltHolding | null> {
    const spotQty = accountDetail ? new Decimal(accountDetail.cashBal || "0") : new Decimal(0);
    const earnQty = savingsRow ? new Decimal(savingsRow.amt || "0") : new Decimal(0);
    const totalQty = spotQty.plus(earnQty);

    if (totalQty.lte(0)) {
      return null;
    }

    const warnings = [...reportingContext.warnings];

    const [rewardHistory, fillContext] = await Promise.all([
      this.fetchRewardHistory(asset),
      this.fetchSpotFillsForAsset(asset, spotInstruments),
    ]);

    warnings.push(...fillContext.warnings);
    const costBasis = reconstructCostBasisFromFills(
      asset,
      fillContext.fills,
      reportingContext
    );
    warnings.push(...costBasis.warnings);

    const tickerInstId =
      fillContext.instrument?.instId ??
      fillContext.candidates[0]?.instId ??
      null;
    const ticker = tickerInstId
      ? await fetchOkxTicker(tickerInstId, this.forceRefresh)
      : null;

    const tickerBid = ticker?.bidPx ? new Decimal(ticker.bidPx) : null;
    const tickerAsk = ticker?.askPx ? new Decimal(ticker.askPx) : null;
    let markPriceUsd: Decimal | null =
      tickerBid && tickerAsk && tickerBid.gt(0) && tickerAsk.gt(0)
        ? tickerBid.plus(tickerAsk).div(2)
        : ticker?.last
          ? new Decimal(ticker.last)
          : null;
    let markPriceSource =
      ticker && tickerBid && tickerAsk && tickerBid.gt(0) && tickerAsk.gt(0)
        ? `okx_ticker_mid:${ticker.instId}`
        : ticker
          ? `okx_ticker_last:${ticker.instId}`
          : undefined;

    if (!markPriceUsd && accountDetail?.eqUsd && totalQty.gt(0)) {
      markPriceUsd = new Decimal(accountDetail.eqUsd).div(totalQty);
      markPriceSource = "okx_account_balance_eqUsd";
    }

    let rewardBase = savingsRow?.earnings
      ? new Decimal(savingsRow.earnings)
      : null;
    const rewardHistoryBase = rewardHistory.reduce(
      (sum, row) => sum.plus(new Decimal(row.earnings)),
      new Decimal(0)
    );

    if (!rewardBase && rewardHistory.length > 0) {
      rewardBase = rewardHistoryBase;
    } else if (
      rewardBase &&
      rewardHistory.length > 0 &&
      rewardBase.minus(rewardHistoryBase).abs().greaterThan("0.000001")
    ) {
      warnings.push(
        `Reward balance/history mismatch on OKX ${asset}: balance=${rewardBase.toString()} history=${rewardHistoryBase.toString()}.`
      );
    }

    let principalQty = costBasis.principalQty;
    if (!principalQty && rewardBase) {
      principalQty = Decimal.max(new Decimal(0), totalQty.minus(rewardBase));
    }

    let avgEntryUsd = costBasis.avgEntryUsd;
    let avgEntrySource: NormalizedHolding["avgEntrySource"] = costBasis.avgEntryUsd
      ? "fills_weighted_average"
      : "unavailable";

    if (!avgEntryUsd && accountDetail?.accAvgPx) {
      avgEntryUsd = new Decimal(accountDetail.accAvgPx);
      avgEntrySource = "account_balance_accAvgPx";
    }

    if (!avgEntryUsd) {
      warnings.push(`Unable to determine OKX avg entry for ${asset}.`);
    }

    if (!rewardBase && principalQty) {
      const impliedRewards = totalQty.minus(principalQty);
      if (impliedRewards.greaterThan(0)) {
        rewardBase = impliedRewards;
      }
    }

    const rewardQuoteValue =
      rewardBase && markPriceUsd ? rewardBase.mul(markPriceUsd) : null;
    const currentValueUsd = markPriceUsd ? totalQty.mul(markPriceUsd) : null;

    const openedAtMs =
      costBasis.openedAtMs ??
      (rewardHistory.length > 0 ? toUnixMs(rewardHistory[rewardHistory.length - 1].ts) : null);

    console.log(
      `[OKX] ${asset} rewardRecords=${rewardHistory.length} fills=${fillContext.fills.length} avgEntryUsd=${avgEntryUsd?.toFixed(6) ?? "null"} principalQty=${principalQty?.toString() ?? "null"}`
    );

    const holding: NormalizedHolding = {
      exchange: "okx",
      instrumentType: earnQty.gt(0) ? "earn_position" : "spot",
      canonicalAsset: asset,
      baseAsset: asset,
      quoteAsset: "USD",
      symbolNative: tickerInstId,
      quantity: totalQty.toString(),
      entryPrice: normalizeDecimalOrNull(avgEntryUsd),
      markPrice: normalizeDecimalOrNull(markPriceUsd),
      usdValue: normalizeDecimalOrNull(currentValueUsd),
      apr: savingsRow?.rate ? toDecimalStr(savingsRow.rate) : undefined,
      productName:
        earnQty.gt(0) && spotQty.gt(0)
          ? `OKX Spot + Simple Earn ${asset}`
          : earnQty.gt(0)
            ? `OKX Simple Earn ${asset}`
            : `OKX Spot ${asset}`,
      accountScope: earnQty.gt(0) ? "earn" : "unified",
      ts: Date.now(),
      openedAtMs,
      principalQuantity: normalizeDecimalOrNull(principalQty),
      rewardQuantity: normalizeDecimalOrNull(rewardBase),
      rewardQuoteValue: normalizeDecimalOrNull(rewardQuoteValue),
      feeQuoteValue: normalizeDecimalOrNull(costBasis.totalFeesUsd),
      realizedPnlQuoteValue: normalizeDecimalOrNull(costBasis.realizedPnlUsd),
      avgEntrySource,
      markPriceSource,
      tradeQuoteAsset:
        costBasis.tradeQuoteAsset ??
        fillContext.instrument?.tradeQuoteCcyList?.[0] ??
        fillContext.instrument?.quoteCcy ??
        null,
      warnings: warnings.length > 0 ? warnings : undefined,
    };

    return {
      holding,
      rawSources: {
        accountDetail,
        savingsRow,
        rewardHistory,
        fills: fillContext.fills,
        ticker,
        reportingContext,
      },
    };
  }

  private async fetchRewardHistory(asset: string): Promise<OkxSavingsLendingHistory[]> {
    try {
      const cached = getCacheValue(
        _rewardHistoryCache.get(asset),
        REWARDS_TTL_MS,
        this.forceRefresh
      );
      if (cached) {
        return cached;
      }

      const records = await okxRequest<OkxSavingsLendingHistory[]>(
        "GET",
        "/api/v5/finance/savings/lending-history",
        { ccy: asset, limit: "100" }
      );
      _rewardHistoryCache.set(asset, { ts: Date.now(), data: records });

      if (records.length === 100) {
        console.warn(`[OKX] Reward history for ${asset} hit limit=100; consider pagination if totals drift.`);
      }

      return records;
    } catch (error) {
      console.warn(`[OKX] Failed to fetch reward history for ${asset}:`, (error as Error).message);
      return [];
    }
  }

  private async fetchSpotFillsForAsset(
    asset: string,
    spotInstruments: OkxPublicInstrument[]
  ): Promise<{
    fills: OkxTradeFill[];
    instrument: OkxPublicInstrument | null;
    candidates: OkxPublicInstrument[];
    warnings: string[];
  }> {
    const warnings: string[] = [];
    const candidates = spotInstruments
      .filter((instrument) => {
        return (
          instrument.instType === "SPOT" &&
          instrument.baseCcy?.toUpperCase() === asset &&
          instrument.state !== "suspend"
        );
      })
      .sort((left, right) => preferredInstrumentOrder(left) - preferredInstrumentOrder(right));

    if (candidates.length === 0) {
      warnings.push(`No OKX spot instruments found for ${asset}.`);
      return { fills: [], instrument: null, candidates, warnings };
    }

    const preferredInstId = await this.findRecentSpotInstIdForAsset(asset).catch(
      (error: Error) => {
        warnings.push(`Failed OKX account bills lookup for ${asset}: ${error.message}`);
        return null;
      }
    );

    const instrument =
      candidates.find((candidate) => candidate.instId === preferredInstId) ??
      candidates[0] ??
      null;

    if (!instrument) {
      warnings.push(`No OKX instrument candidate selected for ${asset}.`);
      return { fills: [], instrument: null, candidates, warnings };
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const cached = getCacheValue(
          _fillsHistoryCache.get(instrument.instId),
          REWARDS_TTL_MS,
          this.forceRefresh
        );
        if (cached) {
          return { fills: cached, instrument, candidates, warnings };
        }

        const fills = await okxRequest<OkxTradeFill[]>(
          "GET",
          "/api/v5/trade/fills-history",
          { instType: "SPOT", instId: instrument.instId, limit: "100" }
        );
        _fillsHistoryCache.set(instrument.instId, { ts: Date.now(), data: fills });

        return { fills, instrument, candidates, warnings };
      } catch (error) {
        const message = (error as Error).message;
        if (attempt === 0 && (message.includes("50011") || message.includes("429"))) {
          await new Promise((resolve) => setTimeout(resolve, 400));
          continue;
        }
        warnings.push(`Failed OKX fills-history lookup for ${instrument.instId}: ${message}`);
        break;
      }
    }

    warnings.push(`No OKX spot fills found for ${asset}; avg entry may rely on exchange aggregates.`);
    return { fills: [], instrument, candidates, warnings };
  }

  private async findRecentSpotInstIdForAsset(asset: string): Promise<string | null> {
    const bills = await this.fetchAccountBillsCached(asset);

    for (const bill of bills) {
      if (bill.instType === "SPOT" && bill.instId) {
        return bill.instId;
      }
    }

    return null;
  }
}
