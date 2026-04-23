/**
 * scheduler.ts
 *
 * Periodic price-scraping loop.
 *
 * Every POLL_INTERVAL_MS the scheduler:
 *   1. Queries tracked_products for rows that are due for a scrape
 *      (last_scraped_at IS NULL  OR  age >= scrape_interval_minutes * 60 seconds)
 *   2. For each due product, calls Scrape.do via getProductDetails()
 *   3. Inserts a new price_snapshot row
 *   4. Updates last_scraped_at
 *   5. Compares the new price against the previous snapshot
 *   6. If a drop exceeds the configured threshold → inserts a price_drop_event
 *      and broadcasts a  price_drop  SSE event
 *   7. Always broadcasts a  price_update  SSE event so connected dashboards
 *      refresh their charts in real time
 *
 * SSE event shapes (match what useSSE.js / usePriceData.js expect):
 *
 *   price_update → { product_id, current_price, previous_price, checked_at }
 *   price_drop   → { product_id, product_name, product_url,
 *                    current_price, previous_price,
 *                    drop_amount, drop_percent, checked_at }
 */

import { db } from "../db/index";
import { getProductDetails } from "./amazon";
import { broadcast } from "./sseManager";
import { schedLog } from "../logger";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DueProduct {
  id: number;
  asin: string;
  geocode: string;
  zipcode: string;
  scrape_interval_minutes: number;
  alert_enabled: number;
  threshold_mode: string;
  threshold_percent: number;
  threshold_absolute: number;
  name: string | null;
  url: string | null;
}

interface PriceRow {
  price: number | null;
}

// ─── Config ───────────────────────────────────────────────────────────────────

/** How often to check for due products (ms). 60 s is fine-grained enough. */
const POLL_INTERVAL_MS = 60_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDueProducts(): DueProduct[] {
  return db
    .query<DueProduct, []>(`
      SELECT
        tp.id,
        tp.asin,
        tp.geocode,
        tp.zipcode,
        tp.scrape_interval_minutes,
        tp.alert_enabled,
        tp.threshold_mode,
        tp.threshold_percent,
        tp.threshold_absolute,
        p.name,
        p.url
      FROM tracked_products tp
      LEFT JOIN products p ON p.asin = tp.asin
      WHERE tp.is_active = 1
        AND (
          tp.last_scraped_at IS NULL
          OR (unixepoch() - tp.last_scraped_at) >= tp.scrape_interval_minutes * 60
        )
    `)
    .all();
}

/**
 * Scrape a single product, persist the snapshot, detect price drops,
 * and push SSE events to all connected clients.
 */
async function scrapeProduct(product: DueProduct): Promise<void> {
  const log = schedLog.child({ asin: product.asin, id: product.id });

  log.info("scraping price");

  let data;
  try {
    data = await getProductDetails(product.asin, product.geocode, product.zipcode);
  } catch (err: any) {
    log.error({ err: err.message }, "scrape failed — skipping snapshot");
    return;
  }

  const newPrice = data.price ?? null;
  const now = Math.floor(Date.now() / 1000);

  // ── Fetch previous price before inserting the new snapshot ────────────────
  const prevRow = db
    .query<PriceRow, [string, string, string]>(`
      SELECT price FROM price_snapshots
      WHERE asin = ? AND geocode = ? AND zipcode = ?
      ORDER BY scraped_at DESC
      LIMIT 1
    `)
    .get(product.asin, product.geocode, product.zipcode);

  const prevPrice = prevRow?.price ?? null;

  // ── Insert new snapshot ───────────────────────────────────────────────────
  db.run(
    `INSERT INTO price_snapshots
       (asin, geocode, zipcode, price, list_price, rating, total_ratings,
        is_prime, is_sponsored, shipping_info, more_buying_choices)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      product.asin,
      product.geocode,
      product.zipcode,
      newPrice,
      data.list_price ?? null,
      data.rating ?? null,
      data.total_ratings ?? null,
      data.is_prime ? 1 : 0,
      data.is_sponsored ? 1 : 0,
      JSON.stringify(data.shipping_info ?? []),
      JSON.stringify(data.more_buying_choices ?? null),
    ]
  );

  // ── Update last_scraped_at ────────────────────────────────────────────────
  db.run(`UPDATE tracked_products SET last_scraped_at = ? WHERE id = ?`, [now, product.id]);

  log.info({ newPrice, prevPrice }, "snapshot saved");

  const checkedAt = new Date().toISOString();

  // ── Broadcast price_update to all connected SSE clients ───────────────────
  broadcast("price_update", {
    product_id: product.id,
    current_price: newPrice,
    previous_price: prevPrice,
    checked_at: checkedAt,
  });

  // ── Price-drop detection ──────────────────────────────────────────────────
  if (
    newPrice !== null &&
    prevPrice !== null &&
    product.alert_enabled === 1 &&
    newPrice < prevPrice
  ) {
    const dropAmount = Math.round((prevPrice - newPrice) * 100) / 100;
    const dropPercent = Math.round((dropAmount / prevPrice) * 10000) / 100;

    const mode = product.threshold_mode;
    let triggered = false;

    if (mode === "percent" || mode === "both") {
      if (dropPercent >= product.threshold_percent) triggered = true;
    }
    if (mode === "absolute" || mode === "both") {
      if (dropAmount >= product.threshold_absolute) triggered = true;
    }

    if (triggered) {
      // Persist the event
      db.run(
        `INSERT INTO price_drop_events
           (asin, geocode, zipcode, previous_price, current_price,
            drop_amount, drop_percent, threshold_mode)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          product.asin,
          product.geocode,
          product.zipcode,
          prevPrice,
          newPrice,
          dropAmount,
          dropPercent,
          mode,
        ]
      );

      log.info({ dropAmount, dropPercent, mode }, "price drop detected — broadcasting");

      // Push price_drop SSE event (shape matches useAlerts.js addAlert())
      broadcast("price_drop", {
        product_id: product.id,
        product_name: product.name ?? product.asin,
        product_url: product.url ?? `https://www.amazon.com/dp/${product.asin}`,
        current_price: newPrice,
        previous_price: prevPrice,
        drop_amount: dropAmount,
        drop_percent: dropPercent,
        checked_at: checkedAt,
      });
    }
  }
}

// ─── Main loop ────────────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  const due = getDueProducts();

  if (due.length === 0) {
    schedLog.debug("no products due for scrape");
    return;
  }

  schedLog.info({ count: due.length }, "scraping due products");

  // Scrape sequentially to avoid hammering the upstream API
  for (const product of due) {
    await scrapeProduct(product);
  }
}

/**
 * Start the scheduler. Call once at server boot.
 * Runs an immediate tick, then repeats every POLL_INTERVAL_MS.
 */
export function startScheduler(): void {
  schedLog.info({ pollIntervalMs: POLL_INTERVAL_MS }, "scheduler started");

  // Kick off immediately so newly-started servers don't wait a full minute
  tick().catch((err: any) =>
    schedLog.error({ err: err.message }, "scheduler tick error")
  );

  setInterval(() => {
    tick().catch((err: any) =>
      schedLog.error({ err: err.message }, "scheduler tick error")
    );
  }, POLL_INTERVAL_MS);
}
