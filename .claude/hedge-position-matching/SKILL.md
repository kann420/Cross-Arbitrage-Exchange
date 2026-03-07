# Skill: hedge-position-matching

## Purpose
This skill defines how an AI agent should decide whether two or more exchange legs belong to the same hedge strategy position in a cross-exchange hedge / carry / staking management app.

It is designed for the first supported setup:
- long spot / staking / earn exposure on **OKX**
- short perpetual hedge on **Binance**

This skill exists because “same asset” alone is **not enough** to safely group positions.
For example:
- OKX: `KITE/USDG` spot or earn position
- Binance: `KITEUSDT` perpetual short

These likely belong to the same hedge idea, but the agent still needs rules for:
- quantity mismatch
- timing mismatch
- multiple entries
- partial closes
- rebalance events
- quote mismatch
- accidental unrelated positions in the same asset

Without a strict matching skill, agents may:
- group unrelated positions together
- double count exposure
- compute fake PnL
- hide hedge drift
- break open/closed history

This skill standardizes position grouping.

---

## Scope

### In scope
- Match normalized exchange legs into strategy positions
- Determine whether a leg is part of an **open**, **partially closed**, or **closed** hedge
- Group spot/earn legs with perp hedge legs
- Support partial fills and multiple entries
- Produce deterministic grouping IDs
- Handle cross-quote pairing such as `USDG` vs `USDT`
- Create matching confidence and warnings
- Define lifecycle state transitions for the strategy

### Out of scope
- Symbol normalization itself
- Raw exchange adapter logic
- Full PnL math
- Order execution
- Stablecoin FX conversion
- Portfolio optimization across many strategies

---

## Core principles

1. **Matching is strategy-aware, not symbol-only**
   Two legs may share the same asset but still be unrelated.

2. **Base asset match is required, but not sufficient**
   `KITE` must match `KITE`, but timing, direction, and quantity must also make sense.

3. **Direction must be complementary**
   For the main supported strategy:
   - OKX spot / earn => long or yield exposure
   - Binance perp short => short hedge exposure

4. **Quote mismatch is allowed, but must be flagged**
   `KITE/USDG` vs `KITE/USDT` is valid as a hedge candidate, but not exact parity.

5. **Matching should be deterministic**
   The same input data should always yield the same grouping result.

6. **Prefer safe under-matching over dangerous over-matching**
   If confidence is weak, do not force a match.

---

## Supported strategy model (v1)

Primary supported strategy pattern:

### Strategy type
`spot_or_earn_long + perp_short_hedge`

### Typical example
- OKX spot / earn: long `KITE`
- Binance perpetual: short `KITE`

### Economic intention
- hold base asset on OKX to earn staking / earn / APR / incentive
- hedge price exposure with short perp on Binance
- monitor:
  - hedge ratio
  - funding
  - reward yield
  - spread / carry
  - net PnL

This skill is designed around that pattern first.

---

## Input requirements

This skill assumes legs are already normalized by:
- `exchange-adapters`
- `exchange-symbol-normalization`

Each incoming leg should look conceptually like:

```ts
type HedgeCandidateLeg = {
  exchange: "okx" | "binance";
  venueAccountId?: string;
  sourceType: "spot_balance" | "spot_position" | "earn_position" | "perp_position" | "transfer_event" | "trade_fill";
  symbolNative: string;
  canonicalAsset: string;          // e.g. KITE
  canonicalPair: string | null;    // e.g. KITE/USDG, KITE/USDT
  instrumentType: "spot" | "earn_position" | "perp" | "future" | "unknown";
  quoteAsset: string | null;
  quoteAssetGroup: string | null;  // e.g. stable-usd
  hedgeDirectionHint: "long_exposure" | "short_exposure" | "yield_exposure" | "neutral" | "unknown";

  quantityBase: string | null;     // decimal string in base asset units
  notionalQuote: string | null;    // decimal string in quote units if known
  side?: "long" | "short" | "flat" | "unknown";

  openedAtMs?: number | null;
  updatedAtMs?: number | null;
  lastTradeAtMs?: number | null;

  rawPositionId?: string | null;
  rawPayload?: unknown;
};
```

---

## Output schema

The matching layer should produce strategy groups like:

```ts
type HedgeStrategyGroup = {
  strategyGroupId: string;
  strategyType: "spot_earn_plus_perp_short";
  status: "open" | "partially_closed" | "closed" | "unmatched" | "needs_review";

  canonicalAsset: string;                 // e.g. KITE
  primaryVenueLong: "okx" | null;
  primaryVenueShort: "binance" | null;

  longLegs: HedgeCandidateLeg[];
  shortLegs: HedgeCandidateLeg[];

  longBaseQty: string;                    // aggregated decimal string
  shortBaseQtyAbs: string;                // aggregated absolute short qty
  hedgeRatio: string | null;              // short / long in base terms
  netBaseExposure: string | null;         // long - shortAbs

  crossQuote: boolean;
  quoteMismatchSummary: string | null;    // e.g. "USDG vs USDT"

  matchingConfidence: "high" | "medium" | "low";
  matchingReasons: string[];
  warnings: string[];

  openedAtMs: number | null;
  lastActivityAtMs: number | null;
  closedAtMs: number | null;
};
```

---

## Mandatory matching prerequisites

A candidate match must satisfy **all** of the following:

### 1. Same canonical asset
Required:
- `longLeg.canonicalAsset === shortLeg.canonicalAsset`

Examples:
- OKX KITE + Binance KITE => pass
- OKX BTC + Binance ETH => fail

### 2. Complementary direction
Required:
- one side must represent long/yield exposure
- the other side must represent short hedge exposure

Valid patterns:
- `spot` + `perp short`
- `earn_position` + `perp short`
- `spot + earn_position` aggregated together on long side + `perp short`

Invalid patterns:
- `spot long` + `perp long`
- `earn_position` + `spot long`
- `perp short` + `perp short`

### 3. Instrument type compatibility
Valid v1 match patterns:
- OKX `spot` with Binance `perp`
- OKX `earn_position` with Binance `perp`
- OKX `spot` + OKX `earn_position` with Binance `perp`

### 4. Non-zero meaningful quantity
Both sides must have a parseable base quantity above dust threshold.

---

## Dust / minimum quantity rules

To avoid matching noise, use a configurable dust threshold.

Recommended defaults:
- absolute base quantity threshold: `> 0`
- plus product-specific dust threshold where available

Suggested config:
```ts
type MatchingConfig = {
  baseDustThresholdByAsset?: Record<string, string>; // decimal strings
  defaultBaseDustThreshold: string;                  // e.g. "0.00000001"
};
```

If either leg is below dust:
- do not treat as a real hedge leg
- mark as unmatched or ignorable noise

---

## Aggregation rules before matching

Before matching individual legs, aggregate compatible same-side legs by:
- exchange
- venue account
- canonical asset
- hedge direction class
- instrument type class
- strategy window if known

### Long-side aggregation
These may be aggregated together:
- OKX spot KITE
- OKX earn position KITE

Why:
Both contribute long/yield exposure in the same underlying asset.

### Short-side aggregation
These may be aggregated together:
- multiple Binance KITE perp short positions / fills in the same account scope

---

## Matching confidence model

Use a simple rule-based confidence model.

### High confidence
All conditions:
- same canonical asset
- complementary direction
- quantity ratio is close enough
- timing is reasonably aligned
- no conflicting unrelated open position in same asset
- both legs active in the same strategy window

### Medium confidence
Conditions:
- same canonical asset
- complementary direction
- quantity somewhat aligned, but not tight
- timing loose or one side missing reliable timestamps
- cross-quote pair present

### Low confidence
Conditions:
- same canonical asset, but
- quantity mismatch is large
- timing is far apart
- multiple possible counterpart legs exist
- insufficient evidence they belong together

If confidence is low:
- do not silently auto-group in a “safe automation” mode
- mark `needs_review` or `unmatched`

---

## Quantity alignment rules

The main quantity comparison should be done in **base asset units**, not quote units.

### Definitions
- `longBaseQty` = total long/yield base units
- `shortBaseQtyAbs` = absolute value of total short base units
- `hedgeRatio = shortBaseQtyAbs / longBaseQty`

### Recommended interpretation
- `0.95 - 1.05` => tightly hedged
- `0.85 - 1.15` => acceptable hedge candidate
- outside this range => likely drift, rebalance, partial close, or mismatch

### Matching thresholds
Use a config like:

```ts
type HedgeRatioThresholds = {
  idealMin: string;       // "0.95"
  idealMax: string;       // "1.05"
  acceptableMin: string;  // "0.85"
  acceptableMax: string;  // "1.15"
};
```

### Rule
A pair may be matched if:
- hedge ratio is inside acceptable range
- or a strong lifecycle reason exists (partial close, rebalance in progress, recent leg update)

If hedge ratio is far outside acceptable range:
- do not auto-match unless existing group history strongly supports continuation

---

## Timing alignment rules

Timing is important because unrelated positions in the same asset may coexist.

### Preferred timestamps
Use this order:
1. `openedAtMs`
2. `lastTradeAtMs`
3. `updatedAtMs`

### Suggested timing windows
Default matching windows:
- strong alignment: within 24 hours
- acceptable alignment: within 72 hours
- weak alignment: beyond 72 hours

### Rule
If positions open close together in time and have aligned quantities:
- confidence increases

If positions are weeks apart:
- confidence decreases sharply unless they already belong to an existing strategy group

---

## Existing group continuation rules

If a leg already belongs to an existing open strategy group, prefer **continuation** over creating a new group.

### Continuation conditions
A new update should stay in the same group if:
- same canonical asset
- same venue account(s)
- same strategy type
- same directional role (long side or short side)
- no clear close event happened between updates

This prevents the agent from splitting one long-running strategy into many fake groups.

---

## Strategy group ID rules

A strategy group ID must be deterministic and stable once created.

Recommended pattern:
```ts
strategy:{strategyType}:{canonicalAsset}:{anchorTimestampMs}:{sequence}
```

Example:
- `strategy:spot_earn_plus_perp_short:KITE:1741132800000:1`

### Anchor timestamp
Use the earliest reliable opening timestamp across matched legs.

### Sequence
Only needed if more than one distinct strategy in the same asset opens around the same time.

---

## Lifecycle states

### open
Both long and short sides exist and meaningful exposure remains on both sides.

### partially_closed
One side has been reduced materially, but the strategy still has some live exposure.

Examples:
- long still open, short partially reduced
- short still open, part of long leg redeemed

### closed
The strategy is considered closed when:
- both long and short meaningful exposure are gone
- or remaining exposure is below dust threshold
- and there is a close or unwind event history consistent with closure

### unmatched
A leg cannot be safely assigned to a hedge group.

### needs_review
There are plausible matches but confidence is too weak for safe auto-grouping.

---

## Close detection rules

A strategy may be marked closed when:

### Rule set A: exposure-based closure
- `longBaseQty` <= dust threshold
- `shortBaseQtyAbs` <= dust threshold

### Rule set B: explicit unwind pattern
- long leg redeemed / sold down materially
- short leg bought back / closed materially
- timestamps indicate coordinated unwind

### Rule set C: historical continuation end
- no meaningful remaining exposure
- no new related activity for a configured cooldown window

Recommended cooldown:
- 12 to 24 hours before finalizing closed state if events arrive asynchronously

---

## Partial close rules

Do not create a new strategy group just because quantities changed.

If the same matched group sees:
- reduced long quantity
- reduced short quantity
- but still meaningful exposure remains

then:
- keep the same `strategyGroupId`
- update status to `partially_closed` if the hedge ratio or size indicates unwind in progress

---

## Rebalance rules

Rebalances are common and should not create new groups automatically.

Examples:
- user adds more OKX spot KITE
- user increases Binance short KITE
- user trims 5% of short to restore hedge ratio

If activity:
- stays in same canonical asset
- same accounts
- same active strategy window
- same economic direction

then treat it as:
- update to existing group
- not a new strategy

---

## Cross-quote handling rules

### Valid cross-quote pair
- OKX `KITE/USDG` spot or earn
- Binance `KITE/USDT` perp

This is a valid hedge strategy candidate because:
- same base asset `KITE`
- complementary direction
- same economic exposure family

### Mandatory tag
Set:
- `crossQuote = true`
- `quoteMismatchSummary = "USDG vs USDT"`

### Mandatory warning
Include:
`Cross-quote hedge: base asset matches, but quotes differ. Treat hedge as economically related, not perfectly identical.`

### Important
Cross-quote status should reduce confidence slightly unless there is strong timing and quantity alignment.

---

## Multiple possible counterpart rules

Sometimes one leg can match several possible legs.

Example:
- two separate KITE short batches on Binance
- one OKX long KITE balance

### Resolution order
Prefer counterpart with:
1. same existing strategy group
2. closest opening time
3. closest quantity fit
4. same account pairing pattern
5. strongest confidence score

If ambiguity remains:
- do not guess
- mark `needs_review`

---

## Matching score guidance (optional)

A simple additive score can help implementation.

Example:
- same asset: required gate
- complementary direction: required gate
- ideal hedge ratio: +3
- acceptable hedge ratio: +2
- strong time alignment: +3
- acceptable time alignment: +2
- same known account pair history: +2
- cross-quote: -1
- major quantity mismatch: -3
- far timing mismatch: -3
- multiple ambiguous counterpart options: -3

Interpretation:
- `>= 6` => high
- `4-5` => medium
- `<= 3` => low / review

This is optional; deterministic rules are preferred over overcomplicated scoring.

---

## Recommended helper structures

```ts
type StrategyMatchingContext = {
  existingOpenGroups: HedgeStrategyGroup[];
  matchingConfig: MatchingConfig & HedgeRatioThresholds;
};

type MatchDecision = {
  action: "attach_to_existing" | "create_new_group" | "leave_unmatched" | "needs_review";
  targetStrategyGroupId?: string;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  warnings: string[];
};
```

---

## Matching algorithm (recommended flow)

### Step 1: normalize inputs
Require all legs to already have:
- canonical asset
- instrument type
- quantityBase
- direction hint

### Step 2: discard dust / invalid legs
Ignore or quarantine:
- zero quantity
- unknown base asset
- unknown direction for hedge logic

### Step 3: aggregate same-side legs
Aggregate by:
- asset
- exchange
- direction class
- account scope
- active window

### Step 4: try continuation against existing open groups
If a leg can be confidently attached to an existing strategy group, do that first.

### Step 5: search for new counterpart candidates
For unmatched long-side groups, look for short-side candidates in same asset family.

### Step 6: apply gates
Require:
- same canonical asset
- complementary direction
- meaningful quantities

### Step 7: evaluate quality
Use:
- hedge ratio
- time proximity
- cross-quote flag
- prior account pairing
- ambiguity level

### Step 8: make decision
- high / medium confidence => create or update strategy group
- low confidence => `needs_review` or unmatched

### Step 9: persist warnings
Always preserve:
- cross-quote
- large hedge drift
- weak timing alignment
- ambiguous counterpart selection

---

## Worked examples

## Example A: clear match
Input:
- OKX earn/spot long KITE = `10.0`
- Binance perp short KITE = `-9.8`
- opened within 6 hours
- quote mismatch USDG vs USDT

Interpretation:
- same canonical asset `KITE`
- complementary direction
- hedge ratio = `0.98`
- strong timing alignment
- cross-quote but acceptable

Result:
- create or update strategy group
- `matchingConfidence = high`
- `crossQuote = true`

---

## Example B: weak match due to size mismatch
Input:
- OKX long KITE = `10`
- Binance short KITE = `-2`

Interpretation:
- same asset
- complementary direction
- hedge ratio = `0.20`
- likely not a real hedge pair unless partial build-in is explicitly known

Result:
- do not auto-match
- `needs_review` or unmatched

---

## Example C: continuation after rebalance
Existing group:
- OKX long KITE = `10`
- Binance short KITE = `-10`

Later:
- OKX increases to `12`
- Binance increases to `-12.1`

Interpretation:
- same group continues
- this is a rebalance / size increase
- do not create new strategy

Result:
- update existing group
- remain `open`

---

## Example D: partial close
Existing group:
- OKX long KITE = `10`
- Binance short KITE = `-10`

Later:
- OKX long KITE = `4`
- Binance short KITE = `-4.2`

Interpretation:
- same strategy partially unwound
- still active exposure exists

Result:
- same group ID
- status may become `partially_closed` or remain `open` depending on implementation preference
- never split into unrelated new group

---

## Example E: closed
Existing group:
- OKX long KITE = `10`
- Binance short KITE = `-10`

Later:
- OKX long KITE = `0`
- Binance short KITE = `0`

Interpretation:
- both sides below dust
- unwind complete

Result:
- mark `closed`
- set `closedAtMs`

---

## Warning rules

Always include warnings when relevant:

### cross-quote warning
For different quote assets:
- `Cross-quote hedge detected: USDG vs USDT`

### hedge drift warning
If hedge ratio outside ideal range:
- `Hedge ratio drifted outside ideal range`

### large mismatch warning
If outside acceptable range:
- `Long and short legs differ materially in base size`

### weak timing warning
If legs are too far apart in open time:
- `Leg timing alignment is weak`

### ambiguous match warning
If multiple plausible counterpart candidates exist:
- `Multiple candidate counterpart legs found`

---

## Persistence rules

Persist both:
1. current grouped strategy state
2. matching evidence / reasons / warnings

Why:
- debugging
- auditability
- UI explanation
- future rematching if logic improves

Recommended stored metadata:
- `matchingConfidence`
- `matchingReasons`
- `warnings`
- `crossQuote`
- `quoteMismatchSummary`
- `hedgeRatio`
- `openedAtMs`
- `lastActivityAtMs`

---

## Anti-patterns to avoid

Do not:
- match solely by raw symbol text
- assume all same-asset positions belong together
- create a new strategy group on every rebalance
- ignore quote mismatch
- compare size in quote units first
- silently match low-confidence candidates
- treat missing timestamps as proof of alignment
- split one long-running strategy into many tiny artificial groups

---

## Success criteria

A correct implementation of this skill should ensure that:
1. OKX `KITE` spot/earn and Binance `KITE` perp short can be matched into one strategy group when size, direction, and timing make sense
2. Cross-quote cases like `USDG` vs `USDT` are supported but visibly flagged
3. Rebalances update the same strategy group instead of spawning fake new trades
4. Partial closes remain linked to the original strategy
5. Ambiguous or weak matches are surfaced for review instead of silently forced

---

## Short working summary

For this app, a valid hedge strategy match usually means:
- same `canonicalAsset`
- long/yield exposure on OKX
- short perp exposure on Binance
- reasonable base-size alignment
- timestamps that make sense
- cross-quote allowed but warned

Example:
- OKX `KITE/USDG` stake/spot
- Binance `KITE/USDT` perp short

This is:
- a valid hedge candidate
- one strategy group if quantities and timing align
- `crossQuote = true`
- not a perfect synthetic mirror, but economically related enough for tracking
