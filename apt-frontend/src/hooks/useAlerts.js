/**
 * useAlerts.js
 *
 * Manages the in-app price-drop alert list.
 *
 * Live mode (DEMO_MODE = false):
 *   - On mount, fetches historical alerts from GET /api/alerts (price_drop_events table).
 *   - SSE price_drop events are prepended in real time via addAlert().
 *   - Dismissed alert IDs are persisted in localStorage.
 *
 * Demo mode (DEMO_MODE = true):
 *   - Pre-populates seed alerts immediately so the column has content.
 *   - Dismissals still persist to localStorage.
 */

import { useState, useEffect, useCallback } from 'react'
import { DEMO_MODE, getAlerts } from '../api/apiClient'

const STORAGE_KEY = 'pricewatch_dismissed_alerts'

function loadDismissed() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'))
  } catch {
    return new Set()
  }
}

function saveDismissed(set) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]))
  } catch {
    // ignore storage errors (private browsing, quota exceeded, etc.)
  }
}

/**
 * Seed alerts that appear immediately in demo mode only.
 * They have stable IDs so dismissals persist across reloads.
 */
const SEED_ALERTS = [
  {
    id: 'seed-alert-1',
    productId: 1,
    productName: 'Sony WH-1000XM5',
    productUrl: 'https://www.amazon.com/dp/B09XS7JWHH',
    type: 'price_drop',
    previousPrice: 299.99,
    currentPrice: 279.99,
    dropAmount: 20.0,
    dropPercent: 6.7,
    timestamp: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
  },
  {
    id: 'seed-alert-2',
    productId: 3,
    productName: 'LEGO Technic Bugatti',
    productUrl: 'https://www.amazon.com/dp/B071ZNKD83',
    type: 'price_drop',
    previousPrice: 369.99,
    currentPrice: 339.99,
    dropAmount: 30.0,
    dropPercent: 8.1,
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'seed-alert-3',
    productId: 2,
    productName: 'Instant Pot Duo 6 Qt',
    productUrl: 'https://www.amazon.com/dp/B00FLYWNYQ',
    type: 'price_drop',
    previousPrice: 89.99,
    currentPrice: 79.95,
    dropAmount: 10.04,
    dropPercent: 11.2,
    timestamp: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
  },
]

export function useAlerts() {
  const [alerts, setAlerts] = useState(() => {
    if (!DEMO_MODE) return [] // Don't show mock seeds in live mode
    const dismissed = loadDismissed()
    return SEED_ALERTS.filter((a) => !dismissed.has(a.id))
  })

  // In live mode, hydrate from the backend on first render
  useEffect(() => {
    if (DEMO_MODE) return
    let cancelled = false

    getAlerts()
      .then((backendAlerts) => {
        if (cancelled) return
        const dismissed = loadDismissed()
        setAlerts(backendAlerts.filter((a) => !dismissed.has(a.id)))
      })
      .catch((err) => {
        console.warn('[useAlerts] Could not load alerts from backend:', err.message)
      })

    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Dismisses an alert by ID. Persists the dismissal to localStorage so the
   * alert doesn't reappear after a page reload.
   */
  const dismissAlert = useCallback((id) => {
    const dismissed = loadDismissed()
    dismissed.add(id)
    saveDismissed(dismissed)
    setAlerts((prev) => prev.filter((a) => a.id !== id))
  }, [])

  /**
   * Adds a new alert from a price_drop SSE event payload.
   * Uses a unique timestamp-based ID so each live event is distinct.
   */
  const addAlert = useCallback((event) => {
    const id = `live-alert-${event.product_id}-${Date.now()}`
    const alert = {
      id,
      productId: event.product_id,
      productName: event.product_name ?? 'Unknown Product',
      productUrl: event.product_url ?? null,
      type: 'price_drop',
      previousPrice: event.previous_price,
      currentPrice: event.current_price,
      dropAmount: event.drop_amount,
      dropPercent: event.drop_percent,
      timestamp: event.checked_at ?? new Date().toISOString(),
    }
    setAlerts((prev) => [alert, ...prev])
  }, [])

  return { alerts, addAlert, dismissAlert }
}
