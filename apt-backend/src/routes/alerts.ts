import { Hono } from "hono";
import { db } from "../db/index";
import { alertsLog } from "../logger";

const alerts = new Hono();

/**
 * GET /api/alerts
 * Returns the 50 most recent price-drop events joined with product metadata.
 * Shape matches the alert object consumed by AlertItem.jsx.
 */
alerts.get("/", async (c) => {
  alertsLog.debug("fetching recent price-drop alerts");

  const result = await db.execute(`
    SELECT
      pde.id,
      pde.asin,
      pde.geocode,
      pde.zipcode,
      pde.previous_price,
      pde.current_price,
      pde.drop_amount,
      pde.drop_percent,
      pde.threshold_mode,
      pde.detected_at,
      p.name,
      p.url
    FROM price_drop_events pde
    LEFT JOIN products p ON p.asin = pde.asin
    ORDER BY pde.detected_at DESC
    LIMIT 50
  `);

  const rows = result.rows.map((r) => ({
    id: `db-alert-${r.id}`,
    productId: r.asin,
    productName: (r.name as string) ?? (r.asin as string),
    productUrl: (r.url as string) ?? `https://www.amazon.com/dp/${r.asin}`,
    type: "price_drop",
    previousPrice: r.previous_price,
    currentPrice: r.current_price,
    dropAmount: r.drop_amount,
    dropPercent: r.drop_percent,
    thresholdMode: r.threshold_mode,
    timestamp: new Date((r.detected_at as number) * 1000).toISOString(),
  }));

  alertsLog.debug({ count: rows.length }, "alerts fetched");
  return c.json(rows);
});

export default alerts;
