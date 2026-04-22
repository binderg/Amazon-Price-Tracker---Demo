/**
 * App.jsx
 *
 * Root component. Sets up PrimeReact provider, the Toast ref for
 * price-drop notifications, and orchestrates Settings ↔ Dashboard state.
 */

import { useState, useRef, useCallback } from 'react'
import { PrimeReactProvider } from 'primereact/api'
import { Toast } from 'primereact/toast'
import Header from './components/layout/Header'
import Dashboard from './components/dashboard/Dashboard'
import SettingsModal from './components/settings/SettingsModal'
import { usePriceData } from './hooks/usePriceData'
import { useSettings } from './hooks/useSettings'
import { useAlerts } from './hooks/useAlerts'
import { formatPrice } from './api/mockData'
import { saveSettingsToBackend } from './api/apiClient'

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const toastRef = useRef(null)

  const { settings, saveSettings } = useSettings()
  const { alerts, addAlert, dismissAlert } = useAlerts()

  // Handle price-drop events from SSE / usePriceData
  const handlePriceDrop = useCallback(
    (dropEvent) => {
      toastRef.current?.show({
        severity: 'success',
        summary: 'Price Drop!',
        detail: `${dropEvent.product_name ?? 'A product'} dropped to ${formatPrice(dropEvent.current_price)} (−${formatPrice(dropEvent.drop_amount)})`,
        life: 6000,
      })
      addAlert(dropEvent)
    },
    [addAlert],
  )

  const {
    products,
    loading,
    error,
    lastUpdated,
    sseStatus,
    refresh,
    togglePause,
    applySettingsFilter,
  } = usePriceData({ onPriceDrop: handlePriceDrop })

  // Combined save: persist to localStorage, immediately filter product list,
  // and POST to backend when not in demo mode.
  const handleSaveSettings = useCallback(
    async (newSettings) => {
      saveSettings(newSettings)
      applySettingsFilter(newSettings)
      try { await saveSettingsToBackend(newSettings) } catch { /* no-op in demo */ }
    },
    [saveSettings, applySettingsFilter],
  )

  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    setRefreshing(true)
    await refresh()
    setRefreshing(false)
  }

  return (
    <PrimeReactProvider>
      <Toast ref={toastRef} position="top-right" />

      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header
          sseStatus={sseStatus}
          lastUpdated={lastUpdated}
          onSettingsClick={() => setSettingsOpen(true)}
          onRefresh={handleRefresh}
          refreshing={refreshing}
        />

        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
          <Dashboard
            products={products}
            loading={loading}
            error={error}
            onSettingsClick={() => setSettingsOpen(true)}
            onTogglePause={togglePause}
            alerts={alerts}
            onDismissAlert={dismissAlert}
          />
        </main>

        <footer className="border-t border-slate-200 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between text-xs text-slate-400">
            <span>PriceWatch &mdash; Demo</span>
            <span>Data simulated &mdash; no real Amazon requests are made</span>
          </div>
        </footer>
      </div>

      <SettingsModal
        visible={settingsOpen}
        onHide={() => setSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />
    </PrimeReactProvider>
  )
}
