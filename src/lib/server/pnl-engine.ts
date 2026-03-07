import Decimal from "decimal.js";
import type { HedgeStrategyGroup } from "./matching";
import type {
  NormalizedEvent,
  NormalizedHolding,
  NormalizedPosition,
} from "./exchanges/types";
import {
  getQuoteToUsdRate,
  type ReportingQuoteContext,
} from "./market-data";

type PnlDisplayMode =
  | "single-quote"
  | "cross-quote-converted"
  | "cross-quote-unconverted";

export interface PnlValueSet {
  singleQuoteValue?: string | null;
  longQuoteValue?: string | null;
  shortQuoteValue?: string | null;
  displayMode: PnlDisplayMode;
}

export interface PnlComponent {
  label: string;
  value: PnlValueSet;
  includedInRunningNet: boolean;
  includedInRealizedNet: boolean;
  includedInCarryNet: boolean;
}

export interface HedgePnlBreakdown {
  strategyGroupId: string;
  canonicalAsset: string;
  asOfMs: number;
  crossQuote: boolean;
  quoteContext: {
    longQuoteAsset: string | null;
    shortQuoteAsset: string | null;
    reportingQuoteAsset: string;
    shortQuoteToReportingRate: string | null;
    pnlAggregationMode: PnlDisplayMode;
    warning?: string | null;
  };
  components: {
    longUnrealized: PnlComponent;
    longRealized: PnlComponent;
    shortUnrealized: PnlComponent;
    shortRealized: PnlComponent;
    rewards: PnlComponent;
    funding: PnlComponent;
    fees: PnlComponent;
  };
  derived: {
    runningNetPnl: PnlValueSet;
    realizedNetPnl: PnlValueSet;
    carryNetPnl: PnlValueSet;
    closeNowEstimatedPnl: PnlValueSet;
    hedgeRatio: string | null;
    netBaseExposure: string | null;
  };
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
  warnings: string[];
}

export interface HedgeDashboardMetrics {
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

interface AggregatedLongContext {
  currentQty: Decimal;
  principalQty: Decimal | null;
  avgEntry: Decimal | null;
  markPrice: Decimal | null;
  rewardsBase: Decimal | null;
  rewardsQuote: Decimal | null;
  fees: Decimal | null;
  realized: Decimal | null;
  currentValue: Decimal | null;
  quoteAsset: string | null;
  warnings: string[];
}

interface AggregatedShortContext {
  qtyAbs: Decimal;
  avgEntry: Decimal | null;
  markPrice: Decimal | null;
  unrealizedUsd: Decimal | null;
  realizedUsd: Decimal | null;
  fundingUsd: Decimal | null;
  feesUsd: Decimal | null;
  currentValueUsd: Decimal | null;
  quoteAsset: string | null;
  quoteToReportingRate: Decimal | null;
  warnings: string[];
}

function decimalOrNull(value: string | null | undefined): Decimal | null {
  if (value === undefined || value === null || value === "") return null;
  return new Decimal(value);
}

function decimalToString(value: Decimal | null, dp = 2): string | null {
  return value ? value.toFixed(dp) : null;
}

function baseDecimalToString(value: Decimal | null): string | null {
  return value ? value.toString() : null;
}

function uniqueWarnings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function buildValueSet(params: {
  displayMode: PnlDisplayMode;
  single?: Decimal | null;
  long?: Decimal | null;
  short?: Decimal | null;
}): PnlValueSet {
  return {
    singleQuoteValue: decimalToString(params.single ?? null),
    longQuoteValue: decimalToString(params.long ?? null),
    shortQuoteValue: decimalToString(params.short ?? null),
    displayMode: params.displayMode,
  };
}

function sumKnown(values: Array<Decimal | null>): Decimal | null {
  const known = values.filter((value): value is Decimal => value !== null);
  if (known.length === 0) return null;
  return known.reduce((sum, value) => sum.plus(value), new Decimal(0));
}

function aggregateLongLegs(longLegs: NormalizedHolding[]): AggregatedLongContext {
  let currentQty = new Decimal(0);
  let principalQty = new Decimal(0);
  let principalCost = new Decimal(0);
  let markedQty = new Decimal(0);
  let markedValue = new Decimal(0);
  let rewardsBase = new Decimal(0);
  let rewardsQuote = new Decimal(0);
  let fees = new Decimal(0);
  let realized = new Decimal(0);
  let currentValue = new Decimal(0);
  let hasRewardData = false;
  let hasRewardQuoteData = false;
  let hasFeeData = false;
  let hasRealizedData = false;
  let hasCurrentValueData = false;
  const quoteAssets = new Set<string>();
  const warnings: string[] = [];

  for (const leg of longLegs) {
    const legQty = new Decimal(leg.quantity);
    currentQty = currentQty.plus(legQty);

    const rewardQty = decimalOrNull(leg.rewardQuantity) ?? new Decimal(0);
    if (leg.rewardQuantity !== undefined) {
      hasRewardData = true;
    }
    const legPrincipalQty =
      decimalOrNull(leg.principalQuantity) ??
      Decimal.max(new Decimal(0), legQty.minus(rewardQty));
    principalQty = principalQty.plus(legPrincipalQty);

    const legEntry = decimalOrNull(leg.entryPrice);
    if (legEntry && legPrincipalQty.gt(0)) {
      principalCost = principalCost.plus(legEntry.mul(legPrincipalQty));
    }

    const legMark = decimalOrNull(leg.markPrice);
    if (legMark && legQty.gt(0)) {
      markedQty = markedQty.plus(legQty);
      markedValue = markedValue.plus(legMark.mul(legQty));
    }

    rewardsBase = rewardsBase.plus(rewardQty);
    if (leg.rewardQuoteValue !== undefined) {
      hasRewardQuoteData = true;
    }
    rewardsQuote = rewardsQuote.plus(
      decimalOrNull(leg.rewardQuoteValue) ??
        (rewardQty.gt(0) && legMark ? rewardQty.mul(legMark) : new Decimal(0))
    );
    if (leg.feeQuoteValue !== undefined) {
      hasFeeData = true;
    }
    fees = fees.plus(decimalOrNull(leg.feeQuoteValue) ?? new Decimal(0));
    if (leg.realizedPnlQuoteValue !== undefined) {
      hasRealizedData = true;
    }
    realized = realized.plus(
      decimalOrNull(leg.realizedPnlQuoteValue) ?? new Decimal(0)
    );
    if (leg.usdValue !== undefined || legMark) {
      hasCurrentValueData = true;
    }
    currentValue = currentValue.plus(
      decimalOrNull(leg.usdValue) ?? (legMark ? legQty.mul(legMark) : new Decimal(0))
    );

    if (leg.quoteAsset) {
      quoteAssets.add(leg.quoteAsset.toUpperCase());
    }
    warnings.push(...(leg.warnings ?? []));
  }

  return {
    currentQty,
    principalQty: principalQty.gt(0) ? principalQty : null,
    avgEntry:
      principalQty.gt(0) && principalCost.gt(0)
        ? principalCost.div(principalQty)
        : null,
    markPrice:
      markedQty.gt(0) && markedValue.gt(0) ? markedValue.div(markedQty) : null,
    rewardsBase: hasRewardData ? rewardsBase : null,
    rewardsQuote: hasRewardData || hasRewardQuoteData ? rewardsQuote : null,
    fees: hasFeeData ? fees : null,
    realized: hasRealizedData ? realized : null,
    currentValue: hasCurrentValueData && currentValue.gt(0) ? currentValue : null,
    quoteAsset: quoteAssets.size === 1 ? [...quoteAssets][0] : null,
    warnings,
  };
}

function aggregateShortLegs(
  shortLegs: NormalizedPosition[],
  events: NormalizedEvent[],
  openedAtMs: number | null,
  reportingContext: ReportingQuoteContext
): AggregatedShortContext {
  let qtyAbs = new Decimal(0);
  let entryCost = new Decimal(0);
  let markValue = new Decimal(0);
  let rawUnrealized = new Decimal(0);
  let rawPositionRealized = new Decimal(0);
  const quoteAssets = new Set<string>();
  const warnings: string[] = [];
  const shortSymbols = new Set(shortLegs.map((leg) => leg.symbolNative));

  for (const leg of shortLegs) {
    const legQty = new Decimal(leg.quantityAbs);
    qtyAbs = qtyAbs.plus(legQty);

    const legEntry = decimalOrNull(leg.entryPrice);
    if (legEntry) {
      entryCost = entryCost.plus(legEntry.mul(legQty));
    }

    const legMark = decimalOrNull(leg.markPrice);
    if (legMark) {
      markValue = markValue.plus(legMark.mul(legQty));
    }

    rawUnrealized = rawUnrealized.plus(
      decimalOrNull(leg.unrealizedPnl) ??
        (legEntry && legMark ? legQty.mul(legEntry.minus(legMark)) : new Decimal(0))
    );
    rawPositionRealized = rawPositionRealized.plus(
      decimalOrNull(leg.realizedPnl) ?? new Decimal(0)
    );

    quoteAssets.add(leg.quoteAsset.toUpperCase());
    warnings.push(...(leg.warnings ?? []));
  }

  const shortQuoteAsset = quoteAssets.size === 1 ? [...quoteAssets][0] : null;
  const quoteToReportingRate = getQuoteToUsdRate(shortQuoteAsset, reportingContext);
  if (!quoteToReportingRate) {
    warnings.push(
      `Missing ${shortQuoteAsset ?? "unknown"}-USD conversion for Binance short leg.`
    );
  }

  const relevantEvents = events.filter((event) => {
    if (event.exchange !== "binance") return false;
    if (event.symbolNative && shortSymbols.has(event.symbolNative)) {
      return openedAtMs === null || event.ts >= openedAtMs;
    }
    return false;
  });

  const rawFunding = relevantEvents
    .filter((event) => event.eventType === "funding_fee")
    .reduce((sum, event) => sum.plus(new Decimal(event.amount)), new Decimal(0));

  const rawFees = relevantEvents
    .filter((event) => event.eventType === "fee")
    .reduce((sum, event) => sum.plus(new Decimal(event.amount)), new Decimal(0));

  const rawRealizedEvents = relevantEvents
    .filter(
      (event) =>
        event.eventType === "trade_fill" &&
        String(event.metadata?.incomeType ?? "").toUpperCase() === "REALIZED_PNL"
    )
    .reduce((sum, event) => sum.plus(new Decimal(event.amount)), new Decimal(0));

  const avgEntry = qtyAbs.gt(0) && entryCost.gt(0) ? entryCost.div(qtyAbs) : null;
  const markPrice = qtyAbs.gt(0) && markValue.gt(0) ? markValue.div(qtyAbs) : null;
  const currentValueRaw = markPrice ? qtyAbs.mul(markPrice) : null;

  return {
    qtyAbs,
    avgEntry,
    markPrice,
    unrealizedUsd:
      quoteToReportingRate ? rawUnrealized.mul(quoteToReportingRate) : null,
    realizedUsd: quoteToReportingRate
      ? (rawPositionRealized.abs().gt(0) ? rawPositionRealized : rawRealizedEvents).mul(
          quoteToReportingRate
        )
      : null,
    fundingUsd: quoteToReportingRate ? rawFunding.mul(quoteToReportingRate) : null,
    feesUsd: quoteToReportingRate ? rawFees.mul(quoteToReportingRate) : null,
    currentValueUsd:
      currentValueRaw && quoteToReportingRate
        ? currentValueRaw.mul(quoteToReportingRate)
        : null,
    quoteAsset: shortQuoteAsset,
    quoteToReportingRate,
    warnings,
  };
}

export function computePnl(
  group: HedgeStrategyGroup,
  events: NormalizedEvent[],
  reportingContext: ReportingQuoteContext
): HedgePnlBreakdown {
  const asOfMs = Date.now();
  const shortLeg = group.shortLegs[0];
  const longContext = aggregateLongLegs(group.longLegs);
  const shortContext = aggregateShortLegs(
    group.shortLegs,
    events,
    group.openedAtMs,
    reportingContext
  );

  const crossQuote =
    Boolean(longContext.quoteAsset) &&
    Boolean(shortContext.quoteAsset) &&
    longContext.quoteAsset !== shortContext.quoteAsset;

  const canConvertShort = Boolean(shortContext.quoteToReportingRate);
  const displayMode: PnlDisplayMode =
    crossQuote && canConvertShort
      ? "cross-quote-converted"
      : crossQuote
        ? "cross-quote-unconverted"
        : "single-quote";

  const warnings = uniqueWarnings([
    ...group.warnings,
    ...longContext.warnings,
    ...shortContext.warnings,
  ]);

  const longUnrealized = longContext.principalQty &&
    longContext.avgEntry &&
    longContext.markPrice
      ? longContext.principalQty.mul(longContext.markPrice.minus(longContext.avgEntry))
      : null;

  if (!longUnrealized) {
    warnings.push("Unable to compute full OKX long unrealized PnL because avg entry or mark price is missing.");
  }

  if (shortContext.unrealizedUsd === null) {
    warnings.push("Unable to compute full Binance short unrealized PnL because quote conversion is missing.");
  }

  const longRealized = longContext.realized;
  const rewards = longContext.rewardsQuote;
  const funding = shortContext.fundingUsd;
  const fees = sumKnown([longContext.fees, shortContext.feesUsd]);

  const runningNet = sumKnown([
    longUnrealized,
    longRealized,
    shortContext.unrealizedUsd,
    shortContext.realizedUsd,
    rewards,
    funding,
    fees,
  ]);

  const realizedNet = sumKnown([
    longRealized,
    shortContext.realizedUsd,
    rewards,
    funding,
    fees,
  ]);

  const carryNet = sumKnown([rewards, funding, fees]);
  const closeNowEstimated = runningNet;

  if (
    [longUnrealized, shortContext.unrealizedUsd, rewards, funding, fees].some(
      (value) => value === null
    )
  ) {
    warnings.push("Net PnL is partial if any warning above indicates a missing component.");
  }

  console.log(
    `[PnL] ${group.canonicalAsset} okxLong=${decimalToString(longUnrealized) ?? "null"} short=${decimalToString(shortContext.unrealizedUsd) ?? "null"} rewards=${decimalToString(rewards) ?? "null"} funding=${decimalToString(funding) ?? "null"} fees=${decimalToString(fees) ?? "null"} net=${decimalToString(runningNet) ?? "null"}`
  );

  return {
    strategyGroupId: group.strategyGroupId,
    canonicalAsset: group.canonicalAsset,
    asOfMs,
    crossQuote,
    quoteContext: {
      longQuoteAsset: longContext.quoteAsset,
      shortQuoteAsset: shortContext.quoteAsset,
      reportingQuoteAsset: reportingContext.reportingQuoteAsset,
      shortQuoteToReportingRate: shortContext.quoteToReportingRate?.toString() ?? null,
      pnlAggregationMode: displayMode,
      warning: crossQuote
        ? canConvertShort
          ? `Cross-quote PnL converted to USD using live ${shortContext.quoteAsset}-USD pricing.`
          : "Cross-quote PnL cannot be merged because quote conversion is unavailable."
        : null,
    },
    components: {
      longUnrealized: {
        label: "Long Unrealized",
        value: buildValueSet({
          displayMode,
          single: longUnrealized,
          long: longUnrealized,
        }),
        includedInRunningNet: true,
        includedInRealizedNet: false,
        includedInCarryNet: false,
      },
      longRealized: {
        label: "Long Realized",
        value: buildValueSet({
          displayMode,
          single: longRealized,
          long: longRealized,
        }),
        includedInRunningNet: true,
        includedInRealizedNet: true,
        includedInCarryNet: false,
      },
      shortUnrealized: {
        label: "Short Unrealized",
        value: buildValueSet({
          displayMode,
          single: shortContext.unrealizedUsd,
          short: shortContext.unrealizedUsd,
        }),
        includedInRunningNet: true,
        includedInRealizedNet: false,
        includedInCarryNet: false,
      },
      shortRealized: {
        label: "Short Realized",
        value: buildValueSet({
          displayMode,
          single: shortContext.realizedUsd,
          short: shortContext.realizedUsd,
        }),
        includedInRunningNet: true,
        includedInRealizedNet: true,
        includedInCarryNet: false,
      },
      rewards: {
        label: "Rewards",
        value: buildValueSet({
          displayMode,
          single: rewards,
          long: rewards,
        }),
        includedInRunningNet: true,
        includedInRealizedNet: true,
        includedInCarryNet: true,
      },
      funding: {
        label: "Funding",
        value: buildValueSet({
          displayMode,
          single: funding,
          short: funding,
        }),
        includedInRunningNet: true,
        includedInRealizedNet: true,
        includedInCarryNet: true,
      },
      fees: {
        label: "Fees",
        value: buildValueSet({
          displayMode,
          single: fees,
          long: longContext.fees,
          short: shortContext.feesUsd,
        }),
        includedInRunningNet: true,
        includedInRealizedNet: true,
        includedInCarryNet: true,
      },
    },
    derived: {
      runningNetPnl: buildValueSet({ displayMode, single: runningNet }),
      realizedNetPnl: buildValueSet({ displayMode, single: realizedNet }),
      carryNetPnl: buildValueSet({ displayMode, single: carryNet }),
      closeNowEstimatedPnl: buildValueSet({
        displayMode,
        single: closeNowEstimated,
      }),
      hedgeRatio: group.hedgeRatio,
      netBaseExposure: group.netBaseExposure,
    },
    summary: {
      okxAvgEntry: baseDecimalToString(longContext.avgEntry),
      okxMarkPrice: baseDecimalToString(longContext.markPrice),
      okxEarnedRewardsBase: baseDecimalToString(longContext.rewardsBase),
      okxEarnedRewardsQuote: decimalToString(rewards),
      okxLongPnl: decimalToString(longUnrealized),
      okxLongRealizedPnl: decimalToString(longRealized),
      binanceShortAvgEntry: baseDecimalToString(shortContext.avgEntry),
      binanceShortMarkPrice: baseDecimalToString(shortContext.markPrice),
      binanceShortPnl: decimalToString(shortContext.unrealizedUsd),
      binanceShortRealizedPnl: decimalToString(shortContext.realizedUsd),
      currentFundingRate: shortLeg?.fundingRate ?? null,
      fundingIntervalHours: shortLeg?.fundingIntervalHours ?? null,
      nextFundingTime: shortLeg?.nextFundingTime ?? null,
      okxFees: decimalToString(longContext.fees),
      binanceFees: decimalToString(shortContext.feesUsd),
      fundingPnl: decimalToString(funding),
      fees: decimalToString(fees),
      netPnl: decimalToString(runningNet),
      longCurrentValue: decimalToString(longContext.currentValue),
      shortCurrentValue: decimalToString(shortContext.currentValueUsd),
      lastRefreshedAt: asOfMs,
    },
    warnings: uniqueWarnings(warnings),
  };
}

export function buildDashboardMetrics(
  group: HedgeStrategyGroup,
  pnl: HedgePnlBreakdown
): HedgeDashboardMetrics {
  const shortLeg = group.shortLegs[0];

  const totalPositionSize = sumKnown([
    decimalOrNull(pnl.summary.longCurrentValue),
    decimalOrNull(pnl.summary.shortCurrentValue),
  ]);

  const carry = decimalOrNull(
    pnl.derived.carryNetPnl.singleQuoteValue ?? null
  );
  const netPnl = decimalOrNull(pnl.summary.netPnl);

  let netApy: string | null = null;
  if (carry && totalPositionSize && group.openedAtMs) {
    const daysOpen = Math.max(
      1,
      (Date.now() - group.openedAtMs) / (1000 * 60 * 60 * 24)
    );
    const annualized = carry
      .div(totalPositionSize.div(2))
      .mul(365)
      .div(daysOpen)
      .mul(100);
    netApy = annualized.toFixed(1);
  }

  let netPnlPercent: string | null = null;
  if (netPnl && totalPositionSize && !totalPositionSize.isZero()) {
    netPnlPercent = netPnl.div(totalPositionSize.div(2)).mul(100).toFixed(2);
  }

  return {
    strategyGroupId: group.strategyGroupId,
    canonicalAsset: group.canonicalAsset,
    status: group.status,
    totalPositionSize: decimalToString(totalPositionSize),
    longBaseQty: group.longBaseQty,
    shortBaseQtyAbs: group.shortBaseQtyAbs,
    hedgeRatio: group.hedgeRatio,
    netBaseExposure: group.netBaseExposure,
    longAvgEntry: pnl.summary.okxAvgEntry,
    longMarkPrice: pnl.summary.okxMarkPrice,
    shortAvgEntry: pnl.summary.binanceShortAvgEntry,
    shortMarkPrice: pnl.summary.binanceShortMarkPrice,
    shortLiquidationPrice: shortLeg?.liquidationPrice ?? null,
    shortLeverage: shortLeg?.leverage ?? null,
    shortMarginMode: shortLeg?.marginMode ?? null,
    currentFundingRate: pnl.summary.currentFundingRate,
    fundingIntervalHours: pnl.summary.fundingIntervalHours,
    nextFundingTime: pnl.summary.nextFundingTime,
    netPnl: pnl.summary.netPnl,
    netPnlPercent,
    longUnrealizedPnl: pnl.summary.okxLongPnl,
    shortUnrealizedPnl: pnl.summary.binanceShortPnl,
    shortRealizedPnl: pnl.summary.binanceShortRealizedPnl,
    totalRewards: pnl.summary.okxEarnedRewardsQuote,
    totalFunding: pnl.summary.fundingPnl,
    totalFees: pnl.summary.fees,
    netApy,
    crossQuote: pnl.crossQuote,
    warnings: pnl.warnings,
    livePrice: pnl.summary.binanceShortMarkPrice ?? pnl.summary.okxMarkPrice,
    okxAvgEntry: pnl.summary.okxAvgEntry,
    okxEarnedRewardsBase: pnl.summary.okxEarnedRewardsBase,
    okxEarnedRewardsQuote: pnl.summary.okxEarnedRewardsQuote,
    okxLongPnl: pnl.summary.okxLongPnl,
    okxFees: pnl.summary.okxFees,
    binanceFees: pnl.summary.binanceFees,
    fundingPnl: pnl.summary.fundingPnl,
    fees: pnl.summary.fees,
    reportingQuoteAsset: pnl.quoteContext.reportingQuoteAsset,
    lastRefreshedAt: pnl.summary.lastRefreshedAt,
  };
}
