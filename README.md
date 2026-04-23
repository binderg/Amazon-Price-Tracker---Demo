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

## Design And AI Notes

- Tradeoffs and design decisions: [`DESIGN.md`](./DESIGN.md)
- Schema and technical details: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- AI collaboration note: [`AI-NOTES.md`](./AI-NOTES.md)
