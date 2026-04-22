import { Hono } from "hono";
import { db } from "../db/index";
import { getProductDetails } from "../services/amazon";

const settings = new Hono();

interface Slot {
  id: number;       // 1–3, used as slot number
  url: string;
  name?: string;
  scrape_interval_minutes?: number;
  geocode?: string;
  zipcode?: string;
}

function parseAsin(url: string): string | null {
  const match = url.match(/\/dp\/([A-Z0-9]{10})(?:[/?]|$)/i);
  return match ? match[1].toUpperCase() : null;
}

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

  const results: { slot: number; status: string; asin?: string; error?: string }[] = [];

  for (const slot of slots) {
    const slotNum = slot.id; // 1–3
    const url = slot.url?.trim() ?? "";
    const interval = slot.scrape_interval_minutes ?? 60;
    const geocode = (slot.geocode ?? "us").toLowerCase();
    const zipcode = slot.zipcode ?? "10001";

    // Empty URL → deactivate whatever was in this slot
    if (!url) {
      db.run(
        `UPDATE tracked_products SET is_active = 0 WHERE slot = ?`,
        [slotNum]
      );
      results.push({ slot: slotNum, status: "cleared" });
      continue;
    }

    const asin = parseAsin(url);
    if (!asin) {
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

        // Insert new tracked_product
        db.run(
          `INSERT INTO tracked_products (asin, slot, geocode, zipcode, scrape_interval_minutes, last_scraped_at, is_active)
           VALUES (?, ?, ?, ?, ?, unixepoch(), 1)`,
          [asin, slotNum, geocode, zipcode, interval]
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

        results.push({ slot: slotNum, status: "added", asin });
      } else {
        // Already tracked — just update the settings (interval, slot, name)
        db.run(
          `UPDATE tracked_products SET scrape_interval_minutes = ?, slot = ?, is_active = 1
           WHERE asin = ? AND geocode = ? AND zipcode = ?`,
          [interval, slotNum, asin, geocode, zipcode]
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

        results.push({ slot: slotNum, status: "updated", asin });
      }
    } catch (err: any) {
      results.push({ slot: slotNum, status: "error", asin, error: err.message });
    }
  }

  return c.json({ results });
});

export default settings;
