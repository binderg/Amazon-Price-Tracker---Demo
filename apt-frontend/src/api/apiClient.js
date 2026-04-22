/**
 * apiClient.js
 *
 * All backend API calls are centralised here.
 * When DEMO_MODE is true (no backend), every function resolves mock data.
 * Flip DEMO_MODE to false and ensure the Hono server is running on :3001
 * to use the real API.
 *
 * API contract mirrors the Hono backend defined in README.md:
 *   GET    /api/products
 *   POST   /api/products            { url, name? }
 *   DELETE /api/products/:id
 *   GET    /api/products/:id/history?from=&to=
 *   GET    /api/webhooks
 *   POST   /api/webhooks            { url }
 *   DELETE /api/webhooks/:id
 */

import { MOCK_PRODUCTS } from './mockData'

export const DEMO_MODE = true

// ─── Internal helpers ────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'
const API_KEY  = import.meta.env.VITE_API_KEY ?? ''

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}/api${path}`, {
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

export function getSseUrl() {
  return `${API_BASE}/sse`
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

// ─── Webhooks ────────────────────────────────────────────────────────────────

export async function getWebhooks() {
  if (DEMO_MODE) {
    await mockDelay()
    return []
  }
  return apiFetch('/webhooks')
}

export async function addWebhook(url) {
  if (DEMO_MODE) {
    await mockDelay()
    console.warn('[Demo] addWebhook — no-op', { url })
    return { id: Date.now(), url }
  }
  return apiFetch('/webhooks', { method: 'POST', body: JSON.stringify({ url }) })
}

export async function removeWebhook(id) {
  if (DEMO_MODE) {
    await mockDelay()
    return { success: true }
  }
  return apiFetch(`/webhooks/${id}`, { method: 'DELETE' })
}
