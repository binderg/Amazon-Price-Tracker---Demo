/**
 * ComparisonChart.jsx
 *
 * Full-width multi-product price comparison chart rendered below the product
 * card grid. Lets the user pick any combination of tracked products via a
 * PrimeReact MultiSelect and a date-range toggle.
 */

import { useState, useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { MultiSelect } from 'primereact/multiselect'
import { GitCompareArrows } from 'lucide-react'
import { formatPrice } from '../../api/mockData'
import { shortDate, fullDateTime } from '../utils/time'

// One colour per slot — consistent regardless of which products are selected
const SLOT_COLORS = ['#3b82f6', '#10b981', '#8b5cf6']

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Merges price histories from multiple products into rows keyed by date.
 * Missing data for a product on a given date is stored as null so recharts
 * can connect or break the line gracefully.
 *
 * @param {object[]} products  Full product objects with .priceHistory
 * @param {number}   days      Number of days to show (from today backwards)
 * @returns {{ date: string; [asin: string]: number | null }[]}
 */
function buildComparisonData(products, days) {
  if (!products.length) return []

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffStr = cutoff.toISOString().split('T')[0]

  // Collect every date across all products within the range
  const dateSet = new Set()
  for (const p of products) {
    for (const h of p.priceHistory ?? []) {
      if (h.date >= cutoffStr) dateSet.add(h.date)
    }
  }

  const sortedDates = [...dateSet].sort()

  // Build a lookup: asin → Map<date, price>
  const lookup = {}
  for (const p of products) {
    lookup[p.asin] = new Map(
      (p.priceHistory ?? [])
        .filter((h) => h.date >= cutoffStr)
        .map((h) => [h.date, h.price])
    )
  }

  return sortedDates.map((date) => {
    const row = { date }
    for (const p of products) {
      row[p.asin] = lookup[p.asin].get(date) ?? null
    }
    return row
  })
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function ComparisonTooltip({ active, payload, label, productMap }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 min-w-44">
      <p className="text-xs text-slate-400 mb-2 font-medium">{shortDate(label)}</p>
      {payload
        .filter((e) => e.value != null)
        .map((entry) => {
          const product = productMap[entry.dataKey]
          return (
            <div key={entry.dataKey} className="flex items-center gap-2 py-0.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: entry.color }}
              />
              <span className="text-xs text-slate-500 truncate max-w-28">
                {product?.shortName ?? product?.name ?? entry.dataKey}
              </span>
              <span className="text-xs font-bold text-slate-900 ml-auto pl-2">
                {formatPrice(entry.value)}
              </span>
            </div>
          )
        })}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * @param {{ products: object[] }} props
 */
export default function ComparisonChart({ products = [] }) {
  const rangeDays = 7

  // Default: all active products selected
  const [selectedAsins, setSelectedAsins] = useState(() =>
    products.filter((p) => p.active).map((p) => p.asin)
  )

  // Keep selectedAsins in sync when the products list changes (e.g. a slot cleared)
  const activeAsins = useMemo(() => products.map((p) => p.asin), [products])
  const filteredSelected = selectedAsins.filter((a) => activeAsins.includes(a))

  const selectOptions = products.map((p, i) => ({
    label: p.shortName ?? p.name,
    value: p.asin,
    color: SLOT_COLORS[i % SLOT_COLORS.length],
  }))

  const selectedProducts = products.filter((p) => filteredSelected.includes(p.asin))

  const chartData = useMemo(
    () => buildComparisonData(selectedProducts, rangeDays),
    [selectedProducts, rangeDays]
  )

  // Map asin → product for tooltip lookup
  const productMap = useMemo(
    () => Object.fromEntries(products.map((p) => [p.asin, p])),
    [products]
  )

  // Global price range for y-axis
  const { yMin, yMax } = useMemo(() => {
    const allPrices = chartData.flatMap((row) =>
      selectedProducts.map((p) => row[p.asin]).filter((v) => v != null)
    )
    if (!allPrices.length) return { yMin: 0, yMax: 100 }
    const lo = Math.min(...allPrices)
    const hi = Math.max(...allPrices)
    const pad = (hi - lo) * 0.12 || 5
    return { yMin: lo - pad, yMax: hi + pad }
  }, [chartData, selectedProducts])

  const hasData = chartData.length >= 2 && selectedProducts.length > 0

  // Multi-select item template with colour dot
  const itemTemplate = (option) => (
    <div className="flex items-center gap-2">
      <span
        className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ background: option.color }}
      />
      <span className="text-sm">{option.label}</span>
    </div>
  )

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mt-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 text-blue-600">
            <GitCompareArrows className="w-4 h-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Price Comparison</p>
            <p className="text-xs text-slate-400">Compare trends across tracked products</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Product multi-select */}
          <MultiSelect
            value={filteredSelected}
            options={selectOptions}
            onChange={(e) => setSelectedAsins(e.value)}
            optionLabel="label"
            optionValue="value"
            itemTemplate={itemTemplate}
            placeholder="Select products"
            display="chip"
            className="text-sm"
            style={{ minWidth: '220px', maxWidth: '340px' }}
            showSelectAll
            selectAllLabel="All products"
          />


        </div>
      </div>

      {/* Chart body */}
      <div className="px-6 py-5">
        {!hasData ? (
          <div className="h-72 flex items-center justify-center text-sm text-slate-400 italic">
            {selectedProducts.length === 0
              ? 'Select at least one product above to see the chart.'
              : 'Not enough price history to display a comparison.'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 8, right: 24, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => shortDate(v)}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[yMin, yMax]}
                tickFormatter={(v) => `$${v.toFixed(0)}`}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip
                content={
                  <ComparisonTooltip productMap={productMap} />
                }
              />
              <Legend
                formatter={(value) => {
                  const p = productMap[value]
                  return (
                    <span className="text-xs text-slate-600">
                      {p?.shortName ?? p?.name ?? value}
                    </span>
                  )
                }}
                wrapperStyle={{ paddingTop: '12px', fontSize: '12px' }}
              />
              {selectedProducts.map((product, i) => (
                <Line
                  key={product.asin}
                  type="monotone"
                  dataKey={product.asin}
                  name={product.asin}
                  stroke={SLOT_COLORS[i % SLOT_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: 'white' }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
