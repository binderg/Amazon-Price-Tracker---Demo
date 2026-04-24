import { createClient } from "@libsql/client";
import { dbLog } from "../logger";

const url = process.env.TURSO_URL;
const authToken = process.env.TURSO_TOKEN;

if (!url) throw new Error("TURSO_URL environment variable is required");

export const db = createClient({ url, authToken });

export async function initDb(): Promise<void> {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS products (
      asin              TEXT PRIMARY KEY,
      brand             TEXT,
      name              TEXT,
      url               TEXT,
      thumbnail         TEXT,
      currency          TEXT,
      currency_symbol   TEXT,
      technical_details TEXT,
      created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS tracked_products (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      asin                    TEXT NOT NULL REFERENCES products(asin),
      slot                    INTEGER NOT NULL DEFAULT 0,
      geocode                 TEXT NOT NULL DEFAULT 'us',
      zipcode                 TEXT NOT NULL DEFAULT '10001',
      scrape_interval_minutes INTEGER NOT NULL DEFAULT 60,
      last_scraped_at         INTEGER,
      is_active               INTEGER NOT NULL DEFAULT 1,
      alert_enabled           INTEGER NOT NULL DEFAULT 1,
      threshold_mode          TEXT    NOT NULL DEFAULT 'percent',
      threshold_percent       REAL    NOT NULL DEFAULT 5.0,
      threshold_absolute      REAL    NOT NULL DEFAULT 0.0,
      created_at              INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(asin, geocode, zipcode),
      UNIQUE(slot)
    );

    CREATE TABLE IF NOT EXISTS price_snapshots (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      asin                TEXT NOT NULL REFERENCES products(asin),
      geocode             TEXT NOT NULL,
      zipcode             TEXT NOT NULL,
      price               REAL,
      list_price          REAL,
      rating              REAL,
      total_ratings       INTEGER,
      is_prime            INTEGER,
      is_sponsored        INTEGER,
      shipping_info       TEXT,
      more_buying_choices TEXT,
      scraped_at          INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_price_snapshots_asin_scraped
      ON price_snapshots(asin, scraped_at);

    CREATE TABLE IF NOT EXISTS product_images (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      asin          TEXT NOT NULL REFERENCES products(asin),
      url           TEXT NOT NULL,
      width         INTEGER,
      height        INTEGER,
      display_order INTEGER NOT NULL DEFAULT 0,
      updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS best_seller_rankings (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      asin        TEXT NOT NULL REFERENCES products(asin),
      category    TEXT NOT NULL,
      rank        INTEGER NOT NULL,
      geocode     TEXT NOT NULL,
      recorded_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_bsr_asin_recorded
      ON best_seller_rankings(asin, recorded_at);

    CREATE TABLE IF NOT EXISTS price_drop_events (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      asin             TEXT    NOT NULL REFERENCES products(asin),
      geocode          TEXT    NOT NULL,
      zipcode          TEXT    NOT NULL,
      previous_price   REAL    NOT NULL,
      current_price    REAL    NOT NULL,
      drop_amount      REAL    NOT NULL,
      drop_percent     REAL    NOT NULL,
      threshold_mode   TEXT    NOT NULL,
      detected_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_drop_events_asin_detected
      ON price_drop_events(asin, detected_at);
  `);

  dbLog.info({ url }, "database ready");
}
