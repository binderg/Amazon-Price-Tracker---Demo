import { Hono } from "hono";
import { db } from "../db/index";
import { getProductDetails } from "../services/amazon";
import { settingsLog } from "../logger";

const settings = new Hono();

interface Slot {
  id: number;       // 1–3, used as slot number
  url: string;
  name?: string;
  scrape_interval_minutes?: number;
  geocode?: string;
  zipcode?: string;
  // Per-product alert thresholds
  alert_enabled?: boolean;
  threshold_mode?: "percent" | "absolute" | "both";
  threshold_percent?: number;
  threshold_absolute?: number;
}

function parseAsin(url: string): string | null {
  const match = url.match(/\/dp\/([A-Z0-9]{10})(?:[/?]|$)/i);
  return match ? match[1].toUpperCase() : null;
}

interface SettingsRow {
  id: number;
  slot: number;
  url: string | null;
  name: string | null;
  scrape_interval_minutes: number;
  alert_enabled: number;
  threshold_mode: string;
  threshold_percent: number;
  threshold_absolute: number;
  geocode: string;
  zipcode: string;
}

/**
 * GET /api/settings
 * Returns all 3 slot configurations from the DB (active only).
 * Empty slots are filled with defaults so the frontend always gets 3 rows.
 */
settings.get("/", (c) => {
  settingsLog.debug("fetching slot configuration");
  const rows = db
    .query<SettingsRow, []>(`
      SELECT
        tp.id,
        tp.slot,
        p.url,
        p.name,
        tp.scrape_interval_minutes,
        tp.alert_enabled,
        tp.threshold_mode,
        tp.threshold_percent,
        tp.threshold_absolute,
        tp.geocode,
        tp.zipcode
      FROM tracked_products tp
      LEFT JOIN products p ON p.asin = tp.asin
      WHERE tp.is_active = 1
      ORDER BY tp.slot ASC
    `)
    .all();

  // Build a map of slot → row, then fill 3 slots
  const bySlot = new Map(rows.map((r) => [r.slot, r]));
  const slots = [1, 2, 3].map((slotNum) => {
    const row = bySlot.get(slotNum);
    if (row) {
      return {
        id: slotNum,
        url: row.url ?? "",
        name: row.name ?? "",
        scrape_interval_minutes: row.scrape_interval_minutes,
        alert_enabled: row.alert_enabled === 1,
        threshold_mode: row.threshold_mode ?? "percent",
        threshold_percent: row.threshold_percent ?? 5.0,
        threshold_absolute: row.threshold_absolute ?? 0.0,
        geocode: row.geocode,
        zipcode: row.zipcode,
      };
    }
    return {
      id: slotNum,
      url: "",
      name: "",
      scrape_interval_minutes: 60,
      alert_enabled: true,
      threshold_mode: "percent",
      threshold_percent: 5.0,
      threshold_absolute: 0.0,
      geocode: "us",
      zipcode: "10001",
    };
  });

  settingsLog.debug({ activeSlots: rows.length }, "slot configuration fetched");
  return c.json({ slots });
});

/**
 * POST /api/settings
 * Body: { slots: Slot[] }
 *
 * For each slot:
 *   - If URL is empty → deactivate any existing tracked_product at that slot
 *   - If URL has a valid ASIN → upsert products + tracked_products,
 *     call Scrape.do on first-time adds to seed the first price snapshot
 */
settings.post("/", async (c) => {
  let body: { slots: Slot[] };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { slots } = body;

  if (!Array.isArray(slots) || slots.length === 0) {
    return c.json({ error: "slots array is required" }, 400);
  }

  const slotsWithUrls = slots.filter((s) => s.url?.trim()).length;
  settingsLog.info({ totalSlots: slots.length, slotsWithUrls }, "settings save started");

  const results: { slot: number; status: string; asin?: string; error?: string }[] = [];

  for (const slot of slots) {
    const slotNum = slot.id; // 1–3
    const url = slot.url?.trim() ?? "";
    const interval = slot.scrape_interval_minutes ?? 60;
    const geocode = (slot.geocode ?? "us").toLowerCase();
    const zipcode = slot.zipcode ?? "10001";
    const alertEnabled = slot.alert_enabled !== false ? 1 : 0;
    const thresholdMode = slot.threshold_mode ?? "percent";
    const thresholdPercent = slot.threshold_percent ?? Number(process.env.DROP_THRESHOLD_PERCENT ?? 5);
    const thresholdAbsolute = slot.threshold_absolute ?? Number(process.env.DROP_THRESHOLD_ABSOLUTE ?? 0);

    const slotLog = settingsLog.child({ slot: slotNum });

    // Empty URL → deactivate whatever was in this slot
    if (!url) {
      db.run(
        `UPDATE tracked_products SET is_active = 0 WHERE slot = ?`,
        [slotNum]
      );
      slotLog.info("slot cleared (no URL)");
      results.push({ slot: slotNum, status: "cleared" });
      continue;
    }

    const asin = parseAsin(url);
    if (!asin) {
      slotLog.warn({ url }, "could not parse ASIN from URL");
      results.push({ slot: slotNum, status: "error", error: "Could not parse ASIN from URL" });
      continue;
    }

    try {
      // Check if this ASIN+region combo is already tracked
      const existing = db
        .query<{ id: number }, [string, string, string]>(
          `SELECT id FROM tracked_products WHERE asin = ? AND geocode = ? AND zipcode = ?`
        )
        .get(asin, geocode, zipcode);

      if (!existing) {
        slotLog.info({ asin, geocode, zipcode, interval }, "new product — fetching from Scrape.do");
        // First time seeing this product — fetch from Scrape.do to seed data
        const data = await getProductDetails(asin, geocode, zipcode);

        // Upsert into products
        db.run(
          `INSERT INTO products (asin, brand, name, url, thumbnail, currency, currency_symbol, technical_details, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
           ON CONFLICT(asin) DO UPDATE SET
             brand = excluded.brand,
             name = excluded.name,
             url = excluded.url,
             thumbnail = excluded.thumbnail,
             currency = excluded.currency,
             currency_symbol = excluded.currency_symbol,
             technical_details = excluded.technical_details,
             updated_at = unixepoch()`,
          [
            asin,
            data.brand ?? null,
            data.name ?? null,
            data.url ?? url,
            data.thumbnail ?? null,
            data.currency ?? "USD",
            data.currency_symbol ?? "$",
            JSON.stringify(data.technical_details ?? {}),
          ]
        );

        // Deactivate any previous tracked product in this slot
        db.run(`UPDATE tracked_products SET is_active = 0 WHERE slot = ?`, [slotNum]);

        // Insert new tracked_product with alert thresholds
        db.run(
          `INSERT INTO tracked_products
             (asin, slot, geocode, zipcode, scrape_interval_minutes, last_scraped_at, is_active,
              alert_enabled, threshold_mode, threshold_percent, threshold_absolute)
           VALUES (?, ?, ?, ?, ?, unixepoch(), 1, ?, ?, ?, ?)`,
          [asin, slotNum, geocode, zipcode, interval,
           alertEnabled, thresholdMode, thresholdPercent, thresholdAbsolute]
        );

        // Seed first price snapshot
        db.run(
          `INSERT INTO price_snapshots (asin, geocode, zipcode, price, list_price, rating, total_ratings, is_prime, is_sponsored, shipping_info, more_buying_choices)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            asin,
            geocode,
            zipcode,
            data.price ?? null,
            data.list_price ?? null,
            data.rating ?? null,
            data.total_ratings ?? null,
            data.is_prime ? 1 : 0,
            data.is_sponsored ? 1 : 0,
            JSON.stringify(data.shipping_info ?? []),
            JSON.stringify(data.more_buying_choices ?? null),
          ]
        );

        // Upsert images (replace all for this ASIN)
        db.run(`DELETE FROM product_images WHERE asin = ?`, [asin]);
        for (const [i, img] of (data.images ?? []).entries()) {
          db.run(
            `INSERT INTO product_images (asin, url, width, height, display_order) VALUES (?, ?, ?, ?, ?)`,
            [asin, img.url, img.width ?? null, img.height ?? null, i]
          );
        }

        // Insert best seller rankings snapshot
        for (const bsr of data.best_seller_rankings ?? []) {
          db.run(
            `INSERT INTO best_seller_rankings (asin, category, rank, geocode) VALUES (?, ?, ?, ?)`,
            [asin, bsr.category, bsr.rank, geocode]
          );
        }

        slotLog.info(
          { asin, name: data.name?.slice(0, 60), price: data.price, interval },
          "product added and seeded"
        );
        results.push({ slot: slotNum, status: "added", asin });
      } else {
        // Already tracked — update settings including alert thresholds
        db.run(
          `UPDATE tracked_products
           SET scrape_interval_minutes = ?, slot = ?, is_active = 1,
               alert_enabled = ?, threshold_mode = ?, threshold_percent = ?, threshold_absolute = ?
           WHERE asin = ? AND geocode = ? AND zipcode = ?`,
          [interval, slotNum, alertEnabled, thresholdMode, thresholdPercent, thresholdAbsolute,
           asin, geocode, zipcode]
        );

        // Deactivate any *other* product that was previously in this slot
        db.run(
          `UPDATE tracked_products SET is_active = 0
           WHERE slot = ? AND NOT (asin = ? AND geocode = ? AND zipcode = ?)`,
          [slotNum, asin, geocode, zipcode]
        );

        // Update display name if provided
        if (slot.name) {
          db.run(`UPDATE products SET name = ?, updated_at = unixepoch() WHERE asin = ?`, [
            slot.name,
            asin,
          ]);
        }

        slotLog.info({ asin, interval, alertEnabled, thresholdMode }, "product settings updated");
        results.push({ slot: slotNum, status: "updated", asin });
      }
    } catch (err: any) {
      slotLog.error({ asin, err: err.message }, "failed to process slot");
      results.push({ slot: slotNum, status: "error", asin, error: err.message });
    }
  }

  const summary = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  settingsLog.info({ summary, results }, "settings save completed");

  return c.json({ results });
});

export default settings;
