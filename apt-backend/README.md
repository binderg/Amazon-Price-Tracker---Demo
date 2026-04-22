# APT Backend

Bun + Elysia backend for the Amazon Price Tracker.

## Setup

1. Install dependencies:
```bash
bun install
```

2. Set your Scrape.do token:
```bash
$env:SCRAPE_DO_TOKEN="your_token_here"
```

3. Run the server:
```bash
bun run dev
```

## API Endpoints

### `GET /health`
Health check.

### `GET /api/product/:asin?geocode=us&zipcode=10001`
Fetch Amazon product details via Scrape.do.

Example:
```bash
curl http://localhost:3000/api/product/B0C7BKZ883?geocode=US&zipcode=10001
```

Response matches the Scrape.do Amazon PDP JSON schema.
