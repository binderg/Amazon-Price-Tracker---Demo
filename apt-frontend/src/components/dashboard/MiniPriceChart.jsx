/**
 * MiniPriceChart.jsx
 *
 * A tiny sparkline area chart embedded in each ProductCard.
 * Shows the last N days of price history with no axes or labels.
 */

import { AreaChart, Area, Tooltip } from 'recharts'
import { formatPrice } from '../../api/mockData'
import { shortDate } from '../utils/time'

const DAYS_SHOWN = 14

function MiniTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const { price, date } = payload[0].payload
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-md px-2.5 py-1.5 text-xs">
      <p className="font-semibold text-slate-800">{formatPrice(price)}</p>
      <p className="text-slate-400">{shortDate(date)}</p>
    </div>
  )
}

/**
 * @param {{
 *   history: { date: string; price: number }[];
 *   trend: 'up' | 'down' | 'flat';
 * }} props
 */
export default function MiniPriceChart({ history = [], trend = 'flat' }) {
  const slice = history.slice(-DAYS_SHOWN)

  if (slice.length < 2) {
    return (
      <div className="h-10 flex items-center justify-center text-xs text-slate-300 italic">
        Not enough data
      </div>
    )
  }

  const strokeColor =
    trend === 'down' ? '#16a34a' : trend === 'up' ? '#dc2626' : '#3b82f6'
  const fillColor =
    trend === 'down' ? '#dcfce7' : trend === 'up' ? '#fee2e2' : '#dbeafe'

  return (
    <div className="h-10 w-full min-w-0 overflow-hidden">
      <AreaChart width={260} height={40} data={slice} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <defs>
          <linearGradient id={`miniGrad-${trend}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={fillColor} stopOpacity={0.8} />
            <stop offset="95%" stopColor={fillColor} stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <Tooltip content={<MiniTooltip />} />
        <Area
          type="monotone"
          dataKey="price"
          stroke={strokeColor}
          strokeWidth={1.5}
          fill={`url(#miniGrad-${trend})`}
          dot={false}
          activeDot={{ r: 3, fill: strokeColor }}
          isAnimationActive={false}
        />
      </AreaChart>
    </div>
  )
}
