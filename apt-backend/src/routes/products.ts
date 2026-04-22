import { Hono } from "hono";
import { db } from "../db/index";

const products = new Hono();

interface TrackedRow {
  id: number;
  slot: number;
  asin: string;
  geocode: string;
  zipcode: string;
  scrape_interval_minutes: number;
  last_scraped_at: number | null;
  is_active: number;
  name: string | null;
  url: string | null;
  thumbnail: string | null;
  brand: string | null;
  currency: string | null;
  currency_symbol: string | null;
  // Alert thresholds
  alert_enabled: number;
  threshold_mode: string;
  threshold_percent: number;
  threshold_absolute: number;
}

interface SnapshotRow {
  price: number | null;
  scraped_at: number;
}

interface HistoryRow {
  price: number | null;
  scraped_at: number;
}

/**
 * GET /api/products
 * Returns all active tracked products joined with their latest price snapshot
 * and up to 60 days of price history.
 */
products.get("/", (c) => {
  const rows = db
    .query<TrackedRow, []>(`
      SELECT
        tp.id,
        tp.slot,
        tp.asin,
        tp.geocode,
        tp.zipcode,
        tp.scrape_interval_minutes,
        tp.last_scraped_at,
        tp.is_active,
        tp.alert_enabled,
        tp.threshold_mode,
        tp.threshold_percent,
        tp.threshold_absolute,
        p.name,
        p.url,
        p.thumbnail,
        p.brand,
        p.currency,
        p.currency_symbol
      FROM tracked_products tp
      LEFT JOIN products p ON p.asin = tp.asin
      WHERE tp.is_active = 1
      ORDER BY tp.slot ASC
    `)
    .all();

  const cutoff = Math.floor(Date.now() / 1000) - 60 * 24 * 60 * 60; // 60 days ago

  const result = rows.map((row, i) => {
    // Latest snapshot
    const latest = db
      .query<SnapshotRow, [string, string, string]>(`
        SELECT price, scraped_at
        FROM price_snapshots
        WHERE asin = ? AND geocode = ? AND zipcode = ?
        ORDER BY scraped_at DESC
        LIMIT 1
      `)
      .get(row.asin, row.geocode, row.zipcode);

    // 60-day history
    const history = db
      .query<HistoryRow, [string, string, string, number]>(`
        SELECT price, scraped_at
        FROM price_snapshots
        WHERE asin = ? AND geocode = ? AND zipcode = ? AND scraped_at >= ?
        ORDER BY scraped_at ASC
      `)
      .all(row.asin, row.geocode, row.zipcode, cutoff);

    const priceHistory = history.map((h) => {
      const d = new Date(h.scraped_at * 1000);
      return {
        date: d.toISOString().split("T")[0],
        price: h.price,
        timestamp: d.toISOString(),
      };
    });

    return {
      id: row.id,
      slot: row.slot ?? i + 1,
      asin: row.asin,
      name: row.name ?? row.asin,
      shortName: row.name ? row.name.slice(0, 40) : row.asin,
      url: row.url ?? `https://www.amazon.com/dp/${row.asin}`,
      image: row.thumbnail ?? null,
      brand: row.brand ?? null,
      currency: row.currency ?? "USD",
      currency_symbol: row.currency_symbol ?? "$",
      currentPrice: latest?.price ?? null,
      active: row.is_active === 1,
      lastChecked: row.last_scraped_at
        ? new Date(row.last_scraped_at * 1000).toISOString()
        : null,
      scrape_interval_minutes: row.scrape_interval_minutes,
      geocode: row.geocode,
      zipcode: row.zipcode,
      priceHistory,
      alertEnabled: row.alert_enabled === 1,
      thresholdMode: row.threshold_mode ?? "percent",
      thresholdPercent: row.threshold_percent ?? 5.0,
      thresholdAbsolute: row.threshold_absolute ?? 0.0,
    };
  });

  return c.json(result);
});

/**
 * PATCH /api/products/:id/active
 * Body: { active: boolean }
 * Toggles is_active on a tracked_product without deleting it or its history.
 */
products.patch("/:id/active", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: "Invalid id" }, 400);

  let body: { active?: boolean };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (typeof body.active !== "boolean") {
    return c.json({ error: "active (boolean) is required" }, 400);
  }

  const info = db.run(
    `UPDATE tracked_products SET is_active = ? WHERE id = ?`,
    [body.active ? 1 : 0, id]
  );

  if (info.changes === 0) return c.json({ error: "Product not found" }, 404);

  return c.json({ id, active: body.active });
});

export default products;
