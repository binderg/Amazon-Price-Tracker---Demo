# PriceWatch — Amazon Price Drop Monitor

A full-stack application that monitors Amazon product prices, persists price history, and delivers webhook notifications on price drops.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | **Bun** | Native TypeScript, built-in SQLite, single toolchain for server and scripts |
| Backend | **Hono** | Lightweight, minimal boilerplate, runs natively on Bun |
| Database | **SQLite** via `bun:sqlite` | Zero setup, file-based, durable across restarts, no separate process |
| Frontend | **React + Vite** | Fast SPA dev loop, no SSR needed |
| UI components | **PrimeReact + Tailwind** | Rich component set, composable utility classes |
| Charts | **Recharts** | Composable, React-native, sufficient for price history |
| Scraping | **Scrape.do Amazon PDP API** | Managed anti-bot / proxy layer; returns structured JSON — no raw HTML parsing |
| Notifications | **Outbound webhooks** | Consumer registers a URL; system POSTs a structured payload on price drop |
| Real-time UI | **Server-Sent Events (SSE)** | Push price updates to the browser without polling |
| Config | **`.env` + SQLite** | Secrets and scalars in `.env`; product list and alert thresholds managed via DB |

---

## Architecture

Two processes run in parallel:

```
bun run dev     (apt-backend)   →  Hono API on :3000
bun run dev     (apt-frontend)  →  Vite/React on :5173, proxies /api + /sse → :3000
```

### Backend responsibilities
- REST API for products, price history, webhooks, alert events
- Scheduler — `setInterval` loop that price-checks active products on a configurable interval
- Scraper — calls Scrape.do Amazon PDP API, stores structured snapshot data
- Price drop detector — compares current vs previous price, evaluates per-product threshold
- Notifier — fires outbound webhooks concurrently, retries once on failure
- SSE broadcaster — pushes `price_update` / `price_drop` events to connected browser clients
- Structured JSON logger — every check and notification event captured with enough detail to debug from logs alone

### Frontend responsibilities
- Dashboard showing all tracked products with current price and mini chart
- Price history chart per product (60-day window)
- Settings modal — configure product URLs, check interval, and per-product alert thresholds
- Live toast notification on price drop via SSE

---

## Project Structure

```
/
├── apt-backend/
│   ├── src/
│   │   ├── index.ts              # Hono app entry, routes, CORS, auth
│   │   ├── db/
│   │   │   └── index.ts          # SQLite init, schema, migrations
│   │   ├── middleware/
│   │   │   └── auth.ts           # API key guard
│   │   ├── routes/
│   │   │   ├── products.ts       # GET /api/products (with history + alert config)
│   │   │   ├── settings.ts       # POST /api/settings (upsert slots + thresholds)
│   │   │   ├── webhooks.ts       # GET/POST/DELETE /api/webhooks
│   │   │   └── sse.ts            # GET /sse (EventSource stream)
│   │   └── services/
│   │       ├── amazon.ts         # Scrape.do Amazon PDP API client
│   │       ├── scheduler.ts      # TODO: setInterval price check loop
│   │       ├── detector.ts       # TODO: price drop comparison logic
│   │       ├── notifier.ts       # TODO: outbound webhook delivery
│   │       └── logger.ts         # TODO: structured JSON logger
│   ├── data/
│   │   └── apt.db                # SQLite database (git-ignored)
│   ├── .env                      # Local secrets (git-ignored)
│   ├── .env.example              # Template — copy to .env
│   └── package.json
│
├── apt-frontend/
│   ├── src/
│   │   ├── App.jsx               # Root — wires PrimeReact, Toast, SSE, Settings
│   │   ├── api/
│   │   │   ├── apiClient.js      # All API calls; DEMO_MODE flag for offline dev
│   │   │   └── mockData.js       # Seeded mock products + helpers
│   │   ├── components/
│   │   │   ├── dashboard/        # Dashboard, ProductGrid, ProductCard, PriceHistoryChart, StatsBar
│   │   │   ├── layout/           # Header (SSE badge, refresh, settings button)
│   │   │   └── settings/         # SettingsModal (slots + alert thresholds)
│   │   └── hooks/
│   │       ├── usePriceData.js   # Loads products, applies SSE updates
│   │       ├── useSettings.js    # Persists slot config to localStorage
│   │       └── useSSE.js         # EventSource wrapper; simulates events in demo mode
│   ├── .env.example
│   └── package.json
│
├── tests/                        # TODO: one test per layer
├── DESIGN.md                     # TODO: tradeoffs doc
├── AI-NOTES.md                   # TODO: AI collaboration notes
└── README.md
```

---

## Data Model

### `products`
Canonical product metadata, keyed by ASIN.

| Column | Type | Notes |
|---|---|---|
| `asin` | TEXT PK | Parsed from URL |
| `brand` | TEXT | |
| `name` | TEXT | From Scrape.do or user-provided |
| `url` | TEXT | Canonical Amazon URL |
| `thumbnail` | TEXT | Product image URL |
| `currency` | TEXT | e.g. `USD` |
| `currency_symbol` | TEXT | e.g. `$` |
| `technical_details` | TEXT | JSON object |
| `created_at` | INTEGER | Unix timestamp |
| `updated_at` | INTEGER | Unix timestamp |

### `tracked_products`
User-configured monitoring slots (1–3). Holds per-product scheduler and alert config.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `asin` | TEXT FK | → `products.asin` |
| `slot` | INTEGER | Display position 1–3, unique |
| `geocode` | TEXT | Market (e.g. `us`) |
| `zipcode` | TEXT | For regional pricing |
| `scrape_interval_minutes` | INTEGER | Per-product check interval |
| `last_scraped_at` | INTEGER | Unix timestamp |
| `is_active` | INTEGER | 0 = soft-deleted, history preserved |
| `alert_enabled` | INTEGER | 1 = notifications on for this product |
| `threshold_mode` | TEXT | `percent` \| `absolute` \| `both` |
| `threshold_percent` | REAL | Min % drop to trigger alert (e.g. `5.0`) |
| `threshold_absolute` | REAL | Min $ drop to trigger alert (e.g. `10.00`) |
| `created_at` | INTEGER | |

### `price_snapshots`
Every price check result. Null `price` = failed check.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `asin` | TEXT FK | |
| `geocode` | TEXT | |
| `zipcode` | TEXT | |
| `price` | REAL | null if scrape failed |
| `list_price` | REAL | Original/MSRP price |
| `rating` | REAL | |
| `total_ratings` | INTEGER | |
| `is_prime` | INTEGER | |
| `is_sponsored` | INTEGER | |
| `shipping_info` | TEXT | JSON array |
| `more_buying_choices` | TEXT | JSON object |
| `scraped_at` | INTEGER | Unix timestamp |

### `price_drop_events`
Persistent log of every alert fired — survives process restarts.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `asin` | TEXT FK | |
| `geocode` | TEXT | |
| `zipcode` | TEXT | |
| `previous_price` | REAL | |
| `current_price` | REAL | |
| `drop_amount` | REAL | `previous - current` |
| `drop_percent` | REAL | |
| `threshold_mode` | TEXT | Which rule triggered the alert |
| `webhooks_fired` | INTEGER | Count of successful deliveries |
| `webhooks_failed` | INTEGER | Count of failed deliveries |
| `detected_at` | INTEGER | Unix timestamp |

### `webhooks`
Registered notification endpoints.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `url` | TEXT UNIQUE | Consumer endpoint |
| `created_at` | INTEGER | |

### `product_images`, `best_seller_rankings`
Supplementary product data from Scrape.do, stored for future UI use.

---

## API Endpoints

All `/api/*` and `/sse` routes require the `X-API-Key` header matching `API_KEY` in `.env`.

### Products
```
GET  /api/products
```
Returns all active tracked products joined with their latest price snapshot,
60-day price history, and per-product alert config.

```json
[{
  "id": 1,
  "slot": 1,
  "asin": "B09XS7JWHH",
  "name": "Sony WH-1000XM5 Wireless Headphones",
  "currentPrice": 279.99,
  "lastChecked": "2026-04-22T14:00:00Z",
  "scrape_interval_minutes": 60,
  "alertEnabled": true,
  "thresholdMode": "percent",
  "thresholdPercent": 5.0,
  "thresholdAbsolute": 0.0,
  "priceHistory": [{ "date": "2026-02-21", "price": 349.99, "timestamp": "…" }]
}]
```

### Settings
```
POST /api/settings
Body: { slots: [{ id, url, name?, scrape_interval_minutes?, geocode?, zipcode?,
                  alert_enabled?, threshold_mode?, threshold_percent?, threshold_absolute? }] }
```
Upserts products and tracked slots. Calls Scrape.do to seed first snapshot on new ASINs.

### Webhooks
```
GET    /api/webhooks
POST   /api/webhooks     { url }
DELETE /api/webhooks/:id
```

### Price check (dev trigger) — *TODO*
```
POST /api/check          Runs a full check cycle immediately
```

### Alerts — *TODO*
```
GET  /api/alerts         Recent price_drop_events, ?asin= filter supported
```

### SSE — *partial*
```
GET  /sse                EventSource stream; currently emits connected + ping
```
Planned events:
```
event: price_update  data: { product_id, current_price, checked_at }
event: price_drop    data: { product_id, product_name, asin, previous_price, current_price,
                              drop_amount, drop_percent, checked_at, product_url }
```

### Webhook payload (POST to registered URLs on price drop)
```json
{
  "product_id": 1,
  "product_name": "Sony WH-1000XM5",
  "asin": "B09XS7JWHH",
  "previous_price": 349.99,
  "current_price": 279.99,
  "drop_amount": 70.00,
  "drop_percent": 20.0,
  "threshold_mode": "percent",
  "checked_at": "2026-04-22T14:00:00Z",
  "product_url": "https://amazon.com/dp/B09XS7JWHH"
}
```

---

## Configuration (`.env`)

```env
# Auth — must match VITE_API_KEY in apt-frontend/.env
API_KEY=test

# Scrape.do token (required) — https://scrape.do
SCRAPE_DO_TOKEN=your-token-here

# Global fallback check interval; per-product override via Settings UI
CHECK_INTERVAL_MINUTES=60

# Global default thresholds; per-product overrides stored in DB
THRESHOLD_MODE=percent          # percent | absolute | both
DROP_THRESHOLD_PERCENT=5
DROP_THRESHOLD_ABSOLUTE=0

PORT=3000
FRONTEND_ORIGIN=http://localhost:5173
LOG_LEVEL=info
```

**Product list** is managed via the Settings UI and stored in the database.
Adding or removing products requires no config change and no restart.

**Per-product thresholds** are set in the Settings modal and stored in `tracked_products`.
They override the global `.env` defaults.

---

## Price Drop Detection Logic

```
THRESHOLD_MODE = "percent":
    trigger if (prev - curr) / prev >= threshold_percent / 100

THRESHOLD_MODE = "absolute":
    trigger if (prev - curr) >= threshold_absolute

THRESHOLD_MODE = "both":
    trigger if BOTH conditions are met simultaneously
```

- Compares current price to the most recent **successful** snapshot
- Does not trigger on the first check (no prior price)
- Does not trigger if the current check failed (null price)
- Per-product `alert_enabled = 0` silences notifications for that slot
- Every triggered alert is written to `price_drop_events` before webhooks are dispatched

---

## Scraping Strategy

- Calls the **Scrape.do Amazon PDP API** (`/plugin/amazon/pdp`) with ASIN + geocode
- Returns structured JSON — no HTML parsing, no selector fragility
- Wrap every call in try/catch — failure stores a null-price row in `price_snapshots` and continues
- All active products checked concurrently via `Promise.allSettled()`
- Conservative default interval (60 min); minimum configurable to 15 min

**ToS note:** Scrape.do handles proxy rotation and cookie management. Direct scraping
without a licensed intermediary conflicts with Amazon's Conditions of Use.

---

## Webhook Delivery

1. Load all registered webhook URLs from DB
2. POST payload to each URL concurrently via `Promise.allSettled()`
3. On failure: wait 5 s, retry once
4. On second failure: log final failure, write to `price_drop_events.webhooks_failed`
5. No persistent delivery queue — crashes mid-delivery may drop events (known, documented in DESIGN.md)

---

## Logging

Structured JSON emitted via the logger service. Every entry includes:

```json
{
  "timestamp": "2026-04-22T14:00:01Z",
  "level": "info",
  "event": "price_check",
  "product_id": 1,
  "asin": "B09XS7JWHH",
  "geocode": "us",
  "price": 279.99,
  "success": true
}
```

Events: `scheduler_tick` · `price_check` · `price_drop` · `webhook_delivery` · `webhook_failure`

---

## Failure Handling

| Failure | Behavior |
|---|---|
| Scrape.do fetch fails (network / timeout) | Null-price row in `price_snapshots`; scheduler continues |
| Scrape.do returns `status: "error"` | Same as above; error message logged |
| Webhook delivery fails | Retry once after 5 s; log final failure |
| DB write fails | Log error; skip this check cycle |
| DB read fails at startup | Crash with error (unrecoverable) |
| All products fail in a cycle | `warn` log; scheduler continues |

**Explicitly not handled:**
- Amazon IP ban / CAPTCHA — logged as a null price, no automatic recovery
- DB corruption — crash and restart required
- Webhook consumer returning non-2xx — treated as failure, retried once

---

## Tests

One meaningful test per layer (`bun test`):

| Layer | File | What it tests |
|---|---|---|
| Scraper | `tests/scraper.test.ts` | Mock Scrape.do response → assert price extracted correctly |
| Storage | `tests/storage.test.ts` | Insert `price_snapshot` row → read it back → assert values match |
| Detector | `tests/detector.test.ts` | Percent mode, absolute mode, both mode, no-prior-price guard |
| Notifier | `tests/notifier.test.ts` | Mock outbound fetch → assert webhook called with correct payload |

> **Status:** test files not yet written — see TODO list.

---

## Install & Run

### Prerequisites
- [Bun](https://bun.sh) ≥ 1.1
- A [Scrape.do](https://scrape.do) account with an API token

### Backend

```bash
cd apt-backend
cp .env.example .env          # fill in API_KEY and SCRAPE_DO_TOKEN
bun install
bun run dev                   # starts Hono on :3000 with --watch
```

### Frontend

```bash
cd apt-frontend
cp .env.example .env          # set VITE_API_KEY to match backend API_KEY
bun install
bun run dev                   # starts Vite on :5173
```

Open **http://localhost:5173** in a browser.

> **Demo mode:** `DEMO_MODE = true` in `apt-frontend/src/api/apiClient.js` serves mock data without
> a running backend. Set it to `false` for live data.

---

## End-to-End Verification

1. Add at least three product URLs in the Settings modal (⚙ button, top right)
2. Confirm each shows a detected ASIN and the initial price appears in the dashboard
3. Register a webhook URL (use [webhook.site](https://webhook.site) for a free test endpoint) via `POST /api/webhooks`
4. Trigger an immediate check: `POST /api/check` (once the scheduler service is built)
5. Lower the threshold (e.g. to 0.1%) in Settings, re-trigger — you should receive a webhook payload

---

## Tradeoffs Summary

See [DESIGN.md](./DESIGN.md) for the full discussion. Short version:

| Decision | Choice | Key tradeoff |
|---|---|---|
| Storage | SQLite | Zero-setup durability vs. no concurrent writes at 10x scale |
| Scheduler | `setInterval` | Simplicity vs. no persistence across restarts |
| Notification | Outbound webhooks | Flexible consumer model vs. no durable delivery queue |
| Scraping | Scrape.do managed API | No selector fragility vs. paid dependency and per-request cost |
| Product config | DB-managed slots | Runtime add/remove vs. DB is now a hard startup dependency |
| Alert thresholds | Per-product in DB | Fine-grained control vs. slightly more complex query/save path |
