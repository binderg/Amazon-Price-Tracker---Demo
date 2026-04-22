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

/**
 * @param {{
 *   products: object[];
 *   loading: boolean;
 *   error: string | null;
 *   onSettingsClick: () => void;
 * }} props
 */
export default function Dashboard({ products, loading, error, onSettingsClick }) {
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

      {/* Summary stats */}
      <StatsBar products={products} loading={loading} />

      {/* Product cards */}
      <ProductGrid
        products={products}
        loading={loading}
        onViewHistory={setSelectedProduct}
        onSettingsClick={onSettingsClick}
      />

      {/* Detail modal */}
      <ProductDetailModal
        product={selectedProduct}
        visible={!!selectedProduct}
        onHide={() => setSelectedProduct(null)}
      />
    </div>
  )
}
