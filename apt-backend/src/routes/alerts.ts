import { Hono } from "hono";
import { db } from "../db/index";
import { alertsLog } from "../logger";

const alerts = new Hono();

interface AlertRow {
  id: number;
  asin: string;
  geocode: string;
  zipcode: string;
  previous_price: number;
  current_price: number;
  drop_amount: number;
  drop_percent: number;
  threshold_mode: string;
  webhooks_fired: number;
  webhooks_failed: number;
  detected_at: number;
  name: string | null;
  url: string | null;
}

/**
 * GET /api/alerts
 * Returns the 50 most recent price-drop events joined with product metadata.
 * Shape matches the alert object consumed by AlertItem.jsx.
 */
alerts.get("/", (c) => {
  alertsLog.debug("fetching recent price-drop alerts");
  const rows = db
    .query<AlertRow, []>(`
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
        pde.webhooks_fired,
        pde.webhooks_failed,
        pde.detected_at,
        p.name,
        p.url
      FROM price_drop_events pde
      LEFT JOIN products p ON p.asin = pde.asin
      ORDER BY pde.detected_at DESC
      LIMIT 50
    `)
    .all();

  const result = rows.map((r) => ({
    id: `db-alert-${r.id}`,
    productId: r.asin,
    productName: r.name ?? r.asin,
    productUrl: r.url ?? `https://www.amazon.com/dp/${r.asin}`,
    type: "price_drop",
    previousPrice: r.previous_price,
    currentPrice: r.current_price,
    dropAmount: r.drop_amount,
    dropPercent: r.drop_percent,
    thresholdMode: r.threshold_mode,
    webhooksFired: r.webhooks_fired,
    timestamp: new Date(r.detected_at * 1000).toISOString(),
  }));

  alertsLog.debug({ count: result.length }, "alerts fetched");
  return c.json(result);
});

export default alerts;
