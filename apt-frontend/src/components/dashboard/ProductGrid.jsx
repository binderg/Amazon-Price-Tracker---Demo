/**
 * ProductGrid.jsx
 *
 * Lays out the 3 product cards in a responsive grid.
 * Handles loading skeletons and the empty state when no products are configured.
 */

import { PackagePlus } from 'lucide-react'
import ProductCard from './ProductCard'

function SkeletonCard() {
  return (
    <div className="flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-pulse">
      <div className="h-1 bg-slate-200" />
      <div className="p-5 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-200" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-slate-200 rounded w-3/4" />
            <div className="h-3 bg-slate-100 rounded w-1/3" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-8 bg-slate-200 rounded w-1/2" />
          <div className="h-5 bg-slate-100 rounded w-1/3" />
        </div>
        <div className="h-14 bg-slate-100 rounded" />
        <div className="flex justify-between items-center pt-1 border-t border-slate-100">
          <div className="h-3 bg-slate-100 rounded w-1/4" />
          <div className="h-6 bg-slate-100 rounded w-1/5" />
        </div>
      </div>
    </div>
  )
}

function EmptySlot({ slotNumber, onSettingsClick }) {
  return (
    <div className="flex flex-col items-center justify-center bg-white rounded-2xl border border-dashed border-slate-300 min-h-64 p-6 gap-3 text-center">
      <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-slate-100 text-slate-400">
        <PackagePlus className="w-6 h-6" />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-600">Slot {slotNumber} — Empty</p>
        <p className="text-xs text-slate-400 mt-1">
          Add a product URL in{' '}
          <button
            onClick={onSettingsClick}
            className="text-blue-500 hover:underline font-medium cursor-pointer"
          >
            Settings
          </button>
        </p>
      </div>
    </div>
  )
}

/**
 * @param {{
 *   products: object[];
 *   loading: boolean;
 *   onViewHistory: (product: object) => void;
 *   onSettingsClick: () => void;
 * }} props
 */
export default function ProductGrid({ products = [], loading, onViewHistory, onSettingsClick, onTogglePause, onTriggerCheck }) {
  const SLOT_COUNT = 3

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {[...Array(SLOT_COUNT)].map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  const slots = Array.from({ length: SLOT_COUNT }, (_, i) => products[i] ?? null)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {slots.map((product, i) =>
        product ? (
          <ProductCard
            key={product.id}
            product={product}
            onViewHistory={onViewHistory}
            onTogglePause={onTogglePause}
            onTriggerCheck={onTriggerCheck}
          />
        ) : (
          <EmptySlot key={i} slotNumber={i + 1} onSettingsClick={onSettingsClick} />
        ),
      )}
    </div>
  )
}
