/**
 * ProductDetailModal.jsx
 *
 * Full-detail modal for a single product: price chart, statistics table,
 * and a link to the Amazon listing. Opened by clicking "History" on a card.
 */

import { useState } from "react";
import { Dialog } from "primereact/dialog";
import {
  TrendingDown,
  TrendingUp,
  Minus,
  ExternalLink,
  BarChart2,
  Tag,
} from "lucide-react";
import { formatPrice } from "../../api/mockData";
import PriceHistoryChart from "./PriceHistoryChart";

const RANGE_OPTIONS = [
  { label: "7d", value: "7d" },
  { label: "14d", value: "14d" },
  { label: "30d", value: "30d" },
  { label: "60d", value: "60d" },
];

function StatRow({ label, value, highlight }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span
        className={`text-sm font-semibold ${highlight ?? "text-slate-800"}`}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * @param {{
 *   product: object | null;
 *   visible: boolean;
 *   onHide: () => void;
 * }} props
 */
export default function ProductDetailModal({ product, visible, onHide }) {
  const [range, setRange] = useState("30d");

  if (!product) return null;

  const { name, asin, url, currentPrice, stats, priceHistory, category } =
    product;

  const changeColor =
    stats?.change24h == null || Math.abs(stats.change24h) < 0.01
      ? "text-slate-500"
      : stats.change24h < 0
        ? "text-emerald-600"
        : "text-red-600";

  const ChangIcon =
    stats?.change24h == null || Math.abs(stats.change24h) < 0.01
      ? Minus
      : stats.change24h < 0
        ? TrendingDown
        : TrendingUp;

  const header = (
    <div className="flex items-center gap-3">
      <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex-shrink-0">
        <BarChart2 className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-base font-semibold text-slate-900">
          {name.length > 100 ? name.slice(0, 100) + "..." : name}
        </p>{" "}
        <p className="text-xs text-slate-400 font-mono">
          ASIN: {asin ?? "—"}
          {category && (
            <span className="ml-2 font-sans not-monospace">· {category}</span>
          )}
        </p>
      </div>
    </div>
  );

  return (
    <Dialog
      visible={visible}
      onHide={onHide}
      header={header}
      style={{ width: "720px", maxWidth: "95vw" }}
      modal
      draggable={false}
      resizable={false}
      className="font-['Inter']"
    >
      <div className="flex flex-col gap-6">
        {/* Range selector + chart */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-slate-600">Price History</p>
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setRange(opt.value)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                    range === opt.value
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <PriceHistoryChart
            history={priceHistory}
            currentPrice={currentPrice}
            range={range}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Price stats */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Statistics
            </p>
            <div className="bg-slate-50 rounded-xl p-4">
              <StatRow
                label="Current Price"
                value={formatPrice(currentPrice)}
              />
              <StatRow
                label="24h Change"
                value={
                  stats?.change24h != null
                    ? `${stats.change24h > 0 ? "+" : ""}${formatPrice(stats.change24h)}`
                    : "—"
                }
                highlight={changeColor}
              />
              <StatRow
                label="30-day Low"
                value={formatPrice(stats?.min)}
                highlight="text-emerald-600"
              />
              <StatRow
                label="30-day High"
                value={formatPrice(stats?.max)}
                highlight="text-red-500"
              />
              <StatRow label="30-day Avg" value={formatPrice(stats?.avg)} />
            </div>
          </div>

          {/* Product info */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Product Info
            </p>
            <div className="bg-slate-50 rounded-xl p-4 flex flex-col gap-3">
              <div>
                <p className="text-xs text-slate-400 mb-1">ASIN</p>
                <p className="text-sm font-mono font-semibold text-slate-700">
                  {asin ?? "—"}
                </p>
              </div>
              {url && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">Amazon Listing</p>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    View on Amazon
                  </a>
                </div>
              )}
              {category && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">Category</p>
                  <span className="inline-flex items-center gap-1.5 text-xs bg-blue-50 text-blue-700 font-medium px-2.5 py-1 rounded-full border border-blue-100">
                    <Tag className="w-3 h-3" />
                    {category}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
