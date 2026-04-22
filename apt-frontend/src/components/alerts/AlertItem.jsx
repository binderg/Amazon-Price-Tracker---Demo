/**
 * AlertItem.jsx
 *
 * Displays a single price-drop alert card. The dismiss button (×) calls
 * `onDismiss` with the alert's ID, which persists the dismissal to
 * localStorage so the alert doesn't reappear on the next page load.
 */

import { memo } from 'react'
import { X, TrendingDown, ArrowRight, ExternalLink } from 'lucide-react'
import { formatPrice } from '../../api/mockData'
import { formatDistanceToNow } from '../utils/time'

/**
 * @param {{
 *   alert: {
 *     id: string;
 *     productName: string;
 *     productUrl: string | null;
 *     previousPrice: number;
 *     currentPrice: number;
 *     dropAmount: number;
 *     dropPercent: number;
 *     timestamp: string;
 *   };
 *   onDismiss: (id: string) => void;
 * }} props
 */
const AlertItem = memo(function AlertItem({ alert, onDismiss }) {
  const {
    id,
    productName,
    productUrl,
    previousPrice,
    currentPrice,
    dropAmount,
    dropPercent,
    timestamp,
  } = alert

  return (
    <div className="flex flex-col bg-white border border-emerald-200 rounded-xl p-3 gap-2 shadow-sm hover:shadow-md transition-shadow">
      {/* Header row: product name + dismiss button */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
            <TrendingDown className="w-3.5 h-3.5" />
          </div>
          <span
            className="text-xs font-semibold text-slate-800 leading-snug truncate"
            title={productName}
          >
            {productName}
          </span>
        </div>
        <button
          onClick={() => onDismiss(id)}
          title="Dismiss alert"
          className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Price change row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-slate-400 line-through">{formatPrice(previousPrice)}</span>
        <ArrowRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
        <span className="text-sm font-bold text-emerald-700">{formatPrice(currentPrice)}</span>
        <span className="ml-auto text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
          −{Math.abs(dropPercent)}%
        </span>
      </div>

      {/* Footer: savings + timestamp + link */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
        <span className="text-xs text-emerald-600 font-medium">
          Save {formatPrice(dropAmount)}
        </span>
        <span className="text-xs text-slate-400">{formatDistanceToNow(timestamp)}</span>
      </div>

      {productUrl && (
        <a
          href={productUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors"
        >
          <ExternalLink className="w-3 h-3 flex-shrink-0" />
          View on Amazon
        </a>
      )}
    </div>
  )
})

export default AlertItem
