# PriceWatch — Amazon Price Drop Monitor

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
- **Database:** SQLite via `bun:sqlite`
- **Frontend:** React + Vite
- **Charts:** Recharts
- **Logging:** Pino
- **Real-time updates:** Server-Sent Events (SSE)
- **Scraping source:** Scrape.do Amazon PDP API

## Why These Choices

- **Bun + Hono:** very fast local iteration, minimal boilerplate, native TypeScript support
- **SQLite:** durable local storage with zero infrastructure overhead for a take-home sized project
- **React + Vite:** quick UI development for a dashboard and settings workflow
- **SSE:** simpler than WebSockets for one-way live updates from backend to browser
- **Scrape.do:** avoids brittle raw HTML parsing and anti-bot handling during a short implementation window

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

## Configure

Use the Settings modal in the UI to:

- add or remove tracked product URLs
- change per-product scrape intervals
- change per-product alert thresholds
- enable or disable alerts per product

No code changes are required to manage the tracked product list.

## End-To-End Verification

1. Start backend and frontend.
2. Open the dashboard at `http://localhost:5173`.
3. Add three Amazon product URLs in Settings and save.
4. Confirm the dashboard shows the products and their historical price data.
5. Leave the app running until the scheduler performs the next due scrape.
6. Watch the backend logs for scrape activity and any detected price drops.
7. If a price drop occurs and exceeds the configured threshold, verify:
   - a `price_drop_events` row is written
   - a live alert appears in the dashboard
   - a toast notification appears in the browser UI

## Docker And Azure Deployment

This repo now includes a single-container deployment path.

### Single container

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

Important note for SQLite on Azure:

- the database file is stored inside the container filesystem by default
- if the container is replaced, that local file is lost
- for a real deployment, mount persistent storage or move the database to a managed service

### Separate frontend/backend option

If you do not want one container, the fallback Azure split is:

- frontend: Azure Static Web Apps or Blob Storage static website hosting
- backend: Azure Container Apps

In that setup, set frontend `VITE_API_BASE_URL` to the backend URL and configure backend `FRONTEND_ORIGIN` to the frontend URL.

## Design And AI Notes

- Tradeoffs and design decisions: [`DESIGN.md`](./DESIGN.md)
- Schema and technical details: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- AI collaboration note: [`AI-NOTES.md`](./AI-NOTES.md)
