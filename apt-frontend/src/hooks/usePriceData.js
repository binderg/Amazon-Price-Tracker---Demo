/**
 * usePriceData.js
 *
 * Central data hook. Loads products from the API (or mock), applies live
 * SSE updates to the local product list, and exposes a manual refresh.
 *
 * Products are keyed by `id` so downstream components only re-render when
 * their specific product changes.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { getProducts, setProductActive } from '../api/apiClient'
import { computeStats } from '../api/mockData'
import { useSSE } from './useSSE'

/**
 * @param {object} [options]
 * @param {(dropEvent: object) => void} [options.onPriceDrop]
 *
 * @returns {{
 *   products:    object[];
 *   loading:     boolean;
 *   error:       string | null;
 *   lastUpdated: string | null;
 *   sseStatus:   string;
 *   refresh:     () => void;
 * }}
 */
export function usePriceData({ onPriceDrop } = {}) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  // ── Load products on mount ────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getProducts()
      // Attach computed stats so components don't have to recalculate
      const enriched = data.map((p) => ({
        ...p,
        stats: computeStats(p.priceHistory),
      }))
      setProducts(enriched)
      setLastUpdated(new Date().toISOString())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // ── Apply SSE price updates in real time ──────────────────────────────────
  const productsRef = useRef(products)
  useEffect(() => {
    productsRef.current = products
  }, [products])

  const handleSSEEvent = useCallback(
    (event) => {
      if (event.type === 'price_update' || event.type === 'price_drop') {
        const { product_id, current_price, checked_at } = event.data

        setProducts((prev) =>
          prev.map((p) => {
            if (p.id !== product_id) return p

            // Append new data point to history
            const newPoint = {
              date: (checked_at ?? new Date().toISOString()).split('T')[0],
              price: current_price,
              timestamp: checked_at ?? new Date().toISOString(),
            }
            const updatedHistory = [...(p.priceHistory ?? []), newPoint]

            const updated = {
              ...p,
              currentPrice: current_price,
              lastChecked: checked_at ?? new Date().toISOString(),
              priceHistory: updatedHistory,
              stats: computeStats(updatedHistory),
            }
            return updated
          }),
        )

        setLastUpdated(new Date().toISOString())
      }

      if (event.type === 'price_drop') {
        onPriceDrop?.(event.data)
      }
    },
    [onPriceDrop],
  )

  const { status: sseStatus } = useSSE({ onPriceDrop: handleSSEEvent })

  // Filter the product list to only slots that have a URL configured.
  // Called synchronously after settings are saved so cleared slots vanish immediately.
  const applySettingsFilter = useCallback((settings) => {
    if (!settings?.slots) return
    const activeSlotIds = new Set(
      settings.slots.filter((s) => s.url?.trim()).map((s) => s.id)
    )
    setProducts((prev) => prev.filter((p) => activeSlotIds.has(p.slot)))
  }, [])

  // Optimistically toggle a product's active state; rolls back on API error
  const togglePause = useCallback(async (product) => {
    const next = !product.active
    // Optimistic update
    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, active: next } : p))
    )
    try {
      await setProductActive(product.id, next)
    } catch (err) {
      // Roll back
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, active: product.active } : p))
      )
      console.error('[usePriceData] togglePause failed', err)
    }
  }, [])

  return {
    products,
    loading,
    error,
    lastUpdated,
    sseStatus,
    refresh: load,
    togglePause,
    applySettingsFilter,
  }
}
