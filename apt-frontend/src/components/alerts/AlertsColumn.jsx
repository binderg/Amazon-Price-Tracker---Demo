/**
 * AlertsColumn.jsx
 *
 * Sidebar column that lists all active (non-dismissed) price-drop alerts.
 * Each alert renders as an AlertItem component. Dismissed alerts are
 * persisted to localStorage via the useAlerts hook so they stay gone on
 * page reload.
 */

import { Bell, BellOff } from 'lucide-react'
import AlertItem from './AlertItem'

/**
 * @param {{
 *   alerts: object[];
 *   onDismiss: (id: string) => void;
 * }} props
 */
export default function AlertsColumn({ alerts = [], onDismiss }) {
  return (
    <aside className="flex flex-col gap-3 w-full flex-1 min-h-0">
      {/* Column header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700">Recent Alerts</h2>
        </div>
        {alerts.length > 0 && (
          <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-xs font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 rounded-full">
            {alerts.length}
          </span>
        )}
      </div>

      {/* Alert list or empty state — fills remaining height, scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-2">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 bg-white border border-slate-200 rounded-2xl text-center">
            <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
              <BellOff className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-600">No alerts</p>
              <p className="text-xs text-slate-400 mt-0.5">Price drops will appear here</p>
            </div>
          </div>
        ) : (
          alerts.map((alert) => (
            <AlertItem key={alert.id} alert={alert} onDismiss={onDismiss} />
          ))
        )}
      </div>
    </aside>
  )
}
