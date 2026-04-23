/**
 * apiClient.js
 *
 * All backend API calls are centralised here.
 * When DEMO_MODE is true (no backend), every function resolves mock data.
 * Flip DEMO_MODE to false and ensure the Hono server is running on :3000
 * to use the real API.
 *
 * API contract:
 *   GET    /api/products
 *   PATCH  /api/products/:id/active  { active: boolean }
 *   GET    /api/products/:id/history?from=&to=
 *   GET    /api/settings
 *   POST   /api/settings             { slots: Slot[] }
 *   GET    /api/alerts
 *   GET    /sse                      (EventSource, key via ?key=)
 */

import { MOCK_PRODUCTS, DEFAULT_SETTINGS } from './mockData'

export const DEMO_MODE = false

// ─── Internal helpers ────────────────────────────────────────────────────────

// Production should default to same-origin so the built frontend can be served
// from the same Bun container as the API without any localhost/CORS coupling.
// Local dev can still override this with VITE_API_BASE_URL=http://localhost:3000.
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
const API_KEY  = import.meta.env.VITE_API_KEY ?? ''

function apiUrl(path) {
  return API_BASE ? `${API_BASE}${path}` : path
}

async function apiFetch(path, options = {}) {
  const res = await fetch(apiUrl(`/api${path}`), {
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      ...options.headers,
    },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${options.method ?? 'GET'} ${path} → ${res.status}: ${text}`)
  }
  return res.json()
}

/**
 * SSE URL with API key as a query param because EventSource cannot set headers.
 */
export function getSseUrl() {
  return `${apiUrl('/sse')}?key=${encodeURIComponent(API_KEY)}`
}

export function getSseHeaders() {
  return { 'X-API-Key': API_KEY }
}

// Artificial delay so mock mode feels realistic (50–150 ms)
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const mockDelay = () => delay(60 + Math.random() * 90)

// ─── Products ────────────────────────────────────────────────────────────────

/**
 * Returns all active tracked products.
 * @returns {Promise<Product[]>}
 */
export async function getProducts() {
  if (DEMO_MODE) {
    await mockDelay()
    return MOCK_PRODUCTS.map((p) => ({ ...p }))
  }
  return apiFetch('/products')
}

/**
 * Adds a new product by URL.
 * @param {string} url  Full Amazon product URL
 * @param {string} [name]  Optional display name
 */
export async function addProduct(url, name) {
  if (DEMO_MODE) {
    await mockDelay()
    console.warn('[Demo] addProduct — no-op in demo mode', { url, name })
    return { id: Date.now(), url, name: name ?? url, active: true }
  }
  return apiFetch('/products', {
    method: 'POST',
    body: JSON.stringify({ url, name }),
  })
}

/**
 * Soft-deletes a product (sets active = false).
 * @param {number} id
 */
export async function removeProduct(id) {
  if (DEMO_MODE) {
    await mockDelay()
    console.warn('[Demo] removeProduct — no-op in demo mode', { id })
    return { success: true }
  }
  return apiFetch(`/products/${id}`, { method: 'DELETE' })
}

/**
 * Pauses or resumes tracking for a product (toggles is_active).
 * @param {number} id
 * @param {boolean} active
 */
export async function setProductActive(id, active) {
  if (DEMO_MODE) {
    await mockDelay()
    return { id, active }
  }
  return apiFetch(`/products/${id}/active`, {
    method: 'PATCH',
    body: JSON.stringify({ active }),
  })
}

/**
 * Retrieves the price history for a single product.
 * @param {number} id
 * @param {{ from?: string; to?: string }} [range]  ISO 8601 date strings
 */
export async function getProductHistory(id, range = {}) {
  if (DEMO_MODE) {
    await mockDelay()
    const product = MOCK_PRODUCTS.find((p) => p.id === id)
    if (!product) throw new Error(`Product ${id} not found`)
    return product.priceHistory
  }
  const params = new URLSearchParams()
  if (range.from) params.set('from', range.from)
  if (range.to) params.set('to', range.to)
  const qs = params.toString() ? `?${params}` : ''
  return apiFetch(`/products/${id}/history${qs}`)
}

// ─── Settings ────────────────────────────────────────────────────────────────

/**
 * Fetches the current slot configuration from the backend DB.
 * @returns {Promise<{ slots: object[] }>}
 */
export async function getSettings() {
  if (DEMO_MODE) {
    await mockDelay()
    return DEFAULT_SETTINGS
  }
  return apiFetch('/settings')
}

/**
 * Persists slot configuration to the backend.
 * Backend syncs tracked_products and calls Scrape.do for new ASINs.
 * @param {{ slots: import('./mockData').DEFAULT_SETTINGS['slots'] }} settings
 */
export async function saveSettingsToBackend(settings) {
  if (DEMO_MODE) {
    await mockDelay()
    console.warn('[Demo] saveSettingsToBackend — no-op in demo mode', settings)
    return { results: [] }
  }
  return apiFetch('/settings', {
    method: 'POST',
    body: JSON.stringify({ slots: settings.slots }),
  })
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

/**
 * Fetches recent price-drop alerts from the backend (price_drop_events table).
 * Returns an empty array in demo mode so seed alerts are used instead.
 * @returns {Promise<object[]>}
 */
export async function getAlerts() {
  if (DEMO_MODE) {
    await mockDelay()
    return []
  }
  return apiFetch('/alerts')
}

