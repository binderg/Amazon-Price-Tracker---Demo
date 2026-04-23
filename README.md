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
| Real-time UI | **Server-Sent Events (SSE)** | Push price updates to the browser without polling |
| Logging | **Pino + pino-pretty** | Structured JSON in production; pretty coloured output in dev |
| Config | **`.env` + SQLite** | Secrets and scalars in `.env`; product list and alert thresholds managed via DB |

---

## Architecture

Two processes run in parallel:

```
bun run dev     (apt-backend)   →  Hono API on :3000
bun run dev     (apt-frontend)  →  Vite/React on :5173, proxies /api + /sse → :3000
```

### Backend responsibilities
- REST API for products, price history, alert events
- Scheduler — `setInterval` loop that price-checks active products on a configurable interval
- Scraper — calls Scrape.do Amazon PDP API, stores structured snapshot data
- Price drop detector — compares current vs previous price, evaluates per-product threshold
- SSE broadcaster — pushes `price_update` / `price_drop` events to connected browser clients
- Structured JSON logger — every check and price event captured with enough detail to debug from logs alone

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
│   │   │   ├── auth.ts           # API key guard (header + ?key= query param for SSE)
│   │   │   └── logger.ts         # HTTP request/response logging middleware
│   │   ├── routes/
│   │   │   ├── products.ts       # GET /api/products, PATCH /api/products/:id/active
│   │   │   ├── settings.ts       # GET /api/settings, POST /api/settings
│   │   │   ├── alerts.ts         # GET /api/alerts (price_drop_events)
│   │   │   ├── alerts.ts         # GET /api/alerts (price_drop_events)
│   │   │   └── sse.ts            # GET /sse (EventSource stream)
│   │   ├── services/
│   │   │   ├── amazon.ts         # Scrape.do Amazon PDP API client
│   │   │   ├── scheduler.ts      # TODO: setInterval price check loop
│   │   │   └── detector.ts       # TODO: price drop comparison logic
│   │   └── logger.ts             # Pino singleton + named child loggers per module
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
│   │   │   └── mockData.js       # Seeded mock products + helpers (demo mode only)
│   │   ├── components/
│   │   │   ├── alerts/           # AlertsColumn, AlertItem (live + persisted drop events)
│   │   │   ├── dashboard/        # Dashboard, ProductGrid, ProductCard, charts, StatsBar
│   │   │   ├── layout/           # Header (SSE badge, refresh, settings button)
│   │   │   └── settings/         # SettingsModal (slots + alert thresholds)
│   │   └── hooks/
│   │       ├── usePriceData.js   # Loads products from API, applies SSE updates
│   │       ├── useSettings.js    # Syncs slot config with backend DB + localStorage
│   │       ├── useAlerts.js      # Loads price_drop_events from API; SSE prepends live alerts
│   │       └── useSSE.js         # EventSource wrapper (?key= auth); demo mode simulation
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
| `detected_at` | INTEGER | Unix timestamp |

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
GET  /api/settings
```
Returns the current 3-slot configuration from the DB. Empty slots are filled with defaults so
the frontend always receives a full 3-element array.

```
POST /api/settings
Body: { slots: [{ id, url, name?, scrape_interval_minutes?, geocode?, zipcode?,
                  alert_enabled?, threshold_mode?, threshold_percent?, threshold_absolute? }] }
```
Upserts products and tracked slots. Calls Scrape.do to seed the first price snapshot on new
ASINs. Empty `url` deactivates the slot while preserving its history.

### Alerts
```
GET  /api/alerts
```
Returns the 50 most recent rows from `price_drop_events`, joined with product name and URL.
Each entry is shaped to match the `AlertItem` component directly.

### Price check (dev trigger) — *TODO*
```
POST /api/check          Runs a full check cycle immediately
```

### SSE
```
GET  /sse?key=<API_KEY>  EventSource stream
```
The API key is passed as a query param because browser `EventSource` cannot set custom headers.
Currently emits `connected` on open and `: ping` keep-alives every 30 s.

Planned events (added with the scheduler service):
```
event: price_update  data: { product_id, current_price, checked_at }
event: price_drop    data: { product_id, product_name, asin, previous_price, current_price,
                              drop_amount, drop_percent, checked_at, product_url }
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

# Logging — trace | debug | info | warn | error | fatal
# Defaults: debug in development, info in production
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
- Every triggered alert is written to `price_drop_events`

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

## Logging

Structured logging is implemented with **[Pino](https://getpino.io)** + **pino-pretty**.

### Output format

| Environment | Format | How |
|---|---|---|
| Development (`NODE_ENV` ≠ `production`) | Coloured, human-readable via pino-pretty | Automatic |
| Production | Newline-delimited JSON to stdout | Pipe to any log aggregator |

Development output looks like:
```
18:42:03.412  INFO  db › database ready  path=".../data/apt.db"
18:42:03.415  INFO  http › apt-backend listening on :3000  port=3000 env=development
18:42:05.120  DEBUG http › → request  reqId=req-1 method=GET path=/api/products
18:42:05.131  INFO  http › ← 200  reqId=req-1 method=GET path=/api/products status=200 ms=11
18:42:09.880  INFO  scrape › scrape started  asin=B09XS7JWHH geocode=us zipcode=10001
18:42:11.203  INFO  scrape › scrape completed  asin=B09XS7JWHH ms=1323 price=279.99 name="Sony WH-1000XM5..."
18:42:11.210  INFO  settings › product added and seeded  slot=1 asin=B09XS7JWHH price=279.99 interval=60
18:42:11.214  INFO  settings › settings save completed  summary={added:1,updated:0,cleared:2}
```

### Modules and child loggers

Each module imports its own named child logger from `src/logger.ts`, so every line carries a
`module` field you can filter on:

| Logger | Module tag | Used in |
|---|---|---|
| `httpLog` | `http` | Request/response middleware |
| `scrapeLog` | `scrape` | `services/amazon.ts` |
| `settingsLog` | `settings` | `routes/settings.ts` |
| `productsLog` | `products` | `routes/products.ts` |
| `alertsLog` | `alerts` | `routes/alerts.ts` |
| `sseLog` | `sse` | `routes/sse.ts` |
| `dbLog` | `db` | `db/index.ts` |

### What gets logged

| Event | Level | Key fields |
|---|---|---|
| Server start | `info` | `port`, `env`, `logLevel`, `frontendOrigin` |
| DB ready | `info` | `path` |
| Every HTTP request in | `debug` | `reqId`, `method`, `path`, `ua` |
| Every HTTP response | `info/warn/error` | `reqId`, `status`, `ms`, `bytes` |
| SSE connect / disconnect | `info` | `reqId`, `path` |
| Scrape started | `info` | `asin`, `geocode`, `zipcode` |
| Scrape completed | `info` | `asin`, `ms`, `price`, `name`, `rating` |
| Scrape network error | `error` | `asin`, `err` |
| Scrape HTTP/API error | `error` | `asin`, `status`, `errorMessage`, `ms` |
| Settings save started | `info` | `totalSlots`, `slotsWithUrls` |
| Slot cleared | `info` | `slot` |
| New product seeded | `info` | `slot`, `asin`, `name`, `price`, `interval` |
| Product settings updated | `info` | `slot`, `asin`, `interval`, `alertEnabled`, `thresholdMode` |
| Slot processing error | `error` | `slot`, `asin`, `err` |
| Settings save completed | `info` | `summary` (e.g. `{added:1, updated:1, cleared:1}`) |
| Product active toggled | `info` | `id`, `active` |
| Webhook registered | `info` | `id`, `url` |
| Webhook deleted | `info` | `id` |
| Unhandled error | `error` | `err`, `stack`, `url` |

### Configuration

Set `LOG_LEVEL` in `.env` to control verbosity:

```env
LOG_LEVEL=debug    # trace | debug | info | warn | error | fatal
```

Defaults: `debug` in development, `info` in production.

Sensitive values (`x-api-key`, `SCRAPE_DO_TOKEN`, etc.) are automatically **redacted** in all
log output via Pino's built-in `redact` option.

---

## Failure Handling

| Failure | Behavior |
|---|---|
| Scrape.do fetch fails (network / timeout) | Null-price row in `price_snapshots`; scheduler continues |
| Scrape.do returns `status: "error"` | Same as above; error message logged |
| DB write fails | Log error; skip this check cycle |
| DB read fails at startup | Crash with error (unrecoverable) |
| All products fail in a cycle | `warn` log; scheduler continues |

**Explicitly not handled:**
- Amazon IP ban / CAPTCHA — logged as a null price, no automatic recovery
- DB corruption — crash and restart required

---

## Tests

One meaningful test per layer (`bun test`):

| Layer | File | What it tests |
|---|---|---|
| Scraper | `tests/scraper.test.ts` | Mock Scrape.do response → assert price extracted correctly |
| Storage | `tests/storage.test.ts` | Insert `price_snapshot` row → read it back → assert values match |
| Detector | `tests/detector.test.ts` | Percent mode, absolute mode, both mode, no-prior-price guard |

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
3. Trigger an immediate check: `POST /api/check` (once the scheduler service is built)
4. Lower the threshold (e.g. to 0.1%) in Settings, re-trigger — you should see the price drop logged

---

## Tradeoffs Summary

See [DESIGN.md](./DESIGN.md) for the full discussion. Short version:

| Decision | Choice | Key tradeoff |
|---|---|---|
| Storage | SQLite | Zero-setup durability vs. no concurrent writes at 10x scale |
| Scheduler | `setInterval` | Simplicity vs. no persistence across restarts |
| Notification | In-app alerts + SSE | Real-time UI visibility vs. no external delivery channel |
| Scraping | Scrape.do managed API | No selector fragility vs. paid dependency and per-request cost |
| Product config | DB-managed slots | Runtime add/remove vs. DB is now a hard startup dependency |
| Alert thresholds | Per-product in DB | Fine-grained control vs. slightly more complex query/save path |
