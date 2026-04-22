/**
 * Dashboard.jsx
 *
 * Main content area. Combines the stats bar, product grid, and product
 * detail modal. Receives all products and delegates individual history
 * viewing to the modal.
 */

import { useState } from 'react'
import StatsBar from './StatsBar'
import ProductGrid from './ProductGrid'
import ProductDetailModal from './ProductDetailModal'
import AlertsColumn from '../alerts/AlertsColumn'

/**
 * @param {{
 *   products: object[];
 *   loading: boolean;
 *   error: string | null;
 *   onSettingsClick: () => void;
 *   onTogglePause: (product: object) => void;
 *   alerts: object[];
 *   onDismissAlert: (id: string) => void;
 * }} props
 */
export default function Dashboard({
  products,
  loading,
  error,
  onSettingsClick,
  onTogglePause,
  alerts = [],
  onDismissAlert,
}) {
  const [selectedProduct, setSelectedProduct] = useState(null)

  return (
    <div>
      {/* Page heading */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Price Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">
          Real-time price monitoring for your tracked Amazon products.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          <span className="font-semibold">Error loading data:</span> {error}
        </div>
      )}

      {/* Summary stats (full width) */}
      <StatsBar products={products} loading={loading} />

      {/* Two-column layout: product grid + alerts sidebar */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Product cards — grows to fill available space */}
        <div className="flex-1 min-w-0">
          <ProductGrid
            products={products}
            loading={loading}
            onViewHistory={setSelectedProduct}
            onSettingsClick={onSettingsClick}
            onTogglePause={onTogglePause}
          />
        </div>

        {/* Alerts sidebar — fixed width on large screens, full width on mobile */}
        <div className="w-full lg:w-72 flex-shrink-0">
          <AlertsColumn alerts={alerts} onDismiss={onDismissAlert} />
        </div>
      </div>

      {/* Detail modal */}
      <ProductDetailModal
        product={selectedProduct}
        visible={!!selectedProduct}
        onHide={() => setSelectedProduct(null)}
      />
    </div>
  )
}
