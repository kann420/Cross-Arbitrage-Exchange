import type {
  NormalizedHolding,
  NormalizedPosition,
  HedgeDirectionHint,
  InstrumentType,
} from "./exchanges/types";

// ─── Quote classification ─────────────────────────────────

type QuoteFamily = "stable" | "fiat" | "crypto" | "unknown";

const STABLE_USD = new Set(["USDT", "USDC", "FDUSD", "USDG", "DAI", "BUSD"]);

export function classifyQuoteFamily(
  quoteAsset: string | null
): { quoteFamily: QuoteFamily; quoteAssetGroup: string | null } {
  if (!quoteAsset) return { quoteFamily: "unknown", quoteAssetGroup: null };
  const q = quoteAsset.toUpperCase();
  if (STABLE_USD.has(q)) return { quoteFamily: "stable", quoteAssetGroup: "stable-usd" };
  if (q === "USD") return { quoteFamily: "fiat", quoteAssetGroup: "fiat-usd" };
  if (q === "BTC") return { quoteFamily: "crypto", quoteAssetGroup: "crypto-btc" };
  if (q === "ETH") return { quoteFamily: "crypto", quoteAssetGroup: "crypto-eth" };
  return { quoteFamily: "unknown", quoteAssetGroup: null };
}

// ─── Canonical instrument ─────────────────────────────────

export interface CanonicalInstrument {
  exchange: "okx" | "binance";
  symbolNative: string | null;
  baseAsset: string;
  quoteAsset: string | null;
  instrumentType: InstrumentType;
  canonicalAsset: string;
  canonicalPair: string | null;
  canonicalInstrumentId: string;
  canonicalFamilyId: string;
  quoteFamily: QuoteFamily;
  quoteAssetGroup: string | null;
  hedgeDirectionHint: HedgeDirectionHint;
  hedgeComparable: boolean;
}

export function buildCanonicalPair(
  baseAsset: string,
  quoteAsset: string | null
): string | null {
  if (!quoteAsset) return null;
  return `${baseAsset}/${quoteAsset}`;
}

function buildCanonicalInstrumentId(
  exchange: string,
  instrumentType: string,
  canonicalPair: string | null,
  symbolNative: string | null
): string {
  const pair = canonicalPair ?? symbolNative ?? "UNKNOWN";
  return `${exchange}:${instrumentType}:${pair}`;
}

// ─── Normalize holding to canonical instrument ────────────

export function normalizeHolding(h: NormalizedHolding): CanonicalInstrument {
  const { quoteFamily, quoteAssetGroup } = classifyQuoteFamily(h.quoteAsset);
  const pair = buildCanonicalPair(h.baseAsset, h.quoteAsset);

  const dirHint: HedgeDirectionHint =
    h.instrumentType === "earn_position" ? "yield_exposure" : "long_exposure";

  return {
    exchange: h.exchange,
    symbolNative: h.symbolNative,
    baseAsset: h.baseAsset,
    quoteAsset: h.quoteAsset,
    instrumentType: h.instrumentType,
    canonicalAsset: h.canonicalAsset,
    canonicalPair: pair,
    canonicalInstrumentId: buildCanonicalInstrumentId(
      h.exchange,
      h.instrumentType,
      pair,
      h.symbolNative
    ),
    canonicalFamilyId: `asset:${h.canonicalAsset}`,
    quoteFamily,
    quoteAssetGroup,
    hedgeDirectionHint: dirHint,
    hedgeComparable: true,
  };
}

// ─── Normalize position to canonical instrument ───────────

export function normalizePosition(p: NormalizedPosition): CanonicalInstrument {
  const { quoteFamily, quoteAssetGroup } = classifyQuoteFamily(p.quoteAsset);
  const pair = buildCanonicalPair(p.baseAsset, p.quoteAsset);

  const dirHint: HedgeDirectionHint =
    p.side === "short"
      ? "short_exposure"
      : p.side === "long"
        ? "long_exposure"
        : "neutral";

  return {
    exchange: p.exchange,
    symbolNative: p.symbolNative,
    baseAsset: p.baseAsset,
    quoteAsset: p.quoteAsset,
    instrumentType: p.instrumentType,
    canonicalAsset: p.canonicalAsset,
    canonicalPair: pair,
    canonicalInstrumentId: buildCanonicalInstrumentId(
      p.exchange,
      p.instrumentType,
      pair,
      p.symbolNative
    ),
    canonicalFamilyId: `asset:${p.canonicalAsset}`,
    quoteFamily,
    quoteAssetGroup,
    hedgeDirectionHint: dirHint,
    hedgeComparable: p.side !== "flat",
  };
}
