# Skill: exchange-symbol-normalization

## Purpose
This skill defines how an AI agent should normalize symbols, assets, quote currencies, and instrument identifiers across exchanges for a cross-exchange hedge / carry / staking management app.

It is designed for Binance + OKX first, but the schema and rules are extensible to more exchanges later.

This skill exists because exchange symbols are often *not* directly comparable:
- OKX spot may use `KITE-USDG`
- Binance perpetual may use `KITEUSDT`
- Another product may use `KITE-USDT-SWAP`
- UI may need to display just `KITE`
- PnL engine may need to know that both legs share the same **base asset**, but not the same **quote asset**, instrument type, or settlement currency

Without strict normalization, agents may:
- match the wrong legs together
- calculate fake exposure parity
- assume USDG == USDT == USDC
- break historical grouping
- show misleading dashboard labels

This skill standardizes naming and prevents symbol confusion.

---

## Scope

### In scope
- Normalize symbols from Binance and OKX into a shared canonical schema
- Parse spot / margin / futures / perpetual / swap symbols
- Separate `baseAsset`, `quoteAsset`, `settleAsset`, and `instrumentType`
- Produce deterministic IDs used by adapters, matching logic, and dashboard DTOs
- Handle quote mismatches such as `USDG`, `USDT`, `USDC`, `FDUSD`
- Support cross-exchange comparison where instruments share the same base asset but use different quote assets
- Define matching eligibility rules for hedge grouping

### Out of scope
- Pricing conversion between quote currencies
- FX conversion logic
- Stablecoin depeg modeling
- PnL calculation itself
- Execution / order placement logic
- Product-specific APR/reward logic

---

## Core principles

1. **Base asset identity is primary**
   For hedge pairing, the most important first-pass identity is the base asset:
   - `KITE-USDG` spot on OKX
   - `KITEUSDT` perpetual on Binance
   Both share `baseAsset = KITE`.

2. **Quote assets are never assumed equivalent**
   `USDG`, `USDT`, `USDC`, and `FDUSD` are all distinct quote assets.
   They may be grouped into a broader "stable quote" family for UI hints, but never treated as numerically identical without explicit conversion logic.

3. **Instrument type matters**
   `KITE-USDG` spot is not the same instrument as `KITE-USDT-SWAP`.
   Shared base asset does not mean shared instrument.

4. **Canonical format must be deterministic**
   The same input symbol must always normalize to the same output.

5. **Normalization should preserve native details**
   Always keep the raw exchange symbol and raw exchange payload fields.

6. **Matching and normalization are related but separate**
   Symbol normalization prepares data.
   Hedge matching decides whether two normalized instruments belong to the same strategy.

---

## Canonical schema

Every parsed symbol / instrument must normalize into this schema:

```ts
type CanonicalInstrument = {
  exchange: "binance" | "okx";
  accountScope?: "spot" | "funding" | "earn" | "futures" | "swap" | "margin" | "unified" | "unknown";

  // Raw source
  symbolNative: string;           // e.g. "KITE-USDG", "KITEUSDT", "KITE-USDT-SWAP"
  instIdNative?: string;          // OKX-specific native instrument id if available
  rawBaseAsset?: string | null;
  rawQuoteAsset?: string | null;
  rawSettleAsset?: string | null;

  // Normalized identity
  baseAsset: string;              // e.g. "KITE"
  quoteAsset: string | null;      // e.g. "USDG", "USDT"
  settleAsset: string | null;     // e.g. "USDT" for some perp/swap products
  instrumentType: "spot" | "margin" | "perp" | "future" | "option" | "earn_position" | "unknown";

  // Exchange-specific subtyping
  venueProductType?: string | null;   // e.g. "SWAP", "SPOT", "SIMPLE_EARN", "USDT_PERP"

  // Canonical IDs
  canonicalAsset: string;         // usually baseAsset, e.g. "KITE"
  canonicalPair: string | null;   // e.g. "KITE/USDG", "KITE/USDT"
  canonicalInstrumentId: string;  // e.g. "okx:spot:KITE/USDG", "binance:perp:KITE/USDT"
  canonicalFamilyId: string;      // e.g. "asset:KITE"

  // Stable quote metadata
  quoteFamily: "stable" | "fiat" | "crypto" | "unknown";
  quoteAssetGroup: string | null; // e.g. "stable-usd", "fiat-usd", "crypto-btc"

  // Optional hints for hedge matching
  hedgeComparable: boolean;       // true if valid as a hedge leg candidate
  comparableReason?: string | null;
};
```

---

## Canonical naming rules

### 1. Asset casing
Always uppercase normalized asset symbols.

Examples:
- `kite` -> `KITE`
- `usdt` -> `USDT`
- `btc` -> `BTC`

### 2. Canonical asset
`canonicalAsset` is almost always the normalized base asset.

Examples:
- `KITE-USDG` -> `canonicalAsset = KITE`
- `BTCUSDT` -> `canonicalAsset = BTC`

### 3. Canonical pair
Use slash format:

- `KITE/USDG`
- `KITE/USDT`
- `BTC/USDC`

If quote asset is unknown, set `canonicalPair = null`.

### 4. Canonical instrument ID
Use:
`{exchange}:{instrumentType}:{canonicalPair}`

Examples:
- `okx:spot:KITE/USDG`
- `binance:perp:KITE/USDT`
- `okx:perp:BTC/USDT`

If pair is unavailable:
`{exchange}:{instrumentType}:{symbolNative}`

### 5. Canonical family ID
Use:
`asset:{baseAsset}`

Examples:
- `asset:KITE`
- `asset:BTC`

This is the top-level grouping key for cross-exchange hedge candidate discovery.

---

## Quote asset rules

### Distinct quote assets
Never collapse these into one exact asset:
- `USDG`
- `USDT`
- `USDC`
- `FDUSD`
- `DAI`

They may belong to the same quote group:
- `quoteFamily = stable`
- `quoteAssetGroup = stable-usd`

But they remain distinct assets.

### Example
- `KITE/USDG` and `KITE/USDT`
  - same `canonicalAsset = KITE`
  - different `quoteAsset`
  - same `quoteFamily = stable`
  - same `quoteAssetGroup = stable-usd`
  - potentially hedge-comparable, but not price-equivalent without conversion logic

### Required warning
When matching legs with different quote assets, the agent must preserve this warning:

`Cross-quote hedge detected: base asset matches, but quote assets differ (USDG vs USDT). Do not assume perfect price parity without explicit spread / conversion handling.`

---

## Instrument type rules

### Spot
Examples:
- OKX `KITE-USDG`
- Binance `BTCUSDT` in spot context

Normalize:
- `instrumentType = "spot"`

### Perpetual / swap
Examples:
- Binance USDT perpetual `KITEUSDT`
- OKX `KITE-USDT-SWAP`

Normalize:
- `instrumentType = "perp"`

### Future
Dated futures should use:
- `instrumentType = "future"`

### Earn / staking positions
If the exchange returns a yield-bearing position that references an underlying spot asset:
- `instrumentType = "earn_position"`

Examples:
- OKX Simple Earn KITE position
- Binance Simple Earn BTC position

Important:
An earn/staking position should still carry the underlying base asset:
- `baseAsset = KITE`
- quote may be null if the product does not expose a trade pair

---

## Exchange-specific parsing rules

## Binance parsing rules

### Spot symbols
Typical format:
- `BTCUSDT`
- `ETHUSDC`
- `KITEUSDT`

Agent must parse using official exchange metadata when available, not naive string splitting.

Preferred source fields:
- `baseAsset`
- `quoteAsset`
- `symbol`

If metadata exists:
- trust metadata over string heuristics

If metadata does not exist:
- use the exchange info symbol catalogue
- only as a fallback, infer by matching known quote suffixes

Known quote suffixes to try cautiously:
- `USDT`
- `USDC`
- `FDUSD`
- `BTC`
- `ETH`
- `BNB`

### Binance perpetuals
Usually also represented like:
- `BTCUSDT`
- `KITEUSDT`

But account context or endpoint type identifies this as futures/perp.

Therefore:
- do not infer spot vs perp from symbol text alone
- use endpoint context / market metadata / product catalog

Examples:
- symbol = `KITEUSDT`
- endpoint = futures position endpoint
- normalize to:
  - `baseAsset = KITE`
  - `quoteAsset = USDT`
  - `settleAsset = USDT`
  - `instrumentType = perp`
  - `canonicalInstrumentId = binance:perp:KITE/USDT`

---

## OKX parsing rules

### Spot / margin / swap instrument IDs
Typical formats:
- `KITE-USDG`
- `BTC-USDT`
- `BTC-USDT-SWAP`
- `ETH-USD-240628`

Preferred source fields:
- `instId`
- `instType`
- `baseCcy`
- `quoteCcy`
- `settleCcy`

Trust metadata fields over text parsing whenever available.

### OKX spot
Example:
- `instId = KITE-USDG`
- `instType = SPOT`

Normalize to:
- `baseAsset = KITE`
- `quoteAsset = USDG`
- `instrumentType = spot`
- `canonicalPair = KITE/USDG`

### OKX swap
Example:
- `instId = BTC-USDT-SWAP`
- `instType = SWAP`

Normalize to:
- `baseAsset = BTC`
- `quoteAsset = USDT`
- `settleAsset = USDT` if available
- `instrumentType = perp`

### OKX futures
Example:
- `instId = ETH-USD-240628`
- `instType = FUTURES`

Normalize to:
- `baseAsset = ETH`
- `quoteAsset = USD`
- `instrumentType = future`

### OKX earn / staking
If product payload identifies an earn balance but not a trade pair:
- use the product's underlying asset as `baseAsset`
- `quoteAsset = null`
- `instrumentType = earn_position`
- `canonicalPair = null`

Example:
- OKX Simple Earn KITE
- normalize to:
  - `baseAsset = KITE`
  - `instrumentType = earn_position`
  - `canonicalInstrumentId = okx:earn_position:KITE`

---

## Matching eligibility rules

Normalization does not automatically mean two positions should be grouped together.
It only gives the data needed for matching.

### First-pass hedge candidate eligibility
Two instruments are hedge-comparable candidates if:
- both have the same `canonicalAsset`
- both are hedge-relevant instrument types
- at least one side is a directional exposure leg
- neither side is missing a base asset

### Example: valid candidate pair
- OKX spot/staking: `KITE-USDG`
- Binance perp short: `KITEUSDT`

Why valid:
- both share `canonicalAsset = KITE`
- spot/earn leg gives long exposure
- perp leg gives short hedge exposure
- quote assets differ, but hedge comparison is still meaningful

### Example: invalid candidate pair
- OKX `BTC-USDG`
- Binance `ETHUSDT`

Why invalid:
- different `canonicalAsset`

### Cross-quote candidate rule
Two legs with the same base asset but different quote assets:
- may be matched as a strategy candidate
- must be tagged:
  - `crossQuote = true`
- must trigger a warning note for pricing and PnL layers

---

## Required derived fields for matching layer

The normalization layer should provide these helper fields to the matching engine:

```ts
type NormalizedMatchingHints = {
  canonicalAsset: string;      // e.g. KITE
  quoteAsset: string | null;   // e.g. USDG or USDT
  quoteAssetGroup: string | null; // e.g. stable-usd
  crossQuoteComparable: boolean;  // true if same base asset but quote mismatch still acceptable
  hedgeDirectionHint: "long_exposure" | "short_exposure" | "yield_exposure" | "neutral" | "unknown";
};
```

### Direction hint rules
- spot balance / spot holding -> `long_exposure`
- earn/staking position -> `yield_exposure`
- perp short position -> `short_exposure`
- perp long position -> `long_exposure`

This helps the matching engine understand that:
- OKX staking KITE
- Binance short KITE perp
are complementary legs

---

## Stable quote grouping rules

Use these groups for metadata only:

- `USDT`, `USDC`, `FDUSD`, `USDG`, `DAI` -> `quoteFamily = stable`, `quoteAssetGroup = stable-usd`
- `USD` -> `quoteFamily = fiat`, `quoteAssetGroup = fiat-usd`
- `BTC` -> `quoteFamily = crypto`, `quoteAssetGroup = crypto-btc`
- `ETH` -> `quoteFamily = crypto`, `quoteAssetGroup = crypto-eth`

These groups may be used for:
- UI badges
- warnings
- candidate matching hints

They must **not** be used as a substitute for conversion logic.

---

## UI-facing display rules

### Display name
For UI, use:
- spot leg: `KITE Spot (OKX)`
- staking leg: `KITE Earn (OKX)`
- perp hedge: `KITE Perp Short (Binance)`

### Compact label
Use:
- `KITE / USDG`
- `KITE / USDT`
- `KITE Earn`

### Warning badge
If strategy legs use different quote assets, show:
- `Cross-Quote`
or
- `USDG vs USDT`

This helps users understand why the hedge is logically related but not perfectly symmetric.

---

## Storage rules

Always persist:
- `symbolNative`
- `instIdNative`
- `baseAsset`
- `quoteAsset`
- `settleAsset`
- `instrumentType`
- `canonicalAsset`
- `canonicalPair`
- `canonicalInstrumentId`
- `canonicalFamilyId`
- `quoteFamily`
- `quoteAssetGroup`

Do not only store `canonicalAsset`, because that destroys important quote and product information.

---

## Error handling rules

### Unknown parsing
If parsing fails:
- preserve raw symbol
- set:
  - `baseAsset = rawBaseAsset ?? "UNKNOWN"`
  - `quoteAsset = rawQuoteAsset ?? null`
  - `instrumentType = "unknown"`
- flag:
  - `hedgeComparable = false`
  - `comparableReason = "Unable to confidently parse instrument"`

### No blind assumptions
If symbol parsing is ambiguous, the agent must not guess.
Use exchange metadata or explicit instrument catalog endpoints when available.

### Quote ambiguity
If quote asset cannot be determined, do not fabricate it.

---

## Edge cases

### 1. Same symbol text, different market type
`BTCUSDT` may appear in:
- spot
- futures

Do not rely on symbol text alone.
Use endpoint context or exchange metadata.

### 2. Earn position with no quote asset
A staking/earn position may expose only the underlying coin.
That is valid:
- `baseAsset = KITE`
- `quoteAsset = null`
- `instrumentType = earn_position`

### 3. Wrapped or synthetic assets
If future support includes wrapped assets, do not collapse:
- `WBTC` != `BTC`
unless an explicit mapping rule is introduced elsewhere.

### 4. Exchange naming drift
If an exchange changes symbol conventions, trust official metadata fields first.

---

## Reference examples

### Example A: OKX spot KITE/USDG
Input:
```json
{
  "exchange": "okx",
  "instId": "KITE-USDG",
  "instType": "SPOT",
  "baseCcy": "KITE",
  "quoteCcy": "USDG"
}
```

Output:
```json
{
  "exchange": "okx",
  "symbolNative": "KITE-USDG",
  "instIdNative": "KITE-USDG",
  "baseAsset": "KITE",
  "quoteAsset": "USDG",
  "settleAsset": null,
  "instrumentType": "spot",
  "venueProductType": "SPOT",
  "canonicalAsset": "KITE",
  "canonicalPair": "KITE/USDG",
  "canonicalInstrumentId": "okx:spot:KITE/USDG",
  "canonicalFamilyId": "asset:KITE",
  "quoteFamily": "stable",
  "quoteAssetGroup": "stable-usd",
  "hedgeComparable": true,
  "comparableReason": "Spot long exposure candidate"
}
```

### Example B: Binance KITEUSDT perpetual short
Input:
```json
{
  "exchange": "binance",
  "symbol": "KITEUSDT",
  "baseAsset": "KITE",
  "quoteAsset": "USDT",
  "marketContext": "futures"
}
```

Output:
```json
{
  "exchange": "binance",
  "symbolNative": "KITEUSDT",
  "baseAsset": "KITE",
  "quoteAsset": "USDT",
  "settleAsset": "USDT",
  "instrumentType": "perp",
  "venueProductType": "USDT_PERP",
  "canonicalAsset": "KITE",
  "canonicalPair": "KITE/USDT",
  "canonicalInstrumentId": "binance:perp:KITE/USDT",
  "canonicalFamilyId": "asset:KITE",
  "quoteFamily": "stable",
  "quoteAssetGroup": "stable-usd",
  "hedgeComparable": true,
  "comparableReason": "Perpetual short hedge candidate"
}
```

### Example C: Matched strategy interpretation
Normalized result:
- OKX leg -> `canonicalAsset = KITE`, `quoteAsset = USDG`, `instrumentType = spot`
- Binance leg -> `canonicalAsset = KITE`, `quoteAsset = USDT`, `instrumentType = perp`

Interpretation:
- same underlying base asset
- different quote assets
- valid hedge candidate
- must be tagged as cross-quote

---

## Required implementation guidance

### Recommended helper functions
Implement helpers like:

```ts
function normalizeAssetCode(value: string | null | undefined): string | null
function classifyQuoteFamily(quoteAsset: string | null): { quoteFamily: string; quoteAssetGroup: string | null }
function normalizeBinanceInstrument(input: BinanceInstrumentInput): CanonicalInstrument
function normalizeOkxInstrument(input: OkxInstrumentInput): CanonicalInstrument
function buildCanonicalPair(baseAsset: string, quoteAsset: string | null): string | null
function buildCanonicalInstrumentId(exchange: string, instrumentType: string, canonicalPair: string | null, symbolNative: string): string
```

### Recommended persistence strategy
- persist normalized instrument snapshots
- keep raw payload in parallel
- never overwrite raw with normalized-only values

---

## Success criteria

A correct implementation of this skill should ensure that:
1. `KITE-USDG` on OKX and `KITEUSDT` perp on Binance are recognized as the same underlying **base asset family**
2. They are not incorrectly treated as identical quote instruments
3. The matching engine can safely pair them as a hedge candidate
4. The UI can clearly display the cross-quote relationship
5. Future PnL and risk engines receive deterministic, structured inputs

---

## Anti-patterns to avoid

Do not:
- compare raw symbols directly across exchanges
- assume `USDG == USDT`
- infer spot vs perp from text alone when metadata exists
- store only display labels without canonical fields
- collapse all stablecoin quotes into one asset
- guess ambiguous parsing without metadata

---

## Short working summary

For this app:
- `canonicalAsset` answers: **what underlying coin is this about?**
- `quoteAsset` answers: **what is it priced / settled in?**
- `instrumentType` answers: **what kind of exposure is this?**
- `canonicalFamilyId` answers: **which cross-exchange family can this belong to?**

Example:
- OKX spot stake `KITE/USDG`
- Binance perp short `KITE/USDT`

These are:
- same asset family
- different quote assets
- valid hedge pair candidate
- must carry a cross-quote warning
