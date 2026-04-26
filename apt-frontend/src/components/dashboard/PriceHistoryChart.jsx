/**
 * PriceHistoryChart.jsx
 *
 * Full-size recharts area chart for the ProductDetailModal.
 * Shows a configurable date range with a reference line for the current price.
 */

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { formatPrice } from '../../api/mockData'
import { shortDate, fullDateTime } from '../utils/time'

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const { price, timestamp, date } = payload[0].payload
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-sm min-w-36">
      <p className="text-xs text-slate-400 mb-1">{fullDateTime(timestamp ?? date)}</p>
      <p className="text-base font-bold text-slate-900">{formatPrice(price)}</p>
    </div>
  )
}

function CustomDot(props) {
  const { cx, cy, payload, currentPrice } = props
  if (Math.abs(payload.price - currentPrice) < 0.005) {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill="#3b82f6"
        stroke="white"
        strokeWidth={2}
      />
    )
  }
  return null
}

/**
 * @param {{
 *   history: { date: string; price: number; timestamp?: string }[];
 *   currentPrice: number;
 * }} props
 */
export default function PriceHistoryChart({ history = [], currentPrice }) {
  const slice = history

  if (slice.length < 2) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-slate-400 italic">
        Not enough price history to display a chart.
      </div>
    )
  }

  const prices = slice.map((d) => d.price)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const padding = (maxPrice - minPrice) * 0.15 || 5

  // Determine trend colour for the whole chart
  const firstPrice = prices[0]
  const lastPrice = prices[prices.length - 1]
  const isDown = lastPrice <= firstPrice
  const strokeColor = isDown ? '#16a34a' : '#ef4444'
  const fillId = isDown ? 'chartGradDown' : 'chartGradUp'
  const fillColorTop = isDown ? '#dcfce7' : '#fee2e2'

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={slice} margin={{ top: 10, right: 16, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={fillColorTop} stopOpacity={0.8} />
            <stop offset="95%" stopColor={fillColorTop} stopOpacity={0} />
          </linearGradient>
        </defs>
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
          domain={[minPrice - padding, maxPrice + padding]}
          tickFormatter={(v) => `$${v.toFixed(0)}`}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip content={<ChartTooltip />} />
        {currentPrice != null && (
          <ReferenceLine
            y={currentPrice}
            stroke="#3b82f6"
            strokeDasharray="4 4"
            strokeWidth={1.5}
            label={{
              value: `Current ${formatPrice(currentPrice)}`,
              position: 'right',
              fill: '#3b82f6',
              fontSize: 10,
            }}
          />
        )}
        <Area
          type="monotone"
          dataKey="price"
          stroke={strokeColor}
          strokeWidth={2}
          fill={`url(#${fillId})`}
          dot={<CustomDot currentPrice={currentPrice} />}
          activeDot={{ r: 4, fill: strokeColor, stroke: 'white', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
