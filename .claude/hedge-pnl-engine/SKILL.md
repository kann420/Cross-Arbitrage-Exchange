# Skill: hedge-pnl-engine

## Purpose
This skill defines how an AI agent should calculate and explain PnL, carry, rewards, funding, fees, and net performance for a cross-exchange hedge / carry / staking management app.

It is designed for the primary v1 strategy:
- long spot / earn / staking exposure on **OKX**
- short perpetual hedge on **Binance**

This skill exists because hedge PnL is easy to calculate badly.
A naive implementation may:
- count rewards as trading PnL
- ignore funding
- ignore fees
- mix quote currencies carelessly
- double count spot and hedge legs
- confuse realized vs unrealized
- hide whether the strategy is actually making money from carry or just from price movement

This skill standardizes the accounting model so the agent can build a trustworthy backend and dashboard.

---

## Scope

### In scope
- Define PnL components for the supported hedge strategy
- Separate realized vs unrealized components
- Define rewards, funding, fees, and carry treatment
- Define quote-currency and cross-quote safety rules
- Produce deterministic output schemas for UI/API
- Explain how to compute “close now” and “current running” metrics
- Provide dashboard-friendly derived metrics

### Out of scope
- Order execution
- Symbol normalization
- Hedge matching
- FX conversion logic between quote currencies
- Tax/accounting treatment
- Depeg / stablecoin risk modeling
- Borrow-interest logic beyond the explicitly fetched events
- Full portfolio optimization

---

## Core principles

1. **Decompose first, then sum**
   Never calculate only one magical “PnL number”.
   Always split into components:
   - spot PnL
   - hedge PnL
   - rewards
   - funding
   - fees
   - other income/cost events

2. **Realized and unrealized must be separated**
   Users need to know:
   - what is already locked in
   - what depends on current mark price
   - what is earned carry vs directional luck

3. **Base asset exposure and cashflow are different things**
   A hedge may be price-neutral-ish but still profitable or unprofitable because of:
   - rewards
   - funding
   - fees
   - basis changes

4. **Cross-quote positions must be flagged**
   `KITE/USDG` on OKX vs `KITE/USDT` perp on Binance is a valid strategy,
   but the engine must not silently pretend `USDG == USDT`.

5. **Decimal safety is mandatory**
   Use decimal-safe math, not binary floating point for financial calculations.

6. **Timestamps must be milliseconds**
   All internal timestamps must use `ms`.

---

## Supported strategy model (v1)

### Strategy type
`spot_or_earn_long + perp_short_hedge`

### Typical example
- OKX:
  - buy and hold KITE spot, or subscribe KITE to earn/staking
- Binance:
  - short KITEUSDT perpetual

### Main economic outcomes
- rewards / APR / yield on long side
- hedge PnL on short side
- spot mark-to-market on long side
- funding paid or received on short side
- trading fees on entry/exit/rebalance
- possible cross-quote basis between `USDG` and `USDT`

---

## Required inputs

This skill assumes the strategy has already been grouped by `hedge-position-matching`.

Conceptual input:

```ts
type HedgePnlInput = {
  strategyGroupId: string;
  canonicalAsset: string;

  crossQuote: boolean;
  longQuoteAsset: string | null;     // e.g. USDG
  shortQuoteAsset: string | null;    // e.g. USDT

  openedAtMs: number | null;
  asOfMs: number;                    // calculation timestamp in ms

  longLeg: {
    exchange: "okx";
    instrumentType: "spot" | "earn_position";
    baseQty: string;                 // current base units held
    avgEntryPriceQuote?: string | null;
    currentMarkPriceQuote?: string | null;
    realizedPnlQuote?: string | null;
    feesQuote?: string | null;
    rewardsQuote?: string | null;
    rewardEvents?: IncomeEvent[];
  };

  shortLeg: {
    exchange: "binance";
    instrumentType: "perp";
    baseQtyAbs: string;              // absolute short size in base units
    avgEntryPriceQuote?: string | null;
    currentMarkPriceQuote?: string | null;
    realizedPnlQuote?: string | null;
    unrealizedPnlQuote?: string | null;
    feesQuote?: string | null;
    fundingQuote?: string | null;
    fundingEvents?: IncomeEvent[];
  };

  additionalFeeEvents?: FeeEvent[];
  transferEvents?: TransferEvent[];
};
```

---

## Output schema

```ts
type HedgePnlBreakdown = {
  strategyGroupId: string;
  canonicalAsset: string;
  asOfMs: number;

  crossQuote: boolean;
  quoteContext: {
    longQuoteAsset: string | null;
    shortQuoteAsset: string | null;
    pnlAggregationMode: "single-quote" | "cross-quote-unconverted";
    warning?: string | null;
  };

  components: {
    longSpotOrEarnUnrealized: PnlComponent;
    longSpotOrEarnRealized: PnlComponent;
    shortPerpUnrealized: PnlComponent;
    shortPerpRealized: PnlComponent;
    rewards: PnlComponent;
    funding: PnlComponent;
    fees: PnlComponent;
    other: PnlComponent;
  };

  derived: {
    runningNetPnl: PnlValueSet;         // includes unrealized components
    realizedNetPnl: PnlValueSet;        // excludes unrealized
    carryNetPnl: PnlValueSet;           // rewards + funding - fees (+ other carry-like events)
    closeNowEstimatedPnl: PnlValueSet;  // if position were closed at current marks
    hedgeRatio: string | null;
    netBaseExposure: string | null;
  };

  warnings: string[];
};
```

Where:

```ts
type PnlComponent = {
  label: string;
  value: PnlValueSet;
  includedInRunningNet: boolean;
  includedInRealizedNet: boolean;
  includedInCarryNet: boolean;
};

type PnlValueSet = {
  singleQuoteValue?: string | null;     // when long/short quote asset are same
  longQuoteValue?: string | null;       // e.g. USDG
  shortQuoteValue?: string | null;      // e.g. USDT
  displayMode: "single-quote" | "cross-quote-unconverted";
};
```

---

## Canonical component definitions

## 1. Long spot / earn unrealized PnL
Mark-to-market effect on the long side.

### Formula
If long side is spot-like and has entry + current price:

`longUnrealized = currentBaseQty * (currentMarkPrice - avgEntryPrice)`

All in the long leg quote currency.

### Notes
- For earn/staking positions, the underlying asset still has price exposure.
- If entry price is unknown, do not fabricate it.
- If long side was partially reduced, the remaining unrealized PnL applies only to remaining base quantity.

---

## 2. Long spot / earn realized PnL
Locked-in trading PnL from selling/redeeming/reducing the long side.

### Includes
- realized gains/losses from spot disposals
- redemption/sale effects if exposed by exchange history

### Excludes
- rewards
- funding
- fees (unless exchange bundles them inseparably and no cleaner split exists)

---

## 3. Short perp unrealized PnL
Mark-to-market effect on the short hedge.

### Formula
For a short position:

`shortUnrealized = shortBaseQtyAbs * (avgEntryPrice - currentMarkPrice)`

All in the short leg quote currency.

If exchange already returns an authoritative unrealized PnL field and it is trustworthy:
- use that field
- still document the formula for sanity checks

---

## 4. Short perp realized PnL
Locked-in PnL from closed portions of the perp hedge.

### Includes
- realized trading PnL from reduced / closed short exposure

### Excludes
- funding
- trading fees unless bundled and inseparable

---

## 5. Rewards
Income from OKX earn/staking/reward programs attributable to this strategy.

### Includes
- staking rewards
- earn product payouts
- promo incentive payouts tied to held asset if explicitly fetched and attributed

### Excludes
- spot mark-to-market gains
- non-strategy airdrops unless explicitly assigned
- funding

### Rule
Treat rewards as **carry income**, not trading PnL.

---

## 6. Funding
Net funding cashflow from the perpetual hedge.

### Includes
- funding paid
- funding received

### Sign convention
- funding received => positive
- funding paid => negative

### Rule
Treat funding as **carry income/cost**, not trading PnL.

---

## 7. Fees
Trading or strategy operation costs.

### Includes
- entry fees
- exit fees
- rebalance fees
- redemption fees if applicable and clearly attributable
- transfer fees if explicitly treated as strategy cost

### Sign convention
Always negative in net PnL.

---

## 8. Other
Use only for explicitly attributable items that do not fit the above buckets.

Examples:
- manually tagged strategy cost adjustments
- exchange rebates not covered elsewhere

Do not dump ambiguous data here without explanation.

---

## Derived metrics

## A. Running Net PnL
“How is the strategy doing right now including unrealized?”

### Formula
`runningNet = longUnrealized + longRealized + shortUnrealized + shortRealized + rewards + funding - abs(fees) + other`

Important:
- If fees are already signed negative, do not negate twice.
- Respect component sign conventions consistently.

---

## B. Realized Net PnL
“What has already been locked in?”

### Formula
`realizedNet = longRealized + shortRealized + rewards + funding - abs(fees) + other`

Excludes:
- long unrealized
- short unrealized

---

## C. Carry Net PnL
“What did the strategy earn from carry/yield mechanics, excluding directional mark-to-market?”

### Formula
`carryNet = rewards + funding - abs(fees) + carryEligibleOther`

### Purpose
This is extremely important for your use case because it answers:
- Is the hedge strategy intrinsically making money from yield/carry?
- Or is the current green PnL mostly from lucky market movement?

---

## D. Close-Now Estimated PnL
“What would net PnL be if we closed both legs right now?”

### Interpretation
For an open strategy, this is conceptually close to:
- current realized components
- plus current unrealized components
- minus estimated closing fees if modeled

### Conservative formula
`closeNowEstimated = runningNet - estimatedCloseFees`

If close fees are not modeled yet:
- set estimated close fees to zero
- include a warning that closing costs are omitted

---

## Sign conventions

Use one sign convention consistently:

- positive => beneficial to user
- negative => harmful to user

Examples:
- spot appreciated => positive unrealized
- short loses because price rises => negative unrealized
- funding paid => negative
- rewards earned => positive
- fees paid => negative

Never store one component as absolute cost and another as signed value without metadata.

---

## Single-quote vs cross-quote rules

## Single-quote case
If both legs use the same quote asset:
- example: both `USDT`
- engine may produce:
  - `singleQuoteValue`
  - `displayMode = "single-quote"`

This is the cleanest case.

## Cross-quote case
If long and short sides use different quote assets:
- example: OKX long in `USDG`
- Binance short in `USDT`

Then:
- do **not** silently sum them into one number unless explicit conversion is available
- produce:
  - `longQuoteValue`
  - `shortQuoteValue`
  - `displayMode = "cross-quote-unconverted"`

### Mandatory warning
Include:
`Cross-quote PnL: long leg and short leg use different quote assets (e.g. USDG vs USDT). Values are shown separately unless explicit conversion is applied.`

### UI implication
For cross-quote strategies, UI may display:
- Long-side PnL in USDG
- Short-side PnL in USDT
- Carry bucket split by quote context
- a warning badge `Cross-Quote`

---

## Hedge ratio and exposure metrics

The PnL engine should also compute or accept:
- `hedgeRatio = shortBaseQtyAbs / longBaseQty`
- `netBaseExposure = longBaseQty - shortBaseQtyAbs`

These are not PnL themselves, but critical context.

### Interpretation
- hedgeRatio near `1.00` => roughly neutral
- < `1.00` => under-hedged
- > `1.00` => over-hedged
- netBaseExposure > `0` => net long
- netBaseExposure < `0` => net short

---

## Data source preference rules

When multiple data sources exist, prefer:

### For unrealized PnL
1. authoritative exchange unrealized field if trustworthy
2. compute from qty and mark if not available
3. never guess if required inputs are missing

### For rewards/funding/fees
1. explicit event history / ledger endpoints
2. exchange aggregate fields if clearly scoped
3. do not infer from balance changes alone unless nothing else exists and the inference is clearly labeled

### For realized PnL
1. exchange realized PnL endpoints if strategy-attributable
2. derive from fills/history only if you can do so safely
3. do not merge reward/funding into realized trading PnL

---

## Attribution rules

A strategy should only include events that belong to its matched legs.

### Safe attribution examples
- funding records for the exact perp symbol / position side / strategy window
- rewards for the held base asset during the strategy window
- fees from entry, rebalance, exit fills linked to the strategy

### Unsafe attribution examples
- all rewards for the entire account
- all funding on the account
- all spot fees for the asset across unrelated trades

If attribution is ambiguous:
- do not auto-assign silently
- mark warning
- optionally keep the event in an “unassigned” pool

---

## Time-window rules

PnL should be computable for:
- **current state** as of now
- **historical snapshots** as of a prior timestamp

### Required timestamp rule
All time filters and snapshots must use milliseconds.

### Strategy window
Use:
- `openedAtMs`
- current `asOfMs`
- or `closedAtMs` when closed

Rewards/funding/fees should only be counted inside the strategy’s active time window unless explicitly attributed otherwise.

---

## Partial close handling

When a strategy is partially closed:
- realized PnL should increase based on closed portions
- unrealized PnL should apply only to remaining live quantities
- rewards/funding continue only on remaining active exposure where relevant

Do not treat partial close as a new strategy unless the matching layer explicitly split it.

---

## Rebalance handling

Rebalances should not reset PnL history.

If the user:
- adds more long spot
- increases short hedge
- trims one side slightly

then:
- keep cumulative realized PnL / rewards / funding / fees in the same strategy group
- recompute average entry if your accounting model supports it
- keep clear audit trail of rebalance events

---

## Recommended accounting model

For v1, use a practical strategy-level model:

### 1. Maintain cumulative event buckets
- total rewards
- total funding
- total fees
- total realized trading PnL

### 2. Maintain current live position state
- remaining long qty + avg entry
- remaining short qty + avg entry
- current marks

### 3. Compute current unrealized
- long unrealized
- short unrealized

### 4. Produce derived totals
- running net
- realized net
- carry net
- close-now estimated

This model is far easier to audit than trying to directly infer everything from balances.

---

## Warning rules

Always emit warnings when relevant:

### cross-quote
`Cross-quote PnL: long and short legs use different quote assets.`

### missing entry price
`Unable to compute full unrealized PnL because entry price is missing.`

### missing mark price
`Unable to compute current unrealized PnL because mark price is missing.`

### close fee omission
`Close-now estimate excludes estimated closing fees.`

### ambiguous attribution
`Some rewards/funding/fees could not be confidently attributed to this strategy.`

### stale price
`Mark price may be stale.`

---

## UI-facing field guidance

The engine should provide dashboard-friendly fields such as:

```ts
type HedgeDashboardMetrics = {
  netPnlLabel: string;                 // e.g. "+$1,284.22" only if same quote or converted
  longLegPnlLabel?: string | null;     // e.g. "+124.2 USDG"
  shortLegPnlLabel?: string | null;    // e.g. "+98.7 USDT"
  rewardsLabel?: string | null;
  fundingLabel?: string | null;
  feesLabel?: string | null;
  carryLabel?: string | null;
  hedgeRatioLabel?: string | null;
  statusHint?: "healthy" | "rebalance_needed" | "cross_quote" | "needs_review";
};
```

### Important UI rule
If cross-quote values are not converted:
- do not show a fake merged dollar number
- show split labels instead

---

## Formulas summary

Assume same-quote case for notation simplicity.

### Long unrealized
`longUnrealized = longQty * (longMark - longAvgEntry)`

### Short unrealized
`shortUnrealized = shortQtyAbs * (shortAvgEntry - shortMark)`

### Running net
`runningNet = longUnrealized + longRealized + shortUnrealized + shortRealized + rewards + funding + fees + other`

Where:
- `fees` should already be signed negative

### Realized net
`realizedNet = longRealized + shortRealized + rewards + funding + fees + other`

### Carry net
`carryNet = rewards + funding + carryEligibleFeesAndOther`

Usually:
- fees remain negative
- rewards/funding may be positive or negative

### Close-now estimate
`closeNowEstimated = runningNet - estimatedCloseFees`

---

## Worked examples

## Example A: same-quote clean case
Inputs:
- long spot qty: `10 KITE`
- long avg entry: `1.00 USDT`
- long mark: `1.20 USDT`
- short perp qty: `10 KITE`
- short avg entry: `1.02 USDT`
- short mark: `1.19 USDT`
- rewards: `+5 USDT`
- funding: `-1 USDT`
- fees: `-0.5 USDT`

Calculations:
- long unrealized = `10 * (1.20 - 1.00) = +2.0`
- short unrealized = `10 * (1.02 - 1.19) = -1.7`
- carry net = `5 - 1 - 0.5 = +3.5`
- running net = `2.0 - 1.7 + 5 - 1 - 0.5 = +3.8`

Interpretation:
- trading legs mostly offset each other
- carry/rewards drive profit

---

## Example B: cross-quote case
Inputs:
- OKX long KITE in `USDG`
- Binance short KITE perp in `USDT`

Suppose:
- long unrealized = `+120 USDG`
- short unrealized = `-90 USDT`
- rewards = `+15 USDG`
- funding = `-6 USDT`
- fees = `-2 USDT`

Result:
Do not sum into one fake number.

Produce:
- long-side subtotal: `+135 USDG`
- short-side subtotal: `-98 USDT`
- displayMode = `cross-quote-unconverted`
- warning about quote mismatch

---

## Example C: carry-positive but mark-to-market negative
Inputs:
- long unrealized: `-100`
- short unrealized: `+60`
- rewards: `+70`
- funding: `+10`
- fees: `-5`

Results:
- runningNet = `-100 + 60 + 70 + 10 - 5 = +35`
- carryNet = `70 + 10 - 5 = +75`

Interpretation:
- carry mechanics are working well
- directional mark-to-market is currently a drag
- this is a useful distinction for decision-making

---

## Example D: realized-only view
Inputs:
- long realized: `+20`
- short realized: `+15`
- rewards: `+8`
- funding: `-3`
- fees: `-2`

Result:
- realizedNet = `20 + 15 + 8 - 3 - 2 = +38`

---

## Persistence rules

Persist:
- component-level values
- display mode
- quote asset context
- warnings
- `asOfMs`
- raw inputs or source references used for calculation

This allows:
- auditing
- debugging
- historical snapshots
- UI explanation
- future recomputation if formulas evolve

---

## Anti-patterns to avoid

Do not:
- merge cross-quote values without conversion
- count rewards as trading realized PnL
- ignore funding because “it is small”
- use floats for money math
- hide fees inside other buckets without note
- recompute everything from scratch using only current balances if event history exists
- show one “net APY” without stating whether it includes funding/fees
- fabricate entry price or mark price when missing

---

## Recommended helper functions

```ts
function computeLongUnrealized(baseQty: Decimal, avgEntry: Decimal, mark: Decimal): Decimal
function computeShortUnrealized(baseQtyAbs: Decimal, avgEntry: Decimal, mark: Decimal): Decimal
function sumSigned(values: Decimal[]): Decimal
function buildPnlValueSet(params: {
  longQuoteValue?: Decimal | null;
  shortQuoteValue?: Decimal | null;
  singleQuoteValue?: Decimal | null;
  displayMode: "single-quote" | "cross-quote-unconverted";
}): PnlValueSet
function deriveCarryNet(rewards: Decimal, funding: Decimal, fees: Decimal, other?: Decimal): Decimal
```

---

## Success criteria

A correct implementation of this skill should ensure that:
1. The app can clearly separate spot/earn PnL, short hedge PnL, rewards, funding, and fees
2. Carry profitability can be seen independently from directional mark-to-market
3. Cross-quote strategies such as `USDG` vs `USDT` are handled safely and transparently
4. Partial closes and rebalances update the same strategy economics rather than resetting history
5. UI gets deterministic, explainable metrics for both running and close-now views

---

## Short working summary

For this app, the engine should always answer four questions clearly:

1. **How much is the strategy up/down right now?**
   -> `runningNetPnl`

2. **How much is already locked in?**
   -> `realizedNetPnl`

3. **How much came from carry/yield mechanics?**
   -> `carryNetPnl`

4. **What happens if I close now?**
   -> `closeNowEstimatedPnl`

And for cross-quote setups like:
- OKX `KITE/USDG` long/earn
- Binance `KITE/USDT` perp short

the engine must:
- treat them as one economic strategy
- but keep quote-currency outputs explicit
- never fake a merged number without conversion
