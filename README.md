# PriceWatch — Amazon Price Drop Monitor

**Live demo:** https://pricewatch-app.wittyforest-5eabaeb9.eastus.azurecontainerapps.io/

PriceWatch is a small full-stack application that tracks a configurable set of Amazon product URLs, stores price history durably, detects price drops, and shows live in-app notifications through a web dashboard.

## Legal And Ethical Note

This project should not be relied upon for production or commercial use.

It depends on a third-party Amazon scraping service, and Amazon's Conditions of Use prohibit data mining, robots, scraping, and collection/use of product listings, descriptions, or prices. The relevant Amazon language includes:

> "This license does not include any resale or commercial use of any Amazon Service, or its contents; any collection and use of any product listings, descriptions, or prices; ... or any use of data mining, robots, or similar data gathering and extraction tools."

Source: Amazon Conditions of Use
`https://www.amazon.com/gp/help/customer/display.html?nodeId=GLSBYFE9MGKKQXXM`

This repository is a technical exercise only.

## Stack

- **Backend:** Bun + Hono
- **Database:** Turso (hosted libSQL — SQLite-compatible)
- **Frontend:** React
- **Build tool:** Vite (dev build & static hosting in container)
- **Charts:** Recharts
- **Logging:** Pino
- **Real-time updates:** Server-Sent Events (SSE)
- **Scraping:** Scrape.do Amazon PDP API

## Why These Choices

- **Bun + Hono:** fast iteration, minimal boilerplate, native TypeScript
- **Turso (external DB):** SQLite simplicity without infrastructure, but database lives outside container so code pushes don't wipe data. Azure volumes add complexity; hosted service is simpler.
- **React:** fast dashboard & settings UI
- **Vite:** builds frontend assets for production container; Hono serves the built `dist/` folder alongside API routes
- **SSE:** simpler than WebSockets for one-way updates. Server always-on scheduler naturally feeds events; no external cron job needed.
- **Scrape.do:** avoids HTML selector fragility during a short timeline

## Features

- Track at least 3 Amazon products without changing code
- Configure product URLs, scrape interval, and alert thresholds from the UI
- Persist product metadata, price snapshots, and alert history across restarts
- Detect price drops using per-product percent, absolute, or combined thresholds
- Show live in-app notifications and alert history when a drop is detected
- Visualize historical prices in the dashboard
- Log price checks, failures, and alert activity with structured logs

## High-Level Architecture

- **Backend:** exposes REST endpoints for products, settings, and alerts; runs the scheduler; writes to SQLite; streams SSE events
- **Frontend:** renders the dashboard, settings modal, alerts list, and charts; listens to SSE updates and applies them live
- **Database:** stores tracked products, price history, and price-drop events durably

Detailed schema, data flow, and implementation notes live in [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Install

### Backend

```bash
cd apt-backend
bun install
cp .env.example .env
```

Set at least:

```env
API_KEY=your-shared-key
SCRAPE_DO_TOKEN=your-scrape-do-token
FRONTEND_ORIGIN=http://localhost:5173
PORT=3000
```

### Frontend

```bash
cd apt-frontend
bun install
cp .env.example .env
```

Set:

```env
VITE_API_KEY=your-shared-key
VITE_API_BASE_URL=http://localhost:3000
```

## Run

Start the backend:

```bash
cd apt-backend
bun run dev
```

Start the frontend in a second terminal:

```bash
cd apt-frontend
bun run dev
```

Open `http://localhost:5173`.

## Tests

```bash
cd apt-backend
bun test
```

38 tests across four layers: scraper, storage, drop-detection logic, and SSE notification manager. No external services are required — the scraper layer mocks `fetch`, and the storage tests use an in-memory SQLite database.

## Configure

Use the Settings modal in the UI to:

- add or remove tracked product URLs
- change per-product scrape intervals
- change per-product alert thresholds
- enable or disable alerts per product

No code changes are required to manage the tracked product list.

## End-To-End Verification

### Triggering a check immediately

Each product card has a **Check Now** button that fires `POST /api/products/:id/check`. This triggers the full loop (scrape → snapshot → drop detection → SSE broadcast) on demand without waiting for the scheduler. Use this to verify the system end-to-end in seconds.

You can also call it directly:

```bash
curl -X POST http://localhost:3000/api/products/1/check \
  -H "X-API-Key: your-api-key"
```

### Full walkthrough

1. Start the backend and frontend (`bun run dev` in each directory).
2. Open the dashboard at `http://localhost:5173`.
3. Open Settings and configure three Amazon product URLs. Save.
4. The dashboard shows each product, its current price, and the 60-day price history chart.
5. Click **Check Now** on any product card to trigger an immediate scrape.
6. Watch the backend logs — you will see `scrape started`, `snapshot saved`, and either `no drop detected` or `price drop detected — broadcasting`.
7. To verify drop notification end-to-end, set the alert threshold very low (e.g. 0.01%) in Settings so the next price change triggers one. After clicking Check Now:
   - a `price_drop_events` row appears in the SQLite database
   - a live alert appears in the Alerts sidebar
   - a toast notification fires in the top-right corner
   - the product card price and chart update in real time via SSE

## Deployment

### Local + GitHub Actions → Azure

Push to `main` triggers GitHub Actions workflow:
1. Builds Docker image (compiles React frontend with Vite, copies assets, builds Bun backend)
2. Pushes to Azure Container Registry (ACR)
3. Deploys new image to Azure Container Apps

Database persists via Turso; code pushes don't wipe data.

Required GitHub secrets:
- `TURSO_URL` — libSQL database endpoint
- `TURSO_TOKEN` — auth token
- `ACR_USERNAME`, `ACR_PASSWORD` — container registry credentials
- `AZURE_CREDENTIALS` — service principal JSON for deployments
- `VITE_API_KEY` — frontend API key (must match backend `API_KEY`)

Required GitHub variables:
- `ACR_LOGIN_SERVER`, `IMAGE_NAME` — registry target
- `AZURE_RESOURCE_GROUP`, `AZURE_CONTAINER_APP_NAME` — deployment target
- `VITE_API_BASE_URL` — frontend API endpoint (or empty for same-origin)

### Local Docker

Build:
```bash
docker build -t pricewatch .
```

Run:
```bash
docker run -p 3000:3000 \
  -e API_KEY=test \
  -e SCRAPE_DO_TOKEN=your-token \
  -e TURSO_URL=libsql://... \
  -e TURSO_TOKEN=... \
  pricewatch
```

Open `http://localhost:3000`.

### Single container design

The container build:

- builds the React frontend with Vite
- copies the built `apt-frontend/dist` assets into the image
- runs the Bun backend
- serves both the API and the built frontend from the same Bun process

Build locally:

```bash
docker build -t pricewatch .
```

Run locally:

```bash
docker run -p 3000:3000 \
  -e API_KEY=your-shared-key \
  -e SCRAPE_DO_TOKEN=your-scrape-do-token \
  -e FRONTEND_ORIGIN=http://localhost:3000 \
  -e PORT=3000 \
  pricewatch
```

Open `http://localhost:3000`.

### Azure Container Apps From GitHub

Recommended deployment path: one container on Azure Container Apps, with GitHub Actions building the image from the repository and pushing it to Azure Container Registry.

Why this path:

- avoids Azure App Service quota problems
- keeps frontend and backend in one deployable unit
- avoids manual local Docker pushes after every code change
- works well with this Bun + custom Dockerfile setup

High-level steps:

1. Push this repository to GitHub.
2. Create an Azure Container Registry (ACR).
3. Create an Azure Container Apps environment.
4. Add ACR credentials to GitHub repository secrets.
5. Let GitHub Actions build and push the image on every push to `main`.
6. Create the Azure Container App pointing at the ACR image.
7. Set application settings / environment variables in Azure.

The workflow file already included is:

`/.github/workflows/build-and-deploy.yml`

GitHub repository **secrets** required:

- `ACR_USERNAME`
- `ACR_PASSWORD`
- `AZURE_CREDENTIALS`
- `VITE_API_KEY`

GitHub repository **variables** required:

- `ACR_LOGIN_SERVER` — for example `pricewatchregistry123.azurecr.io`
- `IMAGE_NAME` — for example `pricewatch`
- `AZURE_RESOURCE_GROUP` — for example `pricewatch-rg`
- `AZURE_CONTAINER_APP_NAME` — for example `pricewatch-app`
- `VITE_API_BASE_URL` — leave blank for same-origin deploys, or set to a full backend URL for split deployments

`AZURE_CREDENTIALS` should contain a service-principal JSON payload created with:

```bash
az ad sp create-for-rbac \
  --name github-pricewatch-deployer \
  --role contributor \
  --scopes /subscriptions/<subscription-id>/resourceGroups/pricewatch-rg \
  --json-auth
```

Store the full JSON output as the GitHub secret value.

`VITE_API_KEY` should match the backend `API_KEY` so the built frontend can call the protected `/api/*` routes and `/sse` stream in production.

You can get the ACR credentials from Azure with:

```bash
az acr update --name <your-acr-name> --admin-enabled true
az acr credential show --name <your-acr-name>
```

Typical Azure setup:

```bash
az login
az group create --name pricewatch-rg --location eastus
az acr create --resource-group pricewatch-rg --name <your-acr-name> --sku Basic
az extension add --name containerapp --upgrade
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.OperationalInsights
az containerapp env create --name pricewatch-env --resource-group pricewatch-rg --location eastus
```

Create the container app once:

```bash
az containerapp create \
  --name <your-container-app-name> \
  --resource-group <your-resource-group> \
  --environment pricewatch-env \
  --image <your-acr-login-server>/<your-image-name>:latest \
  --target-port 3000 \
  --ingress external \
  --registry-server <your-acr-login-server> \
  --registry-username <acr-username> \
  --registry-password <acr-password> \
  --env-vars \
    API_KEY=your-shared-key \
    SCRAPE_DO_TOKEN=your-scrape-do-token \
    PORT=3000 \
    FRONTEND_ORIGIN=https://placeholder.local
```

Then get the generated URL and update `FRONTEND_ORIGIN`:

```bash
az containerapp show --name <your-container-app-name> --resource-group <your-resource-group> --query properties.configuration.ingress.fqdn
az containerapp update --name <your-container-app-name> --resource-group <your-resource-group> --set-env-vars FRONTEND_ORIGIN=https://<your-container-app-fqdn>
```

After that initial setup, each push to `main` will:

1. build the Docker image from GitHub
2. push it to ACR
3. update the Azure Container App to the new `latest` image automatically

The build and deploy happen in a single GitHub Actions workflow, so deploy only runs after the image build succeeds. This avoids the race where Azure tries to deploy `latest` before the image exists in ACR.

### Database: Turso (hosted SQLite)

The live deployment uses [Turso](https://turso.tech) — a hosted libSQL service that is wire-compatible with SQLite. The database schema and all queries are unchanged from local SQLite. Data persists across container replacements and redeployments with no infrastructure to manage.

Required environment variables (set as GitHub secrets and Azure Container App env vars):

```env
TURSO_URL=libsql://your-database.turso.io
TURSO_TOKEN=your-turso-auth-token
```

To set up a new Turso database:

1. Create a free account at https://turso.tech
2. Run `turso db create pricewatch`
3. Run `turso db tokens create pricewatch` to get the auth token
4. Add `TURSO_URL` and `TURSO_TOKEN` as GitHub repository secrets
5. The schema is created automatically on first startup via `initDb()` in `db/index.ts`

The GitHub Actions workflow passes both secrets as environment variables to the Container App on every deploy.

### Separate frontend/backend option

If you do not want one container, the fallback Azure split is:

- frontend: Azure Static Web Apps or Blob Storage static website hosting
- backend: Azure Container Apps

In that setup, set frontend `VITE_API_BASE_URL` to the backend URL and configure backend `FRONTEND_ORIGIN` to the frontend URL.

## Chosen Notification Method

Price-drop notifications are delivered **in-app** via three complementary channels:

1. **SSE push** — the backend broadcasts a `price_drop` event the moment a drop is detected; no polling required.
2. **Browser toast** — a PrimeReact toast fires in the top-right corner with the product name, new price, and saving.
3. **Alerts sidebar** — every alert is persisted in `price_drop_events` (SQLite) and surfaced in the dashboard panel, surviving page refreshes.

This channel was chosen because it is immediately verifiable by a reviewer without any external credentials (no email provider, Slack workspace, or webhook endpoint needed). The tradeoff — notifications are not delivered if the browser tab is closed — is documented in `DESIGN.md`.

## Known Limitations

- **No out-of-band notifications.** Alerts are in-app only. If the dashboard is closed, the user does not receive the notification until they next open it. Adding email or webhook delivery would require an additional outbound integration.
- **No duplicate-notification guard.** If two scheduler ticks overlapped (not possible in the current single-process design, but relevant at scale), duplicate `price_drop_events` rows could be written. A transactional idempotency key or advisory lock would fix this.
- **Scrape.do dependency.** All scraping goes through a paid third-party API. If the service is unavailable or the token quota is exhausted, scrapes fail gracefully (logged, scheduler continues) but no price data is collected.
- **No retry/backoff for failed scrapes.** A failed scrape is logged and skipped; it is retried at the next scheduled interval. There is no exponential backoff or dead-letter queue for persistent failures.
- **3-slot product limit is driven by the Scrape.do free tier.** The backend schema supports any number of tracked products, but each price check consumes a Scrape.do API credit. The free tier quota makes tracking more than a few products impractical. Expanding the slot count is a UI change, but doing so on a free tier would exhaust credits quickly.

## Storage Tradeoff: bun:sqlite → Turso

The original implementation used `bun:sqlite` — SQLite built directly into the Bun runtime. This was the right call for local development: zero setup, no extra dependencies, native TypeScript types, synchronous API, and the database file lived alongside the code.

The problem appeared on Azure. Every GitHub push triggers a Docker build and deploys a fresh container image. The SQLite file lived inside the container filesystem, so each new deployment started with an empty database — all tracked products, price history, and alerts were wiped on every push.

The first attempt at a fix was mounting an Azure Files share at the database path (`/app/apt-backend/data`). This required no code changes and kept the `bun:sqlite` API intact. It failed in practice: the Azure Files volume mount caused the container to crash on startup due to cross-resource-group networking issues between the storage account and the Container Apps environment, and the container never reached a healthy state.

The working solution was migrating to [Turso](https://turso.tech) — a hosted libSQL service that is wire-compatible with SQLite. The schema and all SQL queries are unchanged. The only code change was swapping the synchronous `bun:sqlite` API (`db.query().all()`, `db.run()`) for `@libsql/client`'s async equivalent (`await db.execute({ sql, args })`). Data now lives outside the container entirely and survives every deployment.

The takeaway: `bun:sqlite` is the right default for local-first projects. As soon as the deployment model involves ephemeral containers, the database needs to live outside the image — either via a persistent volume mount (if the infrastructure cooperates) or a hosted service.

## Design And AI Notes

- Tradeoffs and design decisions: [`DESIGN.md`](./DESIGN.md)
- Schema and technical details: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- AI collaboration note: [`AI-NOTES.md`](./AI-NOTES.md)
