/**
 * ProductCard.jsx
 *
 * Displays a single tracked product: current price, trend, mini sparkline,
 * and key metadata. Clicking "View History" opens the detail modal.
 */

import { memo, useState } from 'react'
import {
  TrendingDown,
  TrendingUp,
  Minus,
  Package,
  ExternalLink,
  BarChart2,
  Clock,
  PauseCircle,
  PlayCircle,
  CheckCircle,
  RefreshCw,
} from 'lucide-react'
import { formatPrice } from '../../api/mockData'
import { formatDistanceToNow } from '../utils/time'
import MiniPriceChart from './MiniPriceChart'

function PriceChangeBadge({ change, changePct }) {
  if (change == null || Math.abs(change) < 0.005) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
        <Minus className="w-3 h-3" />
        No change
      </span>
    )
  }

  const isDown = change < 0
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
        isDown
          ? 'text-emerald-700 bg-emerald-50'
          : 'text-red-600 bg-red-50'
      }`}
    >
      {isDown ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
      {isDown ? '' : '+'}
      {formatPrice(Math.abs(change))} ({Math.abs(changePct)}%)
    </span>
  )
}

function StatusBadge({ active }) {
  if (active) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
        <CheckCircle className="w-3 h-3" />
        Active
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
      <PauseCircle className="w-3 h-3" />
      Paused
    </span>
  )
}

/**
 * @param {{
 *   product: object;
 *   onViewHistory: (product: object) => void;
 * }} props
 */
const ProductCard = memo(function ProductCard({ product, onViewHistory, onTogglePause, onTriggerCheck }) {
  const [checking, setChecking] = useState(false)
  const { name, shortName, asin, url, currentPrice, active, lastChecked, priceHistory, stats } =
    product

  async function handleCheckNow() {
    if (!onTriggerCheck || checking) return
    setChecking(true)
    try {
      await onTriggerCheck(product)
    } finally {
      // Keep the spinner visible briefly so the click feels acknowledged —
      // the real result will arrive via SSE and update the card automatically.
      setTimeout(() => setChecking(false), 2000)
    }
  }

  const trend =
    stats?.change24h == null || Math.abs(stats.change24h) < 0.01
      ? 'flat'
      : stats.change24h < 0
        ? 'down'
        : 'up'

  const displayName = shortName ?? name

  return (
    <div
      className={`flex flex-col bg-white rounded-2xl border shadow-sm transition-shadow hover:shadow-md overflow-hidden ${
        active ? 'border-slate-200' : 'border-slate-200 opacity-75'
      }`}
    >
      {/* Card top accent bar */}
      <div
        className={`h-1 w-full ${
          !active
            ? 'bg-slate-200'
            : trend === 'down'
              ? 'bg-emerald-400'
              : trend === 'up'
                ? 'bg-red-400'
                : 'bg-blue-400'
        }`}
      />

      <div className="flex flex-col flex-1 p-5 gap-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 flex-shrink-0 text-slate-400">
              <Package className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p
                className="text-sm font-semibold text-slate-900 leading-snug truncate"
                title={name}
              >
                {displayName}
              </p>
              {asin && (
                <p className="text-xs text-slate-400 font-mono mt-0.5">ASIN: {asin}</p>
              )}
            </div>
          </div>
          <StatusBadge active={active} />
        </div>

        {/* Price section */}
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-3xl font-bold text-slate-900 leading-none">
              {formatPrice(currentPrice)}
            </p>
            <div className="mt-2">
              <PriceChangeBadge
                change={stats?.change24h}
                changePct={stats?.changePct24h}
              />
            </div>
          </div>
          {/* 30-day range */}
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-slate-400">30d range</p>
            <p className="text-sm font-medium text-slate-600">
              {formatPrice(stats?.min)} – {formatPrice(stats?.max)}
            </p>
          </div>
        </div>

        {/* Mini chart */}
        <MiniPriceChart history={priceHistory} trend={trend} />

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-100 gap-2">
          <span className="flex items-center gap-1.5 text-xs text-slate-400">
            <Clock className="w-3.5 h-3.5 flex-shrink-0" />
            {lastChecked ? formatDistanceToNow(lastChecked) : '—'}
          </span>

          <div className="flex items-center gap-1.5">
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                title="Open on Amazon"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            {onTriggerCheck && active && (
              <button
                onClick={handleCheckNow}
                disabled={checking}
                title="Trigger an immediate price check"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-violet-600 hover:text-violet-700 hover:bg-violet-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
                {checking ? 'Checking…' : 'Check Now'}
              </button>
            )}
            {onTogglePause && (
              <button
                onClick={() => onTogglePause(product)}
                title={active ? 'Pause tracking' : 'Resume tracking'}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50'
                    : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                {active
                  ? <><PauseCircle className="w-3.5 h-3.5" /> Pause</>
                  : <><PlayCircle className="w-3.5 h-3.5" /> Resume</>
                }
              </button>
            )}
            <button
              onClick={() => onViewHistory(product)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-colors cursor-pointer"
            >
              <BarChart2 className="w-3.5 h-3.5" />
              History
            </button>
          </div>
        </div>
      </div>
    </div>
  )
})

export default ProductCard
