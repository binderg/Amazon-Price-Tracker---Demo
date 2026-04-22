# TODO — PriceWatch

Status key: `[ ]` pending · `[~]` in progress · `[x]` done

---

## 🔴 High Priority — Core Requirements

### Backend services (not yet built)
- [ ] **Scheduler** (`apt-backend/src/services/scheduler.ts`)
  - `setInterval` loop that runs price checks on all `is_active` products
  - Per-product `scrape_interval_minutes` respected — each product tracks its own `last_scraped_at`
  - Global fallback interval from `CHECK_INTERVAL_MINUTES` in `.env`
  - Kicks off on server startup; imported in `index.ts`

- [ ] **Price drop detector** (`apt-backend/src/services/detector.ts`)
  - Compares current price vs most recent successful snapshot for the same `asin + geocode + zipcode`
  - Reads per-product `threshold_mode`, `threshold_percent`, `threshold_absolute` from `tracked_products`
  - Modes: `percent` | `absolute` | `both`
  - No trigger on first check (no prior price) or failed check (null price)
  - No trigger if `alert_enabled = 0` for that product

- [ ] **Notifier** (`apt-backend/src/services/notifier.ts`)
  - Loads all webhook URLs from `webhooks` table
  - POSTs structured payload to each URL concurrently via `Promise.allSettled()`
  - Retry once after 5 s on failure; log final failure
  - Writes a row to `price_drop_events` (previous price, current price, drop %, webhook counts)

- [ ] **Structured logger** (`apt-backend/src/services/logger.ts`)
  - JSON output: `{ timestamp, level, event, product_id, asin, geocode, price, error }`
  - Events: `scheduler_tick` · `price_check` · `price_drop` · `webhook_delivery` · `webhook_failure`
  - Level controlled by `LOG_LEVEL` env var

- [ ] **SSE broadcast**
  - Scheduler emits `price_update` and `price_drop` named events to all live `/sse` clients
  - `sse.ts` currently only sends `connected` + keep-alive ping; needs a shared event bus

- [ ] **`POST /api/check`** — manual trigger endpoint
  - Runs a full check cycle immediately (all active products)
  - Used for end-to-end verification without waiting for the interval

### Frontend
- [ ] **Switch from demo mode to live API**
  - Set `DEMO_MODE = false` in `apt-frontend/src/api/apiClient.js`
  - Wire `saveSettings` in `useSettings.js` to call `saveSettingsToBackend()`
  - Confirm SSE `/sse` connects and receives real events

### Testing
- [ ] **`tests/scraper.test.ts`** — mock Scrape.do response, assert price correctly extracted
- [ ] **`tests/storage.test.ts`** — insert `price_snapshot` row, read it back, assert values match
- [ ] **`tests/detector.test.ts`** — percent mode, absolute mode, both mode, no-prior-price guard, `alert_enabled = false` guard
- [ ] **`tests/notifier.test.ts`** — mock outbound `fetch`, assert webhook called with correct payload shape

---

## 🟡 Medium Priority — Deliverables & Polish

### Alerts panel (new feature)
- [ ] **`GET /api/alerts`** (`apt-backend/src/routes/alerts.ts`)
  - Returns recent rows from `price_drop_events`
  - Supports `?asin=` and `?limit=` query params
  - Response shape: `{ id, asin, product_name, previous_price, current_price, drop_amount, drop_percent, threshold_mode, detected_at }`

- [ ] **Alerts panel in Dashboard** (`apt-frontend/src/components/dashboard/`)
  - Collapsible section or tab below the product grid
  - Shows a list of recent price drop events: product name, old price → new price, drop %, timestamp
  - Badge on the header/tab showing unread count
  - Clicking a row highlights the relevant product card

### API
- [ ] **`GET /api/products/:id/history`**
  - Returns full price history for a product as JSON
  - Supports `?from=ISO8601&to=ISO8601` date range params
  - Documents contract as a public-facing REST endpoint

### Docs
- [ ] **`DESIGN.md`** — 1-page tradeoffs doc
  - Tradeoff 1: SQLite vs PostgreSQL (why SQLite now, when to migrate)
  - Tradeoff 2: `setInterval` vs BullMQ/cron (simplicity vs restart durability)
  - Tradeoff 3: Outbound webhooks vs email/SMS (flexibility vs delivery reliability)
  - Bonus: Scrape.do vs raw scraping; per-product thresholds in DB vs flat `.env`

- [ ] **`AI-NOTES.md`** — honest account of one thing the AI got wrong or oversimplified
  - Where did it mislead or skip a real consideration?
  - How was it caught and fixed?

---

## 🟢 Low Priority — Stretch Goals

- [ ] **Docker / docker-compose**
  - `Dockerfile` for `apt-backend` (Bun base image)
  - `Dockerfile` for `apt-frontend` (Vite build → nginx)
  - `docker-compose.yml` spinning up both services
  - `.dockerignore` files

- [ ] **GitHub Actions CI**
  - Workflow: install → `bun test` on push/PR
  - Optional: build check for frontend

- [ ] **Live-updating Alerts panel**
  - Drive the alerts list from SSE `price_drop` events without a page reload
  - Decide between polling `/api/alerts` vs pure SSE push

- [ ] **Multi-source comparison**
  - Add a second price source (e.g. CamelCamelCamel RSS or another retailer)
  - Show side-by-side price comparison per ASIN in the product detail modal

---

## ✅ Completed

- [x] Backend server setup (Hono + Bun + CORS + API key auth)
- [x] SQLite schema — `products`, `tracked_products`, `price_snapshots`, `webhooks`, `product_images`, `best_seller_rankings`
- [x] `price_drop_events` table added
- [x] Per-product alert threshold columns on `tracked_products` (`alert_enabled`, `threshold_mode`, `threshold_percent`, `threshold_absolute`)
- [x] Scrape.do Amazon PDP API integration (`services/amazon.ts`)
- [x] `GET /api/products` — returns products with 60-day price history and alert config
- [x] `POST /api/settings` — upserts product slots + alert thresholds, seeds first snapshot
- [x] `GET/POST/DELETE /api/webhooks`
- [x] `PATCH /api/products/:id/active` — pause / resume tracking per product
- [x] SSE stub (`/sse`) — connected event + keep-alive ping
- [x] React + Vite frontend with PrimeReact + Tailwind
- [x] Dashboard with `ProductGrid`, `ProductCard`, `PriceHistoryChart`, `StatsBar`
- [x] `usePriceData` + `useSSE` hooks (with demo-mode simulation)
- [x] `SettingsModal` — stacked rows, wide URL input, per-product alert threshold UI
- [x] Pause / Resume button on `ProductCard` (optimistic toggle via `usePriceData.togglePause`)
- [x] `.env.example` with all config fields documented
- [x] README rewritten to match actual codebase
