import Decimal from "decimal.js";
import type { NormalizedHolding, NormalizedPosition } from "./exchanges/types";
import { isZeroish } from "./exchanges/utils";
import { normalizeHolding, normalizePosition } from "./normalization";

// ─── Strategy group type ──────────────────────────────────

export interface HedgeStrategyGroup {
  strategyGroupId: string;
  strategyType: "spot_earn_plus_perp_short";
  status: "open" | "partially_closed" | "closed" | "unmatched" | "needs_review";
  canonicalAsset: string;
  primaryVenueLong: "okx" | "binance" | null;
  primaryVenueShort: "okx" | "binance" | null;

  longLegs: NormalizedHolding[];
  shortLegs: NormalizedPosition[];

  longBaseQty: string;
  shortBaseQtyAbs: string;
  hedgeRatio: string | null;
  netBaseExposure: string | null;

  crossQuote: boolean;
  quoteMismatchSummary: string | null;

  matchingConfidence: "high" | "medium" | "low";
  matchingReasons: string[];
  warnings: string[];

  openedAtMs: number | null;
  lastActivityAtMs: number | null;
}

// ─── Matching engine ──────────────────────────────────────

export function matchHedgePositions(
  holdings: NormalizedHolding[],
  positions: NormalizedPosition[]
): { groups: HedgeStrategyGroup[]; unmatchedHoldings: NormalizedHolding[]; unmatchedPositions: NormalizedPosition[] } {
  const groups: HedgeStrategyGroup[] = [];
  const usedHoldingIndices = new Set<number>();
  const usedPositionIndices = new Set<number>();

  // Index holdings by canonical asset
  const holdingsByAsset = new Map<string, { idx: number; h: NormalizedHolding }[]>();
  for (let i = 0; i < holdings.length; i++) {
    const h = holdings[i];
    if (isZeroish(h.quantity)) continue;
    const list = holdingsByAsset.get(h.canonicalAsset) ?? [];
    list.push({ idx: i, h });
    holdingsByAsset.set(h.canonicalAsset, list);
  }

  // For each short perp position, try to find matching long holdings
  for (let pi = 0; pi < positions.length; pi++) {
    const pos = positions[pi];
    if (pos.side !== "short") continue;
    if (isZeroish(pos.quantityAbs)) continue;

    const asset = pos.canonicalAsset;
    const candidateLongs = holdingsByAsset.get(asset);
    if (!candidateLongs || candidateLongs.length === 0) continue;

    // Aggregate all long holdings for this asset
    const matchedLongs: NormalizedHolding[] = [];
    let totalLongQty = new Decimal(0);

    for (const { idx, h } of candidateLongs) {
      if (usedHoldingIndices.has(idx)) continue;
      matchedLongs.push(h);
      totalLongQty = totalLongQty.plus(new Decimal(h.quantity));
      usedHoldingIndices.add(idx);
    }

    if (matchedLongs.length === 0 || totalLongQty.isZero()) continue;

    usedPositionIndices.add(pi);

    const shortQtyAbs = new Decimal(pos.quantityAbs);
    const hedgeRatio = totalLongQty.isZero()
      ? null
      : shortQtyAbs.div(totalLongQty).toFixed(4);
    const netExposure = totalLongQty.minus(shortQtyAbs).toFixed(8);

    // Determine cross-quote
    const posNorm = normalizePosition(pos);
    const holdNorms = matchedLongs.map(normalizeHolding);

    const longQuotes = new Set(
      holdNorms.map((n) => n.quoteAsset).filter(Boolean)
    );
    const shortQuote = posNorm.quoteAsset;
    const crossQuote =
      longQuotes.size > 0 &&
      shortQuote !== null &&
      !longQuotes.has(shortQuote);

    const quoteMismatchSummary = crossQuote
      ? `${[...longQuotes].join("/")} vs ${shortQuote}`
      : null;

    // Confidence
    const hedgeRatioNum = hedgeRatio ? parseFloat(hedgeRatio) : 0;
    const reasons: string[] = [];
    const warnings = new Set<string>();
    let confidence: "high" | "medium" | "low" = "high";

    reasons.push(`Same canonical asset: ${asset}`);
    reasons.push("Complementary direction: long/yield + short perp");

    if (hedgeRatioNum >= 0.95 && hedgeRatioNum <= 1.05) {
      reasons.push("Tight hedge ratio");
    } else if (hedgeRatioNum >= 0.85 && hedgeRatioNum <= 1.15) {
      confidence = "medium";
      warnings.add("Hedge ratio drifted outside ideal range");
    } else {
      confidence = "low";
      warnings.add("Long and short legs differ materially in base size");
    }

    if (crossQuote) {
      warnings.add(
        `Cross-quote hedge detected: ${quoteMismatchSummary}. Do not assume perfect price parity.`
      );
      if (confidence === "high") confidence = "medium";
    }

    for (const warning of matchedLongs.flatMap((holding) => holding.warnings ?? [])) {
      warnings.add(warning);
    }
    for (const warning of pos.warnings ?? []) {
      warnings.add(warning);
    }

    const openTimestamps = [
      ...matchedLongs.map((holding) => holding.openedAtMs ?? holding.ts),
      pos.openedAtMs ?? pos.ts,
    ].filter((value): value is number => Boolean(value));
    const activityTimestamps = [
      ...matchedLongs.map((holding) => holding.ts),
      pos.ts,
    ].filter((value): value is number => Boolean(value));
    const earliest =
      openTimestamps.length > 0 ? Math.min(...openTimestamps) : Date.now();
    const latest =
      activityTimestamps.length > 0 ? Math.max(...activityTimestamps) : earliest;

    groups.push({
      strategyGroupId: `strategy:spot_earn_plus_perp_short:${asset}:${earliest}:1`,
      strategyType: "spot_earn_plus_perp_short",
      status: "open",
      canonicalAsset: asset,
      primaryVenueLong: matchedLongs[0]?.exchange ?? null,
      primaryVenueShort: pos.exchange,
      longLegs: matchedLongs,
      shortLegs: [pos],
      longBaseQty: totalLongQty.toString(),
      shortBaseQtyAbs: shortQtyAbs.toString(),
      hedgeRatio,
      netBaseExposure: netExposure,
      crossQuote,
      quoteMismatchSummary,
      matchingConfidence: confidence,
      matchingReasons: reasons,
      warnings: [...warnings],
      openedAtMs: earliest,
      lastActivityAtMs: latest,
    });
  }

  // Collect unmatched
  const unmatchedHoldings = holdings.filter((_, i) => !usedHoldingIndices.has(i));
  const unmatchedPositions = positions.filter((_, i) => !usedPositionIndices.has(i));

  return { groups, unmatchedHoldings, unmatchedPositions };
}
