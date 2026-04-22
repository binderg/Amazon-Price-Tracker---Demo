/**
 * Header.jsx
 *
 * Top navigation bar with the app brand, live connection indicator,
 * last-updated timestamp, and the Settings trigger button.
 */

import { ShoppingCart, Settings, Wifi, WifiOff, Clock, RefreshCw } from 'lucide-react'
import { formatDistanceToNow } from '../utils/time'

const STATUS_CONFIG = {
  connected: {
    icon: <Wifi className="w-3.5 h-3.5" />,
    label: 'Live',
    className: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  },
  demo: {
    icon: <Wifi className="w-3.5 h-3.5" />,
    label: 'Demo',
    className: 'text-blue-600 bg-blue-50 border-blue-200',
  },
  connecting: {
    icon: <Wifi className="w-3.5 h-3.5 animate-pulse" />,
    label: 'Connecting',
    className: 'text-amber-600 bg-amber-50 border-amber-200',
  },
  disconnected: {
    icon: <WifiOff className="w-3.5 h-3.5" />,
    label: 'Offline',
    className: 'text-slate-500 bg-slate-100 border-slate-200',
  },
  error: {
    icon: <WifiOff className="w-3.5 h-3.5" />,
    label: 'Error',
    className: 'text-red-600 bg-red-50 border-red-200',
  },
}

/**
 * @param {{
 *   sseStatus: 'connected' | 'connecting' | 'demo' | 'disconnected' | 'error';
 *   lastUpdated: string | null;
 *   onSettingsClick: () => void;
 *   onRefresh: () => void;
 *   refreshing: boolean;
 * }} props
 */
export default function Header({
  sseStatus = 'demo',
  lastUpdated,
  onSettingsClick,
  onRefresh,
  refreshing = false,
}) {
  const status = STATUS_CONFIG[sseStatus] ?? STATUS_CONFIG.demo

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-600 text-white">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <span className="text-base font-semibold text-slate-900 tracking-tight">
                PriceWatch
              </span>
              <span className="hidden sm:inline text-sm text-slate-400 ml-2 font-normal">
                Amazon Price Tracker
              </span>
            </div>
          </div>

          {/* Right-side controls */}
          <div className="flex items-center gap-3">

            {/* SSE status badge */}
            <span
              className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${status.className}`}
            >
              {status.icon}
              {status.label}
            </span>

            {/* Last updated */}
            {lastUpdated && (
              <span className="hidden md:flex items-center gap-1.5 text-xs text-slate-400">
                <Clock className="w-3.5 h-3.5" />
                Updated {formatDistanceToNow(lastUpdated)}
              </span>
            )}

            {/* Manual refresh */}
            <button
              onClick={onRefresh}
              disabled={refreshing}
              title="Refresh prices"
              className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>

            {/* Settings */}
            <button
              onClick={onSettingsClick}
              title="Settings"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Settings</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
