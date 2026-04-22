/**
 * useSSE.js
 *
 * Manages a Server-Sent Events connection to the Hono backend.
 *
 * When DEMO_MODE is true (see apiClient.js), the hook simulates periodic
 * price_update events using mock data so the UI behaves realistically
 * without a running backend.
 *
 * ── Production hookup ────────────────────────────────────────────────────────
 * 1. Set DEMO_MODE = false in src/api/apiClient.js
 * 2. Ensure the Hono server exposes GET /sse (EventSource-compatible)
 * 3. The server should emit named events:
 *      event: price_update   data: { product_id, current_price, checked_at }
 *      event: price_drop     data: { ...PriceDropPayload }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { DEMO_MODE, getSseUrl } from '../api/apiClient'
import { MOCK_PRODUCTS } from '../api/mockData'

// How often the demo simulates a new price event (ms)
const DEMO_TICK_MS = 30_000

/**
 * @typedef {{ type: 'price_update' | 'price_drop'; data: object; id: number }} SSEEvent
 *
 * @param {object} [options]
 * @param {(event: SSEEvent) => void} [options.onPriceDrop]  Called for every SSE event
 *
 * @returns {{
 *   status: 'connected' | 'connecting' | 'demo' | 'disconnected' | 'error';
 *   lastEvent: SSEEvent | null;
 * }}
 */
export function useSSE({ onPriceDrop: onEvent } = {}) {
  const [status, setStatus] = useState(DEMO_MODE ? 'demo' : 'connecting')
  const [lastEvent, setLastEvent] = useState(null)
  const esRef = useRef(null)
  const tickRef = useRef(null)
  const onPriceDropRef = useRef(onEvent)

  // Keep the callback ref fresh without triggering re-connections
  useEffect(() => {
    onPriceDropRef.current = onEvent
  }, [onEvent])

  const handleEvent = useCallback((type, data) => {
    const event = { type, data, id: Date.now() }
    setLastEvent(event)
    // Route ALL events to the consumer — they decide how to handle each type
    onPriceDropRef.current?.(event)
  }, [])

  useEffect(() => {
    if (DEMO_MODE) {
      // ── Demo mode: simulate occasional price updates ──────────────────────
      let tick = 0
      tickRef.current = setInterval(() => {
        tick++
        // Cycle through the active mock products
        const active = MOCK_PRODUCTS.filter((p) => p.active)
        if (active.length === 0) return
        const product = active[tick % active.length]

        // Small random price fluctuation (±1.5%)
        const factor = 0.985 + Math.random() * 0.03
        const newPrice = Math.round(product.currentPrice * factor * 100) / 100

        handleEvent('price_update', {
          product_id: product.id,
          current_price: newPrice,
          previous_price: product.currentPrice,
          checked_at: new Date().toISOString(),
        })
      }, DEMO_TICK_MS)

      return () => clearInterval(tickRef.current)
    }

    // ── Production mode: real EventSource ────────────────────────────────────
    // API key is appended as ?key= because EventSource cannot set custom headers.
    const es = new EventSource(getSseUrl())
    esRef.current = es
    setStatus('connecting')

    es.onopen = () => setStatus('connected')
    es.onerror = () => {
      setStatus('error')
      es.close()
    }

    es.addEventListener('price_update', (e) => {
      try {
        handleEvent('price_update', JSON.parse(e.data))
      } catch {
        console.error('[useSSE] Failed to parse price_update event', e.data)
      }
    })

    es.addEventListener('price_drop', (e) => {
      try {
        handleEvent('price_drop', JSON.parse(e.data))
      } catch {
        console.error('[useSSE] Failed to parse price_drop event', e.data)
      }
    })

    return () => {
      es.close()
      setStatus('disconnected')
    }
  }, [handleEvent])

  return { status, lastEvent }
}
