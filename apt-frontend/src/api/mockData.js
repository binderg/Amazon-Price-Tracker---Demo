/**
 * mockData.js
 *
 * Provides realistic demo data for the Amazon Price Tracker dashboard.
 * Replace calls to these functions with real API/SSE data once the
 * Hono backend is running.
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

function seededRandom(seed) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

/**
 * Generates a price history array going back `days` days.
 * Uses a seeded random walk so the chart looks stable across re-renders.
 */
function generatePriceHistory(basePrice, volatility, days = 60, seed = 42) {
  const rand = seededRandom(seed)
  const history = []

  // Start above current price to show a realistic downward trend over time
  let price = basePrice * (1.15 + rand() * 0.1)

  for (let i = days; i >= 0; i--) {
    const date = new Date()
    date.setDate(date.getDate() - i)

    // Random walk with slight mean-reversion toward basePrice
    const drift = (basePrice - price) * 0.03
    price = price + drift + (rand() - 0.48) * volatility
    price = Math.max(basePrice * 0.75, Math.min(basePrice * 1.5, price))

    history.push({
      date: date.toISOString().split('T')[0],
      price: Math.round(price * 100) / 100,
      timestamp: date.toISOString(),
    })
  }

  // Force the last point to be the current price
  if (history.length > 0) {
    history[history.length - 1].price = basePrice
  }

  return history
}

/** Parses the ASIN from an Amazon product URL */
export function parseAsin(url) {
  if (!url) return null
  const match = url.match(/\/dp\/([A-Z0-9]{10})(?:[/?]|$)/i)
  return match ? match[1].toUpperCase() : null
}

/** Returns a human-readable "time ago" string */
export function timeAgo(isoString) {
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/** Formats a number as USD */
export function formatPrice(price) {
  if (price == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(price)
}

/** Computes statistics from a price history array */
export function computeStats(history) {
  if (!history || history.length === 0) {
    return { min: null, max: null, avg: null, change24h: null, changePct24h: null }
  }

  const prices = history.map((h) => h.price).filter(Boolean)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length

  const current = prices[prices.length - 1]
  const dayAgoIndex = Math.max(0, prices.length - 2)
  const dayAgoPx = prices[dayAgoIndex]
  const change24h = current - dayAgoPx
  const changePct24h = dayAgoPx !== 0 ? (change24h / dayAgoPx) * 100 : 0

  return {
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    avg: Math.round(avg * 100) / 100,
    change24h: Math.round(change24h * 100) / 100,
    changePct24h: Math.round(changePct24h * 10) / 10,
  }
}

// ─── Mock Products ───────────────────────────────────────────────────────────

/**
 * The three demo products.
 * Each maps to a slot (1–3) in the settings.
 * In production, `url` and `name` come from user settings + DB.
 */
export const MOCK_PRODUCTS = [
  {
    id: 1,
    slot: 1,
    name: 'Sony WH-1000XM5 Wireless Headphones',
    shortName: 'Sony WH-1000XM5',
    asin: 'B09XS7JWHH',
    url: 'https://www.amazon.com/dp/B09XS7JWHH',
    currentPrice: 279.99,
    active: true,
    lastChecked: new Date(Date.now() - 4 * 60 * 1000).toISOString(), // 4 min ago
    image: null,
    category: 'Electronics',
    priceHistory: generatePriceHistory(279.99, 12, 60, 101),
  },
  {
    id: 2,
    slot: 2,
    name: 'Instant Pot Duo 7-in-1 Electric Pressure Cooker, 6 Qt',
    shortName: 'Instant Pot Duo 6 Qt',
    asin: 'B00FLYWNYQ',
    url: 'https://www.amazon.com/dp/B00FLYWNYQ',
    currentPrice: 79.95,
    active: true,
    lastChecked: new Date(Date.now() - 7 * 60 * 1000).toISOString(), // 7 min ago
    image: null,
    category: 'Kitchen',
    priceHistory: generatePriceHistory(79.95, 5, 60, 202),
  },
  {
    id: 3,
    slot: 3,
    name: 'LEGO Technic Bugatti Chiron 42083 Building Kit',
    shortName: 'LEGO Technic Bugatti',
    asin: 'B071ZNKD83',
    url: 'https://www.amazon.com/dp/B071ZNKD83',
    currentPrice: 339.99,
    active: true,
    lastChecked: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h ago
    image: null,
    category: 'Toys',
    priceHistory: generatePriceHistory(339.99, 18, 60, 303),
  },
]

/**
 * Simulates the SSE price_update event payload shape.
 * In production this comes from Hono via EventSource.
 */
export function buildPriceUpdateEvent(productId, newPrice) {
  const product = MOCK_PRODUCTS.find((p) => p.id === productId)
  if (!product) return null
  return {
    product_id: productId,
    product_name: product.name,
    asin: product.asin,
    previous_price: product.currentPrice,
    current_price: newPrice,
    drop_amount: Math.round((product.currentPrice - newPrice) * 100) / 100,
    drop_percent:
      Math.round(((product.currentPrice - newPrice) / product.currentPrice) * 1000) / 10,
    checked_at: new Date().toISOString(),
    product_url: product.url,
  }
}

/**
 * Default URL settings pre-populated with the mock products.
 * Stored in localStorage under the key "pricewatch_settings".
 */
/**
 * Valid scrape intervals in minutes.
 * Displayed as a locked-step slider in the settings UI.
 */
export const INTERVAL_OPTIONS = [
  { minutes: 15,   label: '15 min' },
  { minutes: 30,   label: '30 min' },
  { minutes: 60,   label: '1 hr'   },
  { minutes: 720,  label: '12 hr'  },
  { minutes: 1440, label: '24 hr'  },
]

export const DEFAULT_SETTINGS = {
  slots: [
    { id: 1, url: MOCK_PRODUCTS[0].url, name: MOCK_PRODUCTS[0].shortName, scrape_interval_minutes: 60 },
    { id: 2, url: MOCK_PRODUCTS[1].url, name: MOCK_PRODUCTS[1].shortName, scrape_interval_minutes: 60 },
    { id: 3, url: MOCK_PRODUCTS[2].url, name: MOCK_PRODUCTS[2].shortName, scrape_interval_minutes: 60 },
  ],
}
