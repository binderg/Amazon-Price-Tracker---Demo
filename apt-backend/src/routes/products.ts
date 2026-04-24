import { Hono } from "hono";
import { db } from "../db/index";
import { productsLog } from "../logger";
import { checkProductById } from "../services/scheduler";

const products = new Hono();

/**
 * GET /api/products
 * Returns all active tracked products joined with their latest price snapshot
 * and up to 60 days of price history.
 */
products.get("/", async (c) => {
  productsLog.debug("fetching all active products with history");

  const rowsResult = await db.execute(`
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
  `);

  const rows = rowsResult.rows;
  const cutoff = Math.floor(Date.now() / 1000) - 60 * 24 * 60 * 60; // 60 days ago

  const result = await Promise.all(
    rows.map(async (row, i) => {
      const asin = row.asin as string;
      const geocode = row.geocode as string;
      const zipcode = row.zipcode as string;

      const latestResult = await db.execute({
        sql: `SELECT price, scraped_at FROM price_snapshots
              WHERE asin = ? AND geocode = ? AND zipcode = ?
              ORDER BY scraped_at DESC LIMIT 1`,
        args: [asin, geocode, zipcode],
      });

      const historyResult = await db.execute({
        sql: `SELECT price, scraped_at FROM price_snapshots
              WHERE asin = ? AND geocode = ? AND zipcode = ? AND scraped_at >= ?
              ORDER BY scraped_at ASC`,
        args: [asin, geocode, zipcode, cutoff],
      });

      const latest = latestResult.rows[0] ?? null;

      const priceHistory = historyResult.rows.map((h) => {
        const d = new Date((h.scraped_at as number) * 1000);
        return {
          date: d.toISOString().split("T")[0],
          price: h.price,
          timestamp: d.toISOString(),
        };
      });

      return {
        id: row.id,
        slot: (row.slot as number) ?? i + 1,
        asin,
        name: (row.name as string) ?? asin,
        shortName: row.name ? (row.name as string).slice(0, 40) : asin,
        url: (row.url as string) ?? `https://www.amazon.com/dp/${asin}`,
        image: (row.thumbnail as string) ?? null,
        brand: (row.brand as string) ?? null,
        currency: (row.currency as string) ?? "USD",
        currency_symbol: (row.currency_symbol as string) ?? "$",
        currentPrice: latest?.price ?? null,
        active: (row.is_active as number) === 1,
        lastChecked: row.last_scraped_at
          ? new Date((row.last_scraped_at as number) * 1000).toISOString()
          : null,
        scrape_interval_minutes: row.scrape_interval_minutes,
        geocode,
        zipcode,
        priceHistory,
        alertEnabled: (row.alert_enabled as number) === 1,
        thresholdMode: (row.threshold_mode as string) ?? "percent",
        thresholdPercent: (row.threshold_percent as number) ?? 5.0,
        thresholdAbsolute: (row.threshold_absolute as number) ?? 0.0,
      };
    })
  );

  productsLog.debug(
    { count: result.length, asins: result.map((p) => p.asin) },
    "products fetched"
  );
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

  const result = await db.execute({
    sql: `UPDATE tracked_products SET is_active = ? WHERE id = ?`,
    args: [body.active ? 1 : 0, id],
  });

  if (result.rowsAffected === 0) {
    productsLog.warn({ id }, "toggle active: product not found");
    return c.json({ error: "Product not found" }, 404);
  }

  productsLog.info({ id, active: body.active }, "product active state toggled");
  return c.json({ id, active: body.active });
});

/**
 * POST /api/products/:id/check
 * Immediately triggers a price scrape for the given product outside the
 * normal scheduler cadence.
 */
products.post("/:id/check", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "Invalid id" }, 400);
  }

  productsLog.info({ id }, "manual check requested via POST /:id/check");

  const result = await checkProductById(id);

  if (!result.found) {
    return c.json({ error: "Product not found or not active" }, 404);
  }

  return c.json({ ok: true, message: "Check triggered — results will arrive via SSE" });
});

export default products;
