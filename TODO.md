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
  - Writes a row to `price_drop_events` (previous price, current price, drop %, timestamp)

- [ ] **Structured logger** (`apt-backend/src/logger.ts`)
  - JSON output: `{ timestamp, level, event, product_id, asin, geocode, price, error }`
  - Events: `scheduler_tick` · `price_check` · `price_drop`
  - Level controlled by `LOG_LEVEL` env var
  - Pretty output in dev via pino-pretty; raw JSON in production

- [ ] **SSE broadcast**
  - Scheduler emits `price_update` and `price_drop` named events to all live `/sse` clients
  - `sse.ts` currently only sends `connected` + keep-alive ping; needs a shared event bus

- [ ] **`POST /api/check`** — manual trigger endpoint
  - Runs a full check cycle immediately (all active products)
  - Used for end-to-end verification without waiting for the interval

### Frontend
- [x] **Switch from demo mode to live API**
  - `DEMO_MODE = false` in `apt-frontend/src/api/apiClient.js`
  - `saveSettings` in `useSettings.js` calls `saveSettingsToBackend()` and refreshes products
  - SSE `/sse` connects with `?key=` auth
  - `useSettings` fetches initial state from `GET /api/settings`
  - `useAlerts` fetches historical alerts from `GET /api/alerts`

### Testing
- [ ] **`tests/scraper.test.ts`** — mock Scrape.do response, assert price correctly extracted
- [ ] **`tests/storage.test.ts`** — insert `price_snapshot` row, read it back, assert values match
- [ ] **`tests/detector.test.ts`** — percent mode, absolute mode, both mode, no-prior-price guard, `alert_enabled = false` guard
- [ ] **`tests/notifier.test.ts`** — assert `price_drop_events` row inserted with correct shape

---

## 🟡 Medium Priority — Deliverables & Polish

### Alerts panel
- [x] **`GET /api/alerts`** (`apt-backend/src/routes/alerts.ts`)
  - Returns recent rows from `price_drop_events`
  - Response shape matches `AlertItem.jsx` component

- [x] **Alerts panel in Dashboard** (`apt-frontend/src/components/alerts/`)
  - `AlertsColumn.jsx` + `AlertItem.jsx` — sidebar showing recent price drop events
  - Product name, old price → new price, drop %, timestamp, "View on Amazon" link
  - Dismiss button persists to localStorage
  - Live SSE `price_drop` events prepend automatically via `useAlerts.addAlert()`

### API
- [ ] **`GET /api/products/:id/history`**
  - Returns full price history for a product as JSON
  - Supports `?from=ISO8601&to=ISO8601` date range params
  - Documents contract as a public-facing REST endpoint

### Docs
- [ ] **`DESIGN.md`** — 1-page tradeoffs doc
   - Tradeoff 1: SQLite vs PostgreSQL (why SQLite now, when to migrate)
   - Tradeoff 2: `setInterval` vs BullMQ/cron (simplicity vs restart durability)
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

- [ ] **Multi-source comparison**
  - Add a second price source (e.g. CamelCamelCamel RSS or another retailer)
  - Show side-by-side price comparison per ASIN in the product detail modal

---

## ✅ Completed

- [x] Backend server setup (Hono + Bun + CORS + API key auth)
- [x] SQLite schema — `products`, `tracked_products`, `price_snapshots`, `price_drop_events`, `product_images`, `best_seller_rankings`
- [x] Per-product alert threshold columns on `tracked_products` (`alert_enabled`, `threshold_mode`, `threshold_percent`, `threshold_absolute`)
- [x] Scrape.do Amazon PDP API integration (`services/amazon.ts`)
- [x] `GET /api/products` — returns products with 60-day price history and alert config
- [x] `GET /api/settings` — returns current 3-slot configuration
- [x] `POST /api/settings` — upserts product slots + alert thresholds, seeds first snapshot
- [x] `GET /api/alerts` — returns recent price_drop_events
- [x] `PATCH /api/products/:id/active` — pause / resume tracking per product
- [x] SSE stub (`/sse`) — connected event + keep-alive ping; `?key=` auth for EventSource
- [x] React + Vite frontend with PrimeReact + Tailwind
- [x] Dashboard with `ProductGrid`, `ProductCard`, `PriceHistoryChart`, `StatsBar`, `ComparisonChart`
- [x] Alerts sidebar (`AlertsColumn`, `AlertItem`) — live + persisted drop events
- [x] `usePriceData` + `useSSE` hooks (with demo-mode simulation)
- [x] `useSettings` — syncs slot config with backend DB + localStorage
- [x] `useAlerts` — loads price_drop_events from API; SSE prepends live alerts
- [x] `SettingsModal` — stacked rows, wide URL input, per-product alert threshold UI
- [x] Pause / Resume button on `ProductCard` (optimistic toggle via `usePriceData.togglePause`)
- [x] Settings clear/delete wired correctly — cleared URL slots immediately remove product card via `applySettingsFilter`
- [x] Mini sparklines on product cards shrunk to `h-10`
- [x] `.env.example` with all config fields documented
- [x] Structured logging with Pino + pino-pretty (dev pretty / prod JSON, per-module child loggers, redaction)
- [x] HTTP request/response logging middleware
- [x] README rewritten to match actual codebase
