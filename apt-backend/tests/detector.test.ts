/**
 * tests/detector.test.ts
 *
 * Unit tests for the pure price-drop detection logic (src/services/detector.ts).
 *
 * checkPriceDrop() has no I/O dependencies — it only takes plain data in and
 * returns a DropResult or null out, making it trivially testable.
 *
 * Covered:
 *   - Guard conditions: null prices, alert_enabled=0, price unchanged / increased
 *   - "percent" threshold mode
 *   - "absolute" threshold mode
 *   - "both" mode (OR semantics: triggered if EITHER threshold is met)
 *   - Correct rounding of dropAmount and dropPercent to 2 decimal places
 */

import { describe, it, expect } from "bun:test";
import { checkPriceDrop } from "../src/services/detector";

// ── Shared base config ────────────────────────────────────────────────────────

const BASE = {
  alert_enabled: 1 as const,
  threshold_percent: 5.0,   // 5 %
  threshold_absolute: 2.0,  // $2
};

// ── Guard conditions ──────────────────────────────────────────────────────────

describe("checkPriceDrop — guard conditions", () => {
  it("returns null when newPrice is null (product unavailable)", () => {
    expect(
      checkPriceDrop({ ...BASE, newPrice: null, prevPrice: 10, threshold_mode: "percent" })
    ).toBeNull();
  });

  it("returns null when prevPrice is null (no baseline to compare against)", () => {
    expect(
      checkPriceDrop({ ...BASE, newPrice: 9, prevPrice: null, threshold_mode: "percent" })
    ).toBeNull();
  });

  it("returns null when alert_enabled is 0 (notifications disabled for this product)", () => {
    expect(
      checkPriceDrop({ ...BASE, alert_enabled: 0, newPrice: 5, prevPrice: 10, threshold_mode: "percent" })
    ).toBeNull();
  });

  it("returns null when price is unchanged", () => {
    expect(
      checkPriceDrop({ ...BASE, newPrice: 10, prevPrice: 10, threshold_mode: "percent" })
    ).toBeNull();
  });

  it("returns null when price increased", () => {
    expect(
      checkPriceDrop({ ...BASE, newPrice: 11, prevPrice: 10, threshold_mode: "percent" })
    ).toBeNull();
  });
});

// ── Percent mode ──────────────────────────────────────────────────────────────

describe("checkPriceDrop — 'percent' mode", () => {
  it("triggers when drop % exceeds the threshold  ($100 → $90 = 10 %, threshold 5 %)", () => {
    const result = checkPriceDrop({
      ...BASE, threshold_mode: "percent", newPrice: 90, prevPrice: 100,
    });

    expect(result?.triggered).toBe(true);
    expect(result?.dropAmount).toBe(10);
    expect(result?.dropPercent).toBe(10);
  });

  it("triggers at exactly the threshold boundary  ($100 → $95 = 5 %, threshold 5 %)", () => {
    const result = checkPriceDrop({
      ...BASE, threshold_mode: "percent", newPrice: 95, prevPrice: 100,
    });

    expect(result?.triggered).toBe(true);
  });

  it("does NOT trigger when drop % is below the threshold  ($100 → $97 = 3 %, threshold 5 %)", () => {
    const result = checkPriceDrop({
      ...BASE, threshold_mode: "percent", newPrice: 97, prevPrice: 100,
    });

    expect(result?.triggered).toBe(false);
  });
});

// ── Absolute mode ─────────────────────────────────────────────────────────────

describe("checkPriceDrop — 'absolute' mode", () => {
  it("triggers when drop amount exceeds the threshold  ($10 → $7 = $3, threshold $2)", () => {
    const result = checkPriceDrop({
      ...BASE, threshold_mode: "absolute", newPrice: 7, prevPrice: 10,
    });

    expect(result?.triggered).toBe(true);
    expect(result?.dropAmount).toBe(3);
  });

  it("triggers at exactly the threshold boundary  ($12 → $10 = $2, threshold $2)", () => {
    const result = checkPriceDrop({
      ...BASE, threshold_mode: "absolute", newPrice: 10, prevPrice: 12,
    });

    expect(result?.triggered).toBe(true);
  });

  it("does NOT trigger when drop amount is below the threshold  ($10 → $9.50 = $0.50, threshold $2)", () => {
    const result = checkPriceDrop({
      ...BASE, threshold_mode: "absolute", newPrice: 9.5, prevPrice: 10,
    });

    expect(result?.triggered).toBe(false);
  });
});

// ── Both mode (OR semantics) ──────────────────────────────────────────────────

describe("checkPriceDrop — 'both' mode (OR: triggered if EITHER threshold met)", () => {
  it("triggers when only the percent threshold is met", () => {
    // $100 → $90: 10 % drop, $10 drop.  threshold: 5 % (met), $20 (not met)
    const result = checkPriceDrop({
      newPrice: 90, prevPrice: 100,
      alert_enabled: 1, threshold_mode: "both",
      threshold_percent: 5, threshold_absolute: 20,
    });

    expect(result?.triggered).toBe(true);
  });

  it("triggers when only the absolute threshold is met", () => {
    // $100 → $75: 25 % drop, $25 drop.  threshold: 30 % (not met), $20 (met)
    const result = checkPriceDrop({
      newPrice: 75, prevPrice: 100,
      alert_enabled: 1, threshold_mode: "both",
      threshold_percent: 30, threshold_absolute: 20,
    });

    expect(result?.triggered).toBe(true);
  });

  it("triggers when both thresholds are met", () => {
    // $100 → $80: 20 % drop, $20 drop.  threshold: 10 % (met), $15 (met)
    const result = checkPriceDrop({
      newPrice: 80, prevPrice: 100,
      alert_enabled: 1, threshold_mode: "both",
      threshold_percent: 10, threshold_absolute: 15,
    });

    expect(result?.triggered).toBe(true);
  });

  it("does NOT trigger when neither threshold is met", () => {
    // $100 → $97: 3 % drop, $3 drop.  threshold: 5 % (not met), $5 (not met)
    const result = checkPriceDrop({
      newPrice: 97, prevPrice: 100,
      alert_enabled: 1, threshold_mode: "both",
      threshold_percent: 5, threshold_absolute: 5,
    });

    expect(result?.triggered).toBe(false);
  });
});

// ── Calculation accuracy ──────────────────────────────────────────────────────

describe("checkPriceDrop — drop calculation accuracy", () => {
  it("rounds dropAmount to 2 decimal places  ($9.99 → $9.00 = $0.99)", () => {
    const result = checkPriceDrop({
      ...BASE, threshold_mode: "absolute", threshold_absolute: 0,
      newPrice: 9.0, prevPrice: 9.99,
    });

    expect(result?.dropAmount).toBe(0.99);
  });

  it("computes dropPercent correctly  ($200 → $150 = 25.00 %)", () => {
    const result = checkPriceDrop({
      ...BASE, threshold_mode: "percent", threshold_percent: 0,
      newPrice: 150, prevPrice: 200,
    });

    expect(result?.dropPercent).toBe(25);
  });

  it("handles floating-point prices without accumulating rounding error", () => {
    // $19.99 → $17.99: drop = $2.00 exactly after rounding
    const result = checkPriceDrop({
      ...BASE, threshold_mode: "absolute", threshold_absolute: 0,
      newPrice: 17.99, prevPrice: 19.99,
    });

    expect(result?.dropAmount).toBe(2.0);
  });
});
