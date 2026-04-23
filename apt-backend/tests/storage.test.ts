/**
 * tests/storage.test.ts
 *
 * Integration tests for the storage layer.
 *
 * Uses an in-memory SQLite database (`:memory:`) with the same schema as the
 * production DB so no file is created and tests stay fully isolated.  Each
 * `describe` block creates a fresh DB to avoid any inter-test state leakage.
 *
 * Covered:
 *   - Inserting and reading back a price_snapshot row
 *   - Resolving the latest snapshot via the ORDER BY scraped_at DESC query
 *     pattern used by the scheduler
 *   - Inserting and reading back a price_drop_event row (notification history)
 *   - Foreign-key enforcement (insert a snapshot for a non-existent ASIN fails)
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";

// ── Schema helper ─────────────────────────────────────────────────────────────

/**
 * Create an isolated in-memory DB that mirrors the production schema.
 * Only the tables required by these tests are created.
 */
function createTestDb(): Database {
  const db = new Database(":memory:");
  db.run("PRAGMA foreign_keys = ON");

  db.run(`
    CREATE TABLE products (
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
    )
  `);

  db.run(`
    CREATE TABLE price_snapshots (
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
    )
  `);

  db.run(`
    CREATE INDEX idx_price_snapshots_asin_scraped
      ON price_snapshots(asin, scraped_at)
  `);

  db.run(`
    CREATE TABLE price_drop_events (
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

  return db;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("price_snapshots — storage layer", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
    // Seed a product row so FK constraints are satisfied.
    db.run(
      `INSERT INTO products (asin, name, currency) VALUES ('B08N5WRWNW', 'Echo Dot', 'USD')`
    );
  });

  it("inserts and retrieves a snapshot with correct field values", () => {
    db.run(`
      INSERT INTO price_snapshots
        (asin, geocode, zipcode, price, list_price, is_prime, is_sponsored)
      VALUES ('B08N5WRWNW', 'us', '10001', 29.99, 49.99, 1, 0)
    `);

    const row = db
      .query<any, []>(`SELECT * FROM price_snapshots WHERE asin = 'B08N5WRWNW'`)
      .get();

    expect(row).not.toBeNull();
    expect(row.price).toBe(29.99);
    expect(row.list_price).toBe(49.99);
    expect(row.geocode).toBe("us");
    expect(row.zipcode).toBe("10001");
    expect(row.is_prime).toBe(1);
    expect(row.is_sponsored).toBe(0);
  });

  it("price may be stored as NULL (product temporarily unavailable)", () => {
    db.run(`
      INSERT INTO price_snapshots (asin, geocode, zipcode, price)
      VALUES ('B08N5WRWNW', 'us', '10001', NULL)
    `);

    const row = db
      .query<{ price: number | null }, []>(
        `SELECT price FROM price_snapshots WHERE asin = 'B08N5WRWNW'`
      )
      .get();

    expect(row?.price).toBeNull();
  });

  it("returns the most recent snapshot when ordered by scraped_at DESC", () => {
    const asin = "B08N5WRWNW";
    // Older entry
    db.run(
      `INSERT INTO price_snapshots (asin, geocode, zipcode, price, scraped_at)
       VALUES (?, 'us', '10001', 39.99, 1000)`,
      [asin]
    );
    // Newer entry
    db.run(
      `INSERT INTO price_snapshots (asin, geocode, zipcode, price, scraped_at)
       VALUES (?, 'us', '10001', 29.99, 2000)`,
      [asin]
    );

    const latest = db
      .query<{ price: number }, [string, string, string]>(
        `SELECT price FROM price_snapshots
         WHERE asin = ? AND geocode = ? AND zipcode = ?
         ORDER BY scraped_at DESC LIMIT 1`
      )
      .get(asin, "us", "10001");

    expect(latest?.price).toBe(29.99);
  });

  it("enforces the FK constraint — snapshot for an unknown ASIN must fail", () => {
    expect(() => {
      db.run(`
        INSERT INTO price_snapshots (asin, geocode, zipcode, price)
        VALUES ('UNKNOWN000', 'us', '10001', 9.99)
      `);
    }).toThrow();
  });
});

describe("price_drop_events — storage layer", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
    db.run(
      `INSERT INTO products (asin, name, currency) VALUES ('B08N5WRWNW', 'Echo Dot', 'USD')`
    );
  });

  it("inserts an event and reads back the correct shape", () => {
    db.run(`
      INSERT INTO price_drop_events
        (asin, geocode, zipcode, previous_price, current_price,
         drop_amount, drop_percent, threshold_mode)
      VALUES ('B08N5WRWNW', 'us', '10001', 49.99, 29.99, 20.00, 40.01, 'percent')
    `);

    const event = db
      .query<any, []>(`SELECT * FROM price_drop_events`)
      .get();

    expect(event).not.toBeNull();
    expect(event.asin).toBe("B08N5WRWNW");
    expect(event.previous_price).toBe(49.99);
    expect(event.current_price).toBe(29.99);
    expect(event.drop_amount).toBe(20.0);
    expect(event.drop_percent).toBeCloseTo(40.01);
    expect(event.threshold_mode).toBe("percent");
    // detected_at should be a Unix epoch integer (seconds)
    expect(typeof event.detected_at).toBe("number");
    expect(event.detected_at).toBeGreaterThan(0);
  });

  it("stores multiple events for the same product and returns them all", () => {
    for (const [prev, curr] of [
      [100, 90],
      [90, 80],
      [80, 70],
    ]) {
      db.run(
        `INSERT INTO price_drop_events
           (asin, geocode, zipcode, previous_price, current_price,
            drop_amount, drop_percent, threshold_mode)
         VALUES ('B08N5WRWNW', 'us', '10001', ?, ?, ?, ?, 'absolute')`,
        [prev, curr, prev - curr, Math.round(((prev - curr) / prev) * 10000) / 100]
      );
    }

    const events = db
      .query<any, []>(`SELECT * FROM price_drop_events ORDER BY id`)
      .all();

    expect(events).toHaveLength(3);
    expect(events[0].previous_price).toBe(100);
    expect(events[2].current_price).toBe(70);
  });
});
