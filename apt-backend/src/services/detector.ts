/**
 * detector.ts
 *
 * Pure price-drop detection logic.
 *
 * Extracted from scheduler.ts so it can be unit-tested without any I/O,
 * database, or SSE dependencies. The scheduler imports checkPriceDrop() and
 * calls it after resolving the previous and current price snapshots.
 */

export interface DropCheckInput {
  newPrice: number | null;
  prevPrice: number | null;
  /** 1 = alerts on, 0 = alerts disabled for this product */
  alert_enabled: number;
  /** "percent" | "absolute" | "both" */
  threshold_mode: string;
  threshold_percent: number;
  threshold_absolute: number;
}

export interface DropResult {
  /** Whether the drop crossed at least one configured threshold. */
  triggered: boolean;
  /** Absolute price difference, rounded to 2 dp. */
  dropAmount: number;
  /** Percentage drop relative to previous price, rounded to 2 dp. */
  dropPercent: number;
}

/**
 * Evaluate whether a price change qualifies as a notifiable drop.
 *
 * Returns `null` when the preconditions for a drop are not met:
 *   - either price is null (unavailable)
 *   - alerts are disabled (`alert_enabled !== 1`)
 *   - price did not actually decrease
 *
 * Returns a `DropResult` when there is a real drop; `triggered` indicates
 * whether the drop crossed at least one threshold.  The caller decides what
 * to do with the result (persist event, broadcast SSE, etc.).
 *
 * Threshold logic:
 *   "percent"  → triggered if dropPercent  >= threshold_percent
 *   "absolute" → triggered if dropAmount   >= threshold_absolute
 *   "both"     → triggered if EITHER of the above is true (OR semantics)
 */
export function checkPriceDrop(input: DropCheckInput): DropResult | null {
  const {
    newPrice,
    prevPrice,
    alert_enabled,
    threshold_mode,
    threshold_percent,
    threshold_absolute,
  } = input;

  // Guard: need valid prices
  if (newPrice === null || prevPrice === null) return null;
  // Guard: alerts must be enabled
  if (alert_enabled !== 1) return null;
  // Guard: must be an actual price decrease
  if (newPrice >= prevPrice) return null;

  const dropAmount = Math.round((prevPrice - newPrice) * 100) / 100;
  const dropPercent = Math.round((dropAmount / prevPrice) * 10000) / 100;

  let triggered = false;

  if (threshold_mode === "percent" || threshold_mode === "both") {
    if (dropPercent >= threshold_percent) triggered = true;
  }
  if (threshold_mode === "absolute" || threshold_mode === "both") {
    if (dropAmount >= threshold_absolute) triggered = true;
  }

  return { triggered, dropAmount, dropPercent };
}
