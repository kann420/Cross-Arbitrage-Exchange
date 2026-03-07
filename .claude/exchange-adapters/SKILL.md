# exchange-adapters

## Purpose
Provide a stable, production-oriented skill for building and maintaining exchange adapter modules for a cross-exchange hedge manager focused on **OKX spot/staking** and **Binance perpetual hedge** first.

This skill helps an agent:
- authenticate safely with exchange APIs
- fetch account data from OKX and Binance
- normalize inconsistent exchange payloads into a shared schema
- preserve raw responses for debugging and replay
- avoid common mistakes around symbols, timestamps, position sizing, and reward/funding accounting

This skill is for **read + portfolio tracking + PnL inputs** first.
It is **not** primarily for execution/trading automation, though the structure should be extensible later.

---

## Scope

### In scope
- Exchange adapter architecture
- Auth/signing patterns
- REST-first account data collection
- Optional websocket notes for future realtime sync
- Shared normalized schemas
- Symbol normalization rules
- Timestamp/unit safety
- Decimal/precision safety
- Snapshot + event ingestion design
- Error handling, retries, and rate-limit behavior
- Binance + OKX support
- Data needed for:
  - balances
  - spot holdings
  - staking/earn holdings
  - futures/perp positions
  - trade fills
  - funding/income/reward history
  - transfer history

### Out of scope
- Auto-trading logic
- Order placement
- Smart execution
- Arbitrage decision logic
- Full PnL engine math
- UI implementation
- Risk engine beyond adapter-level flags
- Support for exchanges beyond Binance and OKX unless explicitly added later

---

## Product context
Target app: a **cross-exchange hedge manager** that tracks strategies such as:
- buy/stake spot on **OKX**
- hedge delta with **Binance perpetual short**
- collect rewards/APR on OKX
- monitor funding, fees, spread, and net carry

Example real-world mismatch:
- OKX spot/staking leg may be `KITE/USDG`
- Binance hedge leg may be `KITEUSDT` perpetual

Because the same asset can appear under different quote currencies and instrument formats, the adapter layer must separate:
1. **canonical asset identity**
2. **exchange instrument identity**
3. **position/economic role** (spot, staking, perp hedge)

---

## Core design principles

1. **Normalize late, preserve raw early**
   - Always store raw exchange payloads before transforming.
   - Normalized objects are for application logic.
   - Raw payloads are for audit/debug/replay.

2. **Use a canonical internal schema**
   - Never let UI or business logic depend directly on exchange-native field names.

3. **Be explicit about economic meaning**
   - `size`, `qty`, `positionAmt`, `pos`, `notional`, and `balance` do not mean the same thing across exchanges.

4. **Timestamps must be consistent**
   - Internally use **milliseconds since epoch** for all timestamps.
   - If an upstream API returns seconds or ISO strings, convert immediately and record the original format if useful.

5. **All money/size math must be decimal-safe**
   - Never trust JS floating point for financial computations.
   - Use `decimal.js`, `big.js`, or equivalent.

6. **Read-only first**
   - Adapter implementation should assume read-only keys at first.
   - Do not require trade permissions for tracking.

7. **Separate transport from normalization**
   - Each adapter should have:
     - client/auth layer
     - endpoint fetchers
     - normalization layer
     - orchestration layer

8. **Differentiate snapshot data vs event history**
   - Balances and open positions are snapshots.
   - Fills, funding, rewards, and transfers are events.

---

## Recommended stack
- Language: **TypeScript**
- Runtime: **Node.js**
- HTTP: `fetch` or `axios`
- Validation: `zod`
- Decimal math: `decimal.js`
- Persistence: PostgreSQL
- Scheduler: cron/worker queue
- Logging: structured JSON logs
- Optional caching: Redis

---

## Recommended folder structure

```text
src/
  exchanges/
    shared/
      types.ts
      enums.ts
      symbol-normalization.ts
      decimal.ts
      errors.ts
      rate-limit.ts
      validators.ts
    okx/
      okx.client.ts
      okx.signing.ts
      okx.endpoints.ts
      okx.normalizers.ts
      okx.adapter.ts
      okx.schemas.ts
    binance/
      binance.client.ts
      binance.signing.ts
      binance.endpoints.ts
      binance.normalizers.ts
      binance.adapter.ts
      binance.schemas.ts
  ingestion/
    snapshots/
    events/
  db/
  services/
```

---

## Canonical internal enums

```ts
type Exchange = 'okx' | 'binance';

type InstrumentType =
  | 'spot'
  | 'perpetual'
  | 'staking'
  | 'earn'
  | 'funding'
  | 'transfer'
  | 'unknown';

type PositionSide = 'long' | 'short' | 'flat';

type EventType =
  | 'trade_fill'
  | 'funding_fee'
  | 'staking_reward'
  | 'earn_reward'
  | 'fee'
  | 'transfer'
  | 'rebate'
  | 'interest'
  | 'unknown';

type AccountScope =
  | 'spot'
  | 'funding'
  | 'earn'
  | 'unified'
  | 'futures'
  | 'margin'
  | 'unknown';
```

---

## Canonical symbol normalization rules

### Goal
Map exchange-specific instruments into a shared asset model without losing exchange-specific details.

### Rule 1: distinguish asset from instrument
Use separate fields:
- `baseAsset`: e.g. `KITE`
- `quoteAsset`: e.g. `USDG`, `USDT`
- `canonicalAsset`: e.g. `KITE`
- `symbolNative`: exchange-native symbol/instrument id
- `instrumentType`: spot / perpetual / staking / earn

### Rule 2: canonical hedge grouping uses `canonicalAsset`, not quote
For hedge grouping, `KITE/USDG` spot and `KITEUSDT` perp can belong to the same strategy **only if**:
- same `canonicalAsset = KITE`
- defined strategy config allows quote mismatch
- business layer accepts cross-quote valuation via reference price

### Rule 3: quotes matter for valuation
Even if grouped under same asset:
- `KITE/USDG` and `KITE/USDT` are not numerically interchangeable
- value should be converted into a chosen reporting currency, usually `USDT` or `USD`

### Rule 4: perpetual instruments must keep venue-native identifiers
Examples:
- OKX swap instrument might look like `BTC-USDT-SWAP`
- Binance perp may look like `BTCUSDT`

Store both:
- `symbolNative`
- derived `canonicalAsset`

### Rule 5: symbol normalization must not infer economics blindly
Do not assume:
- same base asset means same strategy
- same asset means same hedge ratio
- same quote means same market type

Normalization is for identity, not for trading intent.

---

## Canonical schemas

### Normalized balance snapshot
```ts
interface NormalizedBalance {
  exchange: Exchange;
  accountScope: AccountScope;
  asset: string;                 // e.g. USDT, BTC, KITE
  available: string;             // decimal string
  locked: string;                // decimal string
  total: string;                 // decimal string
  usdValue?: string;             // decimal string if known
  ts: number;                    // ms epoch
  rawRefId?: string;             // DB pointer to raw payload
}
```

### Normalized holding snapshot
Use for spot or staking/earn holdings.

```ts
interface NormalizedHolding {
  exchange: Exchange;
  instrumentType: 'spot' | 'staking' | 'earn';
  canonicalAsset: string;        // e.g. KITE
  baseAsset: string;
  quoteAsset?: string;
  symbolNative?: string;         // e.g. KITE-USDG or product id
  quantity: string;              // base quantity
  availableQuantity?: string;
  lockedQuantity?: string;
  entryPrice?: string;           // reporting quote if known
  markPrice?: string;            // reporting quote if known
  usdValue?: string;
  apr?: string;                  // optional annualized rate
  productName?: string;          // earn/staking product label
  accountScope: AccountScope;
  ts: number;
  rawRefId?: string;
}
```

### Normalized derivatives position snapshot
```ts
interface NormalizedPosition {
  exchange: Exchange;
  instrumentType: 'perpetual';
  canonicalAsset: string;        // e.g. KITE
  baseAsset: string;             // e.g. KITE
  quoteAsset: string;            // e.g. USDT
  symbolNative: string;          // e.g. KITEUSDT
  side: PositionSide;            // long | short | flat
  quantity: string;              // signed or absolute, choose one convention and document it
  quantityAbs: string;
  entryPrice?: string;
  markPrice?: string;
  liquidationPrice?: string;
  leverage?: string;
  notional?: string;
  marginMode?: string;
  unrealizedPnl?: string;
  realizedPnl?: string;
  fundingSinceOpen?: string;     // optional aggregated field if computed
  ts: number;
  rawRefId?: string;
}
```

### Normalized event
```ts
interface NormalizedEvent {
  exchange: Exchange;
  eventType: EventType;
  canonicalAsset?: string;
  baseAsset?: string;
  quoteAsset?: string;
  symbolNative?: string;
  amount: string;                // signed decimal string
  feeAsset?: string;
  feeAmount?: string;
  pnlAsset?: string;
  accountScope?: AccountScope;
  txId?: string;
  externalRef?: string;
  ts: number;
  rawRefId?: string;
  metadata?: Record<string, unknown>;
}
```

### Normalized transfer event
```ts
interface NormalizedTransfer {
  exchange: Exchange;
  asset: string;
  amount: string;
  fromAccount?: AccountScope;
  toAccount?: AccountScope;
  transferType?: string;
  status?: string;
  txId?: string;
  ts: number;
  rawRefId?: string;
}
```

---

## Adapter interface contract

Each exchange adapter should implement a shared interface like:

```ts
interface ExchangeAdapter {
  getBalances(): Promise<NormalizedBalance[]>;
  getHoldings(): Promise<NormalizedHolding[]>;
  getPositions(): Promise<NormalizedPosition[]>;
  getRecentEvents(params?: { sinceTs?: number; untilTs?: number }): Promise<NormalizedEvent[]>;
  getTransfers(params?: { sinceTs?: number; untilTs?: number }): Promise<NormalizedTransfer[]>;
  healthcheck(): Promise<{ ok: boolean; exchange: Exchange; message?: string }>;
}
```

Optional future methods:
```ts
getFundingHistory()
getRewardHistory()
getTradeFills()
subscribeBalanceAndPositions()
```

---

## Exchange-specific notes

# OKX adapter

## Auth/signing
OKX private API requests typically require:
- API key
- secret
- passphrase
- timestamp
- signature over prehash string per OKX spec

Agent must:
- isolate signing logic into `okx.signing.ts`
- never mix signing with endpoint normalization
- support demo/sandbox toggle only if explicitly enabled

## Data targets for v1
Prioritize fetching:
- balances
- account positions
- spot holdings
- earn/staking balances if available through configured products/accounts
- bills/account events
- transfer history if available and relevant

## Important OKX caveats
1. Different account scopes can change where balances appear.
2. Spot asset, funding asset, and earn/staking balances may not all live in one obvious endpoint.
3. Instrument ids often use hyphenated forms like `BTC-USDT`, `BTC-USDT-SWAP`.
4. Some product/reward records may require separate endpoints and product types.
5. OKX timestamps may appear in string form; convert carefully to ms.

## OKX Simple Earn APR handling

For OKX Simple Earn / Savings, do not rely on only one APR source.

- `/api/v5/finance/savings/balance`
  - returns the current savings position snapshot
  - includes fields like `amt`, `earnings`, and `rate`
  - `rate` here is the current snapshot rate for the position, not the per-hour reward record history

- `/api/v5/finance/savings/lending-history`
  - returns hourly reward records
  - includes fields like `amt`, `earnings`, `rate`, and `ts`
  - `rate` here is the APR attached to that specific hourly reward record
  - this is the correct source when the UI needs the latest hourly APR shown in Simple Earn earnings detail

Recommended rule:
- for `NormalizedHolding.apr` on OKX earn positions:
  - use the most recent `lending-history` record `rate` if available
  - fallback to `savings/balance.rate` only when reward history is empty

Example:
- if latest `lending-history` record for `KITE` has `rate = "1.51"`, show `151.00%`
- if history is unavailable and `savings/balance.rate = "0.01"`, show `1.00%`

Implementation note:
- keep `rate` as a decimal-like string in normalized payloads
- only convert to percent formatting in the UI/service layer
- preserve raw reward history for debugging because hourly APR can change sharply over time

## OKX normalization guidance
- For `instId` like `KITE-USDG`, derive:
  - `baseAsset = KITE`
  - `quoteAsset = USDG`
  - `canonicalAsset = KITE`
- For staking/earn products where no simple pair exists:
  - set `canonicalAsset` from the reward/underlying/base asset
  - preserve original product id/name in `productName` and `symbolNative`

---

# Binance adapter

## Auth/signing
Binance private endpoints typically require:
- API key header
- signed query string with HMAC
- timestamp
- recvWindow optionally

Agent must:
- keep signing logic in `binance.signing.ts`
- support futures/private endpoints separately from spot/private endpoints if needed
- preserve endpoint-specific rate-limit handling

## Data targets for v1
Prioritize fetching:
- spot balances
- futures positions
- position risk/open positions
- income history (funding, realized pnl, commission if needed)
- trade fills
- transfer history if relevant
- simple earn / reward records if needed for future expansion

## Important Binance caveats
1. Symbol formats are compact, e.g. `BTCUSDT`.
2. Futures positions may expose signed quantity semantics; document whether negative means short.
3. Position endpoints and income endpoints represent different layers of truth.
4. Funding and realized pnl are often event history, not a stable snapshot field.
5. Spot and futures data often come from different API namespaces.

## Binance normalization guidance
- For `symbol = KITEUSDT`, derive:
  - `baseAsset = KITE`
  - `quoteAsset = USDT`
  - `canonicalAsset = KITE`
- For perps, set:
  - `instrumentType = perpetual`
  - `side = short` if quantity/sign indicates short per documented parsing rule

---

## Quantity and side conventions

Choose and document one internal convention.

### Recommended convention
- `quantity` on normalized positions is **signed**
  - positive = long
  - negative = short
- `quantityAbs` is always absolute
- `side` is explicit:
  - long
  - short
  - flat

This reduces ambiguity and makes hedge ratio computation easier later.

Example:
```ts
{
  side: 'short',
  quantity: '-1200',
  quantityAbs: '1200'
}
```

For spot/staking holdings:
- `quantity` is always non-negative
- directionality comes from `instrumentType` and strategy role, not signed asset quantity

---

## Timestamp and unit rules

### Mandatory rule
All normalized timestamps must be **milliseconds since epoch**.

### Never do these
- Never mix seconds and milliseconds internally.
- Never leave ISO strings in normalized objects.
- Never compare mixed units.
- Never let DB tables use one unit for trades and another for balances.

### Required helper
Implement a single shared utility:
```ts
function toUnixMs(input: string | number | Date): number
```

Behavior:
- detect likely seconds vs milliseconds
- parse ISO safely
- throw explicit error for invalid timestamps

---

## Decimal handling rules

### Mandatory rule
Use decimal-safe math for:
- quantities
- prices
- notional values
- fees
- funding
- rewards
- PnL inputs

### Never do these
- Never use plain JS float math for production PnL
- Never round early during normalization
- Never stringify after lossy conversion if exact string already exists upstream

### Recommended
- Preserve original numeric strings when possible
- Convert to Decimal only when computing
- Store normalized values as decimal strings

---

## Persistence rules

### Always persist raw payloads
Store:
- exchange
- endpoint
- fetchedAt
- request context
- raw JSON body
- hash or dedupe key if helpful

### Store normalized snapshots separately
Suggested tables:
- `raw_exchange_payloads`
- `balance_snapshots`
- `holding_snapshots`
- `position_snapshots`
- `exchange_events`
- `transfer_events`

### Why
This enables:
- replay
- backfill
- debugging schema regressions
- audit trail
- safe parser refactors

---

## Error handling rules

### Categories
1. Auth errors
2. Permission errors
3. Rate-limit errors
4. Temporary exchange/server errors
5. Parsing/schema drift errors
6. Empty data / no positions / no rewards cases

### Rules
- Log exchange, endpoint, account, and request window on failure
- Do not swallow parsing failures silently
- Distinguish:
  - hard failure
  - partial failure
  - empty valid response
- Allow ingestion to continue for unaffected endpoints when possible

Example:
- reward endpoint fails
- balances and positions still ingest
- mark account state as partial with alert

---

## Rate-limit and retry policy

### Principles
- Respect exchange rate limits
- Use jittered exponential backoff for retriable failures
- Avoid burst-fetching many account endpoints in parallel without controls

### Recommended
- central request wrapper
- endpoint-specific retry rules
- retry only on transient failures
- do not retry auth/signature errors blindly

Pseudo-policy:
- 429 / explicit rate-limit -> backoff + retry
- 5xx -> retry with capped attempts
- 4xx auth/permission -> fail fast
- schema validation failure -> fail and alert

---

## Healthcheck behavior

Each adapter should expose a lightweight healthcheck:
- verify credentials are present
- make a low-cost authenticated request
- confirm account access works
- return structured result

Example:
```ts
{
  ok: true,
  exchange: 'binance',
  message: 'Authenticated and able to read account data'
}
```

---

## Ingestion strategy

## Snapshot ingestion
Run on short interval, e.g. every 30-120 seconds depending on needs:
- balances
- holdings
- open positions

## Event ingestion
Run on rolling cursor/window:
- trade fills
- funding history
- rewards
- transfers

### Rules
- Use cursor or sinceTs where available
- Deduplicate by exchange-native identifiers when possible
- Maintain per-endpoint sync checkpoints

Suggested checkpoints:
- `binance_income_last_ts`
- `binance_trades_last_id`
- `okx_bills_last_ts`
- `okx_rewards_last_ts`

---

## Strategy-facing expectations
The adapter layer does **not** decide whether a hedge is good.

It only provides clean data so downstream systems can determine:
- net exposure
- reward accrual
- funding drag
- carry
- current PnL
- rebalance need

The adapter’s job is to answer:
- what assets do we hold?
- where do we hold them?
- what hedge exists?
- what income/cost events occurred?
- what timestamps and symbols do they map to?

---

## Example mapping for the user's KITE setup

### Raw exchange reality
- OKX spot/stake buy: `KITE/USDG`
- Binance hedge: `KITEUSDT` perpetual short

### Correct normalized output
```ts
{
  okxHolding: {
    exchange: 'okx',
    instrumentType: 'staking',
    canonicalAsset: 'KITE',
    baseAsset: 'KITE',
    quoteAsset: 'USDG',
    symbolNative: 'KITE-USDG',
    quantity: '15000'
  },
  binancePosition: {
    exchange: 'binance',
    instrumentType: 'perpetual',
    canonicalAsset: 'KITE',
    baseAsset: 'KITE',
    quoteAsset: 'USDT',
    symbolNative: 'KITEUSDT',
    side: 'short',
    quantity: '-15000',
    quantityAbs: '15000'
  }
}
```

### Important note
These can be grouped under the same strategy because:
- same `canonicalAsset = KITE`

But they must still preserve distinct quote assets:
- OKX valuation source may be `USDG`
- Binance hedge valuation source is `USDT`

The later PnL engine must convert both into the reporting currency consistently.

---

## Validation rules

Use `zod` or equivalent to validate normalized objects before persistence.

### Required checks
- `exchange` must be known
- `ts` must be ms epoch
- quantities must be decimal-like strings
- `canonicalAsset` must be uppercase asset code
- positions must have valid `side`
- perpetual positions must include `symbolNative`
- quote/base fields should exist when inferable

### Soft warnings
- missing `entryPrice`
- missing `markPrice`
- missing `usdValue`
- unknown product name
- unknown transfer subtype

---

## Anti-patterns to avoid

1. **Using UI field names in adapter layer**
   - Bad: `displayPnl`, `aprcardValue`
   - Good: `unrealizedPnl`, `apr`, `rewardAmount`

2. **Hardcoding one exchange’s symbol style globally**
   - Bad: assume all symbols look like `BTCUSDT`
   - Good: preserve native symbol and derive canonical asset

3. **Dropping quote asset because “same base coin anyway”**
   - Dangerous for cross-quote strategies like `KITE/USDG` vs `KITE/USDT`

4. **Mixing raw values with computed values without labels**
   - Always separate fetched vs derived fields

5. **Assuming reward history and funding history behave like trade fills**
   - They are separate event categories

6. **Overwriting previous snapshots without history**
   - Keep historical snapshots for audit and charting

7. **Letting timestamp units drift**
   - This causes empty history bugs and broken pruning

8. **Assuming position sign semantics are the same across exchanges**
   - Parse side explicitly

---

## Recommended implementation sequence

### Phase 1
- shared types
- timestamp/decimal helpers
- symbol normalization utility
- raw payload persistence
- adapter healthchecks

### Phase 2
- OKX balances + holdings + positions
- Binance balances + positions

### Phase 3
- Binance income/funding/trade events
- OKX reward/bill/transfer events

### Phase 4
- checkpoint-based incremental sync
- error classification
- test coverage
- dashboard DTO service layer

---

## Testing guidance

### Unit tests
Test:
- symbol parsing
- timestamp conversion
- signed quantity normalization
- quote/base extraction
- validation failures

### Integration tests
Mock exchange responses for:
- empty account
- single spot holding
- single short perp
- multiple rewards
- schema drift / missing fields

### Golden tests
Create fixed fixture files for:
- OKX KITE/USDG holding
- Binance KITEUSDT short
- known reward/funding history sample

Then verify normalized outputs stay stable across refactors.

---

## Definition of done

The adapter layer is considered good enough for v1 when it can:

1. Authenticate successfully with OKX and Binance read-only API keys
2. Fetch and normalize:
   - balances
   - holdings
   - open perp positions
3. Preserve quote/base/canonical asset identity correctly
4. Correctly represent a setup like:
   - OKX `KITE/USDG`
   - Binance `KITEUSDT` short
5. Persist raw payloads and normalized records
6. Keep all timestamps in milliseconds
7. Survive empty responses and partial endpoint failures cleanly
8. Expose stable typed objects for downstream PnL and dashboard services

---

## Copy-paste implementation notes for future agents

When implementing this skill:
- use TypeScript
- use shared adapter interface
- keep signing/auth isolated per exchange
- persist raw payloads before normalization
- normalize into typed schemas with zod validation
- treat `canonicalAsset` separately from `quoteAsset`
- never collapse `KITE/USDG` and `KITE/USDT` into the same instrument
- do allow them to belong to the same strategy grouping later via `canonicalAsset = KITE`
- use milliseconds for all internal timestamps
- store decimal values as strings
- do not add trading/execution code unless explicitly requested
- build for read-only portfolio tracking first

---

## Nice-to-have future extensions
- websocket support for live balances/positions
- subaccount support
- unified portfolio valuation service
- symbol metadata cache
- reporting currency conversion service
- per-endpoint freshness monitoring
- adapter metrics dashboard
