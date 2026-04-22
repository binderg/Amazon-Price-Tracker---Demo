/**
 * StatsBar.jsx
 *
 * A summary row of aggregate statistics shown at the top of the dashboard.
 */

import { Package, TrendingDown, DollarSign, Timer } from 'lucide-react'
import { formatPrice } from '../../api/mockData'

function StatCard({ icon, label, value, sub, accent = false }) {
  return (
    <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-5 py-4 flex-1 min-w-0 shadow-xs">
      <div
        className={`flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0 ${
          accent ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-500'
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide truncate">
          {label}
        </p>
        <p className="text-xl font-semibold text-slate-900 leading-tight">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  )
}

/**
 * @param {{
 *   products: object[];
 *   loading: boolean;
 * }} props
 */
export default function StatsBar({ products = [], loading = false }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-slate-200 px-5 py-4 h-20 animate-pulse"
          />
        ))}
      </div>
    )
  }

  const activeProducts = products.filter((p) => p.active)
  const totalTracked = products.length

  // Best absolute saving across all tracked products
  const bestSaving = products.reduce((best, p) => {
    const saving = p.stats?.change24h != null ? -p.stats.change24h : 0
    return saving > best ? saving : best
  }, 0)

  // Lowest current price across tracked products
  const lowestPrice = products.reduce((min, p) => {
    if (p.currentPrice == null) return min
    return min === null || p.currentPrice < min ? p.currentPrice : min
  }, null)

  const lowestProduct = products.find((p) => p.currentPrice === lowestPrice)

  // Next check estimate — use a fixed 60 min interval from last check
  const intervals = activeProducts
    .map((p) => {
      if (!p.lastChecked) return null
      const elapsed = (Date.now() - new Date(p.lastChecked).getTime()) / 60000
      return Math.max(0, 60 - elapsed)
    })
    .filter(Boolean)

  const nextCheckMins =
    intervals.length > 0 ? Math.round(Math.min(...intervals)) : null

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <StatCard
        icon={<Package className="w-5 h-5" />}
        label="Products Tracked"
        value={totalTracked}
        sub={`${activeProducts.length} active`}
        accent
      />
      <StatCard
        icon={<TrendingDown className="w-5 h-5" />}
        label="Best Drop Today"
        value={bestSaving > 0 ? formatPrice(bestSaving) : '—'}
        sub={bestSaving > 0 ? 'saved vs yesterday' : 'no drops yet'}
      />
      <StatCard
        icon={<DollarSign className="w-5 h-5" />}
        label="Lowest Price"
        value={lowestPrice != null ? formatPrice(lowestPrice) : '—'}
        sub={lowestProduct?.shortName ?? lowestProduct?.name ?? '—'}
      />
      <StatCard
        icon={<Timer className="w-5 h-5" />}
        label="Next Check"
        value={nextCheckMins != null ? `${nextCheckMins}m` : '—'}
        sub="~60 min interval"
      />
    </div>
  )
}
