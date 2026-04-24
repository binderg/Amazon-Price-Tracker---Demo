# ARCHITECTURE

## Overview

PriceWatch is split into two runtime processes:

- `apt-backend`: Bun + Hono API, scheduler, SQLite access, SSE stream
- `apt-frontend`: React + Vite dashboard and settings UI

The application flow is:

1. A user adds product URLs in the Settings UI.
2. The backend parses ASINs, stores product metadata, and seeds the first price snapshot.
3. A scheduler periodically checks due products.
4. Each successful scrape is stored in `price_snapshots`.
5. If the new price crosses the configured threshold, a `price_drop_events` row is written.
6. The backend broadcasts `price_update` and `price_drop` SSE events.
7. The frontend updates charts live and shows in-app alerts.

## Backend Responsibilities

- REST API for products, settings, and alerts
- Scheduler for recurring price checks
- Scrape.do integration for Amazon product data
- Price-drop detection based on previous stored price
- SSE broadcasting for live dashboard updates
- Structured logging for requests, scrapes, scheduler activity, and failures

## Frontend Responsibilities

- Dashboard showing current prices and price history
- Settings modal for tracked URLs and thresholds
- Alerts sidebar for recent price-drop events
- Toast notifications for live price-drop events
- SSE client connection with reconnect/backoff behavior

## Data Model

### `products`
Canonical product metadata keyed by ASIN.

| Column | Type | Notes |
|---|---|---|
| `asin` | TEXT PK | Parsed from Amazon URL |
| `brand` | TEXT | Product brand |
| `name` | TEXT | Product name |
| `url` | TEXT | Canonical product URL |
| `thumbnail` | TEXT | Thumbnail image URL |
| `currency` | TEXT | e.g. `USD` |
| `currency_symbol` | TEXT | e.g. `$` |
| `technical_details` | TEXT | JSON object |
| `created_at` | INTEGER | Unix timestamp |
| `updated_at` | INTEGER | Unix timestamp |

### `tracked_products`
Active monitoring configuration per product/slot.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Internal ID |
| `asin` | TEXT FK | References `products.asin` |
| `slot` | INTEGER | UI display slot, unique |
| `geocode` | TEXT | e.g. `us` |
| `zipcode` | TEXT | Regional pricing input |
| `scrape_interval_minutes` | INTEGER | Per-product interval |
| `last_scraped_at` | INTEGER | Last successful/attempted scrape time |
| `is_active` | INTEGER | 1 active, 0 inactive |
| `alert_enabled` | INTEGER | Enable notifications |
| `threshold_mode` | TEXT | `percent` \| `absolute` \| `both` |
| `threshold_percent` | REAL | Percentage drop threshold |
| `threshold_absolute` | REAL | Absolute drop threshold |
| `created_at` | INTEGER | Unix timestamp |

### `price_snapshots`
Durable history of each price check.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `asin` | TEXT FK | |
| `geocode` | TEXT | |
| `zipcode` | TEXT | |
| `price` | REAL | Can be null if scrape failed |
| `list_price` | REAL | MSRP/list price |
| `rating` | REAL | |
| `total_ratings` | INTEGER | |
| `is_prime` | INTEGER | |
| `is_sponsored` | INTEGER | |
| `shipping_info` | TEXT | JSON array |
| `more_buying_choices` | TEXT | JSON object |
| `scraped_at` | INTEGER | Unix timestamp |

### `price_drop_events`
Durable record of every triggered alert.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `asin` | TEXT FK | |
| `geocode` | TEXT | |
| `zipcode` | TEXT | |
| `previous_price` | REAL | |
| `current_price` | REAL | |
| `drop_amount` | REAL | `previous_price - current_price` |
| `drop_percent` | REAL | |
| `threshold_mode` | TEXT | Which rule triggered |
| `detected_at` | INTEGER | Unix timestamp |

### Supporting Tables

- `product_images`
- `best_seller_rankings`

These are stored for richer product metadata and future UI use.

## Key Routes

### `GET /api/products`
Returns active tracked products with latest snapshot data and 60-day price history.

### `PATCH /api/products/:id/active`
Pauses or resumes tracking without deleting history.

### `GET /api/settings`
Returns the current slot configuration.

### `POST /api/settings`
Upserts tracked products and seeds a first snapshot for newly added items.

### `GET /api/alerts`
Returns recent price-drop events for the alerts sidebar.

### `GET /sse?key=...`
Long-lived EventSource stream for `price_update` and `price_drop` events.

## Scheduler And Detection Flow

The scheduler runs on a fixed poll loop and selects products that are due based on:

- `is_active = 1`
- `last_scraped_at IS NULL`
- or enough time has passed for that product's `scrape_interval_minutes`

For each due product it:

1. Calls Scrape.do using ASIN, geocode, and zipcode.
2. Reads the previous snapshot.
3. Writes a new snapshot.
4. Updates `last_scraped_at`.
5. Broadcasts `price_update`.
6. Checks for a threshold-triggering drop.
7. Writes `price_drop_events` if triggered.
8. Broadcasts `price_drop`.

## Notification Strategy

The implemented notification method is **in-app notification**:

- live toast notification in the browser
- persistent alert entry in the alerts sidebar
- durable event row in `price_drop_events`

This is intentionally reviewer-verifiable without requiring email or third-party chat setup.

## SSE Implementation Notes

The app uses SSE instead of WebSockets because the data flow is one-way: backend to browser.

Important runtime detail:

- Bun v1.1.26 introduced a default idle timeout that breaks quiet SSE streams.
- The backend disables idle timeout for SSE and sends 8-second keepalive pings.
- The frontend reconnects with exponential backoff if the connection drops.

## Logging And Observability

Pino is used for structured logging.

Logged events include:

- server startup
- request/response lifecycle
- SSE connect/disconnect
- scrape start/success/failure
- scheduler ticks and due-product processing
- settings changes
- price-drop detection
- unhandled errors

## Storage And Persistence

The database layer uses [Turso](https://turso.tech) — a hosted libSQL service that is wire-compatible with SQLite. The client is `@libsql/client`, which exposes an async `db.execute({ sql, args })` API. All SQL is standard SQLite syntax; the schema and queries are otherwise identical to what would run against a local `bun:sqlite` file.

The database schema is created on startup by `initDb()` in `db/index.ts` using `db.executeMultiple()` with `CREATE TABLE IF NOT EXISTS` statements, making it safe to call on every boot.

Connection is configured via two environment variables:
- `TURSO_URL` — the libSQL endpoint (e.g. `libsql://your-db.turso.io`)
- `TURSO_TOKEN` — the auth token for the database

Both are stored as GitHub repository secrets and injected into the Azure Container App as environment variables on every deploy by the GitHub Actions workflow.

## Failure Handling

Handled explicitly:

- scrape failure does not crash the scheduler
- individual product failures do not stop the rest of the cycle
- SSE disconnects recover automatically in the browser
- alerts and history survive process restarts because they are stored in SQLite

Not fully handled:

- duplicate notifications from concurrent workers
- upstream service outages beyond logging and retry-on-next-cycle behavior
- a manual `POST /api/check` trigger endpoint is not yet implemented
- full automated tests are not yet implemented
