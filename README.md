# Amazon Price Drop Monitor

A full-stack application that monitors Amazon product prices, persists price history, and delivers webhook notifications on price drops.

---

## Stack

| Layer | Choice | Reason |
|---|---|---|
| Runtime | Bun | Native TypeScript, fast, built-in SQLite, single toolchain for server + scripts |
| Backend | Hono | Lightweight, minimal boilerplate, runs natively on Bun |
| Database | SQLite via `bun:sqlite` | Zero setup, file-based, survives restarts, no separate process |
| Frontend | React + Vite | Simple SPA, no SSR needed, fast dev loop |
| Charts | Recharts | Composable, works well with React, sufficient for price history |
| Scraping | fetch + Cheerio | Standard HTML fetch + jQuery-style parsing, no headless browser needed |
| Notifications | Outbound webhooks | Consumer registers a URL; system POSTs on price drop |
| Config | `.env` + DB | Secrets and scalars in `.env`; product list managed via API/UI at runtime |

---

## Architecture

Two processes run in parallel:

```
bun run server     → Hono API on :3001
bun run dev        → Vite/React on :5173 (proxies /api → :3001)
```

### Backend responsibilities (Hono)
- REST API for products, price history, and webhook subscriptions
- Scheduler: runs price checks on a configurable interval via `setInterval`
- Scraper: fetches and parses Amazon product pages
- Price drop detector: compares latest price to previous, fires webhooks on drop
- SQLite reads/writes
- Outbound webhook delivery with retry logic

### Frontend responsibilities (React)
- View all tracked products and current prices
- Add/remove products via UI (stored in DB, no config change required)
- Price history chart per product (Recharts)
- Register/unregister webhook URLs
- Toast banner when a price drop is detected (polling `/api/events` or SSE)

---

## Data Model

### `products`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| url | TEXT | Full Amazon product URL |
| name | TEXT | Display name (parsed or user-provided) |
| asin | TEXT | Parsed from URL |
| active | BOOLEAN | Soft delete — preserves history |
| created_at | DATETIME | |

### `price_checks`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| product_id | INTEGER FK | References products.id |
| price | REAL | null if check failed |
| checked_at | DATETIME | |
| success | BOOLEAN | |
| error | TEXT | null if success |

### `webhook_subscriptions`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| url | TEXT | Consumer endpoint |
| created_at | DATETIME | |

---

## API Endpoints

### Products
```
GET    /api/products              List all active products
POST   /api/products              Add a product { url, name? }
DELETE /api/products/:id          Soft-delete (sets active = false)
```

### Price History
```
GET    /api/products/:id/history  Price history for a product
                                  Query params: ?from=ISO8601&to=ISO8601
```

### Webhooks
```
GET    /api/webhooks              List registered webhook URLs
POST   /api/webhooks              Register a webhook { url }
DELETE /api/webhooks/:id          Unregister a webhook
```

### Webhook payload (POST on price drop)
```json
{
  "product_id": 1,
  "product_name": "Sony WH-1000XM5",
  "asin": "B09XS7JWHH",
  "previous_price": 349.99,
  "current_price": 279.99,
  "drop_amount": 70.00,
  "drop_percent": 20.0,
  "checked_at": "2026-04-22T14:00:00Z",
  "product_url": "https://amazon.com/dp/B09XS7JWHH"
}
```

---

## Configuration (`.env`)

```env
PORT=3001
CHECK_INTERVAL_MINUTES=60
DROP_THRESHOLD_PERCENT=5
DROP_THRESHOLD_ABSOLUTE=0
THRESHOLD_MODE=percent        # percent | absolute | both
LOG_LEVEL=info
```

**Note:** Product list is managed via the API/UI and stored in the database. Adding or removing products requires no config change and no restart.

---

## Scraping Strategy

- Fetch Amazon product page HTML with `fetch()`
- Parse with Cheerio, targeting the price selector (`#corePriceDisplay_desktop_feature_div`)
- Wrap every fetch+parse in try/catch — failure logs an error row in `price_checks` and continues
- Checks run concurrently across all active products via `Promise.allSettled()`
- Interval is configurable; default 60 minutes (not aggressive)

**Known fragility:** Amazon's HTML structure changes without notice. If the price selector breaks, checks will log failures but the scheduler keeps running. Documented as a known limitation — in production this would require selector monitoring and alerting.

**ToS note:** Direct scraping technically conflicts with Amazon's Conditions of Use. In a production system this would use the Amazon Creators API or a licensed data provider. For this project, checks run at a conservative interval with no evasion techniques (no proxy rotation, no headless browser).

---

## Price Drop Detection

```
if THRESHOLD_MODE == "percent":
    trigger if (prev - curr) / prev >= DROP_THRESHOLD_PERCENT / 100

if THRESHOLD_MODE == "absolute":
    trigger if (prev - curr) >= DROP_THRESHOLD_ABSOLUTE

if THRESHOLD_MODE == "both":
    trigger if both conditions are met
```

- Compares current price to the most recent successful check
- Does not trigger on first check (no previous price to compare)
- Does not trigger if current check failed

---

## Webhook Delivery

On price drop:
1. Load all registered webhook URLs from DB
2. POST payload to each URL concurrently via `Promise.allSettled()`
3. On failure: wait 5 seconds, retry once
4. On second failure: log final failure with URL, product, and error — do not retry further
5. Delivery result (success/fail) logged per webhook per event

**Tradeoff:** No persistent delivery queue. If the process crashes mid-delivery, some webhooks may not fire. Acceptable for a v1; in production would use a durable queue (e.g. BullMQ + Redis).

---

## Logging

Structured JSON logs via `console.log` (or `pino` if added).

Every log entry includes:
- `timestamp`
- `level` (info / warn / error)
- `event` (price_check | price_drop | webhook_delivery | scheduler_tick)
- `product_id` + `asin` where relevant
- `price`, `previous_price` where relevant
- `error` message on failure

Example:
```json
{
  "timestamp": "2026-04-22T14:00:01Z",
  "level": "info",
  "event": "price_check",
  "product_id": 1,
  "asin": "B09XS7JWHH",
  "price": 279.99,
  "success": true
}
```

---

## Failure Handling

| Failure | Behavior |
|---|---|
| Scrape fetch fails (network) | Log error row in price_checks, continue scheduler |
| Price selector not found | Log error row, continue |
| Webhook delivery fails | Retry once after 5s, then log final failure |
| DB write fails | Log error, skip this check cycle |
| DB read fails at startup | Crash with error (unrecoverable) |
| All products fail in a cycle | Log warn, scheduler continues |

**Explicitly not handled:**
- Amazon IP ban / CAPTCHA response — logged as a parse failure, no automatic recovery
- Webhook consumer returning non-2xx — treated as failure, retried once
- DB corruption — crash and restart required

---

## Tests

One meaningful test per layer:

| Layer | Test |
|---|---|
| Scraper | Mock fetch with fixture HTML, assert correct price extracted |
| Storage | Insert a price_check row, read it back, assert values match |
| Comparison logic | Unit test drop detection: percent mode, absolute mode, both mode, no-previous-price case |
| Webhook delivery | Mock outbound fetch, assert called with correct payload on drop |

Run with:
```bash
bun test
```

---

## Project Structure

```
/
├── server/
│   ├── index.ts          # Hono app entry, routes
│   ├── scheduler.ts      # setInterval loop, orchestrates checks
│   ├── scraper.ts        # fetch + Cheerio, returns price or throws
│   ├── storage.ts        # bun:sqlite reads/writes
│   ├── detector.ts       # price drop comparison logic
│   ├── notifier.ts       # outbound webhook delivery
│   └── logger.ts         # structured log helpers
├── client/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ProductList.tsx
│   │   │   ├── PriceChart.tsx      # Recharts wrapper
│   │   │   ├── AddProduct.tsx
│   │   │   └── WebhookManager.tsx
│   │   └── api.ts        # fetch wrappers for /api
│   └── vite.config.ts    # proxies /api to :3001
├── tests/
│   ├── scraper.test.ts
│   ├── storage.test.ts
│   ├── detector.test.ts
│   └── notifier.test.ts
├── .env.example
├── .gitignore
├── README.md
├── DESIGN.md
└── AI-NOTES.md
```

---

## Install & Run

```bash
# Install dependencies
bun install

# Copy and configure environment
cp .env.example .env

# Run backend
bun run server

# Run frontend (separate terminal)
bun run dev
```

The app will be available at `http://localhost:5173`.

To verify end-to-end:
1. Add a product URL via the UI
2. Trigger a manual check via `POST /api/check` (dev endpoint)
3. Register a webhook URL (use https://webhook.site for testing)
4. Observe the webhook payload delivered on price drop

---

## Tradeoffs (Summary — see DESIGN.md for full discussion)

**SQLite over PostgreSQL:** Zero setup, file-based durability, sufficient for small product sets. Would migrate to Postgres at 10x scale for concurrent writes and connection pooling.

**Outbound webhooks over email/SMS:** More flexible — any consumer can subscribe. Tradeoff is delivery reliability; no durable queue means crashes can lose events. Acceptable for v1.

**`setInterval` over a job queue:** Simple, no dependencies, sufficient for this scale. Tradeoff is no persistence across restarts — in-flight intervals are lost on crash. Cron or BullMQ would be the production path.

**DB-managed product list over config file:** Enables runtime add/remove without restart or config change. Tradeoff is that the DB is now a dependency at startup rather than a flat file.

**Direct scraping over official API:** PA-API was deprecated April 30 2026. Creators API requires approval. Scraping is the only practical option for a project of this scope; documented as a known ToS conflict.