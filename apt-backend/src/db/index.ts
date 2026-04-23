import { Database } from "bun:sqlite";
import path from "path";
import { dbLog } from "../logger";

const DB_PATH = path.resolve(import.meta.dir, "../../data/apt.db");

export const db = new Database(DB_PATH, { create: true });

db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA foreign_keys = ON");

db.run(`
  CREATE TABLE IF NOT EXISTS products (
    asin              TEXT PRIMARY KEY,
    brand             TEXT,
    name              TEXT,
    url               TEXT,
    thumbnail         TEXT,
    currency          TEXT,
    currency_symbol   TEXT,
    technical_details TEXT,  -- JSON object
    created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS tracked_products (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    asin                    TEXT NOT NULL REFERENCES products(asin),
    slot                    INTEGER NOT NULL,          -- 1–3 display position
    geocode                 TEXT NOT NULL DEFAULT 'us',
    zipcode                 TEXT NOT NULL DEFAULT '10001',
    scrape_interval_minutes INTEGER NOT NULL DEFAULT 60,
    last_scraped_at         INTEGER,
    is_active               INTEGER NOT NULL DEFAULT 1,
    created_at              INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(asin, geocode, zipcode),
    UNIQUE(slot)
  )
`);

// Migration: add slot column if upgrading from an older schema
try {
  db.run(`ALTER TABLE tracked_products ADD COLUMN slot INTEGER NOT NULL DEFAULT 0`);
} catch {
  // column already exists — ignore
}

db.run(`
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
    shipping_info       TEXT,  -- JSON array
    more_buying_choices TEXT,  -- JSON object
    scraped_at          INTEGER NOT NULL DEFAULT (unixepoch())
  )
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_price_snapshots_asin_scraped
    ON price_snapshots(asin, scraped_at)
`);

db.run(`
  CREATE TABLE IF NOT EXISTS product_images (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    asin          TEXT NOT NULL REFERENCES products(asin),
    url           TEXT NOT NULL,
    width         INTEGER,
    height        INTEGER,
    display_order INTEGER NOT NULL DEFAULT 0,
    updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS best_seller_rankings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    asin        TEXT NOT NULL REFERENCES products(asin),
    category    TEXT NOT NULL,
    rank        INTEGER NOT NULL,
    geocode     TEXT NOT NULL,
    recorded_at INTEGER NOT NULL DEFAULT (unixepoch())
  )
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_bsr_asin_recorded
    ON best_seller_rankings(asin, recorded_at)
`);

// ─── Per-product alert thresholds ─────────────────────────────────────────────
// These live as columns on tracked_products so each slot can have its own config.
// Migrations run with try/catch so they are safe on an existing DB.
const alertMigrations = [
  `ALTER TABLE tracked_products ADD COLUMN alert_enabled    INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE tracked_products ADD COLUMN threshold_mode   TEXT    NOT NULL DEFAULT 'percent'`,
  `ALTER TABLE tracked_products ADD COLUMN threshold_percent REAL   NOT NULL DEFAULT 5.0`,
  `ALTER TABLE tracked_products ADD COLUMN threshold_absolute REAL  NOT NULL DEFAULT 0.0`,
];
for (const sql of alertMigrations) {
  try { db.run(sql); } catch { /* column already exists */ }
}

// ─── Price drop events (notification history) ────────────────────────────────
db.run(`
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
  )
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_drop_events_asin_detected
    ON price_drop_events(asin, detected_at)
`);

dbLog.info({ path: DB_PATH }, "database ready");
