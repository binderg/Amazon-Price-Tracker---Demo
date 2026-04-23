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
 *
 * ── ERR_INCOMPLETE_CHUNKED_ENCODING & auto-reconnect ────────────────────────
 * PROBLEM:
 *   Bun v1.1.26 added a 10-second idle timeout that kills SSE connections
 *   that carry no data. The browser reports this as ERR_INCOMPLETE_CHUNKED_
 *   ENCODING — a network-level message that cannot be suppressed in code.
 *   The backend fix (server.timeout(req, 0) + idleTimeout: 0 + 8 s pings)
 *   prevents the server from killing the socket. But if the connection drops
 *   for any reason (server restart, network blip, dev bun --watch file save)
 *   the original code permanently closed the EventSource:
 *
 *     es.onerror = () => { setStatus('error'); es.close() }  // ← dead forever
 *
 *   The dashboard would stay broken until the user manually refreshed.
 *
 * SOLUTION:
 *   On every onerror, close the dead EventSource and schedule a new one after
 *   an exponential backoff delay (2 s → 4 s → 8 s … capped at 30 s). This is
 *   done by incrementing connKey, which re-runs the useEffect and opens a
 *   fresh EventSource. The backoff counter resets to 0 on a successful open.
 *
 *   ERR_INCOMPLETE_CHUNKED_ENCODING will still briefly appear in the console
 *   on every server restart — that's unavoidable at the browser network layer.
 *   What no longer happens is the connection staying dead afterward.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { DEMO_MODE, getSseUrl } from '../api/apiClient'
import { MOCK_PRODUCTS } from '../api/mockData'

// How often the demo simulates a new price event (ms)
const DEMO_TICK_MS = 30_000

// Reconnect backoff: 2 s, 4 s, 8 s … capped at 30 s
const RECONNECT_BASE_MS = 2_000
const RECONNECT_MAX_MS  = 30_000

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
  const [connKey, setConnKey] = useState(0) // increment to trigger a reconnect

  const tickRef       = useRef(null)
  const reconnectRef  = useRef(null)
  const attemptRef    = useRef(0)        // backoff attempt counter
  const onEventRef    = useRef(onEvent)

  // Keep the callback ref fresh without triggering re-connections
  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  const handleEvent = useCallback((type, data) => {
    const event = { type, data, id: Date.now() }
    setLastEvent(event)
    onEventRef.current?.(event)
  }, [])

  useEffect(() => {
    if (DEMO_MODE) {
      // ── Demo mode: simulate occasional price updates ──────────────────────
      let tick = 0
      tickRef.current = setInterval(() => {
        tick++
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
    const es = new EventSource(getSseUrl())
    setStatus('connecting')

    es.onopen = () => {
      attemptRef.current = 0 // successful connection — reset backoff
      setStatus('connected')
    }

    es.onerror = () => {
      es.close()
      setStatus('connecting')

      // Exponential backoff: 2 s → 4 s → 8 s … max 30 s
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** attemptRef.current, RECONNECT_MAX_MS)
      attemptRef.current++

      reconnectRef.current = setTimeout(() => {
        setConnKey((k) => k + 1) // re-run this effect with a fresh EventSource
      }, delay)
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
      clearTimeout(reconnectRef.current)
      es.close()
      setStatus('disconnected')
    }
  }, [handleEvent, connKey])

  return { status, lastEvent }
}
