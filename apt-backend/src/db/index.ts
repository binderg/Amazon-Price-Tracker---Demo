import { Database } from "bun:sqlite";
import path from "path";

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

db.run(`
  CREATE TABLE IF NOT EXISTS webhooks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    url        TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )
`);

console.log(`Database ready at ${DB_PATH}`);
