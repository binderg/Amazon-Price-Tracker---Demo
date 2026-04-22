/**
 * SettingsModal.jsx
 *
 * Manages the user's 3 tracked product URL slots plus per-product alert
 * thresholds. Slots render as stacked rows so URL inputs never get clipped.
 */

import { useState, useEffect } from 'react'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { InputNumber } from 'primereact/inputnumber'
import { Button } from 'primereact/button'
import {
  Link,
  CheckCircle,
  AlertCircle,
  Bell,
  BellOff,
  Info,
  X,
  Settings2,
  Clock,
} from 'lucide-react'
import { parseAsin, INTERVAL_OPTIONS, DEFAULT_ALERT } from '../../api/mockData'

// ─── Interval slider ──────────────────────────────────────────────────────────

function IntervalSlider({ value, onChange }) {
  const currentIndex = INTERVAL_OPTIONS.findIndex((o) => o.minutes === value)
  const index = currentIndex === -1 ? 2 : currentIndex

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          Check Interval
        </label>
        <span className="text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
          {INTERVAL_OPTIONS[index].label}
        </span>
      </div>
      <div className="relative px-1">
        <input
          type="range"
          min={0}
          max={INTERVAL_OPTIONS.length - 1}
          step={1}
          value={index}
          onChange={(e) => onChange(INTERVAL_OPTIONS[Number(e.target.value)].minutes)}
          className="w-full h-1.5 appearance-none rounded-full bg-slate-200 cursor-pointer accent-blue-600"
        />
        <div className="flex justify-between mt-1.5">
          {INTERVAL_OPTIONS.map((opt, i) => (
            <button
              key={opt.minutes}
              type="button"
              onClick={() => onChange(opt.minutes)}
              className={`text-xs transition-colors ${
                i === index ? 'text-blue-600 font-semibold' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Alert threshold section ──────────────────────────────────────────────────

const THRESHOLD_MODES = [
  { value: 'percent',  label: '% Drop',  description: 'Trigger when price drops by a percentage' },
  { value: 'absolute', label: '$ Drop',  description: 'Trigger when price drops by a fixed amount' },
  { value: 'both',     label: 'Both',    description: 'Trigger only when BOTH conditions are met' },
]

function AlertThresholds({ slot, onChange }) {
  const {
    alert_enabled    = true,
    threshold_mode   = 'percent',
    threshold_percent  = 5.0,
    threshold_absolute = 0.0,
  } = slot

  const showPercent  = threshold_mode === 'percent'  || threshold_mode === 'both'
  const showAbsolute = threshold_mode === 'absolute' || threshold_mode === 'both'

  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${
        alert_enabled
          ? 'border-emerald-200 bg-emerald-50/40'
          : 'border-slate-200 bg-slate-50/60 opacity-60'
      }`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {alert_enabled
            ? <Bell className="w-4 h-4 text-emerald-600" />
            : <BellOff className="w-4 h-4 text-slate-400" />
          }
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
            Price Drop Alert
          </span>
        </div>
        <button
          type="button"
          onClick={() => onChange({ ...slot, alert_enabled: !alert_enabled })}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
            alert_enabled ? 'bg-emerald-500' : 'bg-slate-300'
          }`}
          aria-label="Toggle alerts"
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
              alert_enabled ? 'translate-x-4' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {alert_enabled && (
        <div className="flex flex-col gap-3">
          {/* Mode selector */}
          <div className="flex gap-1.5">
            {THRESHOLD_MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                title={m.description}
                onClick={() => onChange({ ...slot, threshold_mode: m.value })}
                className={`flex-1 text-xs font-semibold py-1.5 px-2 rounded-lg border transition-colors cursor-pointer ${
                  threshold_mode === m.value
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Threshold inputs */}
          <div className={`grid gap-3 ${showPercent && showAbsolute ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {showPercent && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500 font-medium">Min % drop</label>
                <InputNumber
                  value={threshold_percent}
                  onValueChange={(e) => onChange({ ...slot, threshold_percent: e.value ?? 0 })}
                  min={0.1} max={99}
                  minFractionDigits={1} maxFractionDigits={1}
                  suffix="%" className="w-full" inputClassName="text-sm"
                />
              </div>
            )}
            {showAbsolute && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500 font-medium">Min $ drop</label>
                <InputNumber
                  value={threshold_absolute}
                  onValueChange={(e) => onChange({ ...slot, threshold_absolute: e.value ?? 0 })}
                  min={0.01} max={9999}
                  minFractionDigits={2} maxFractionDigits={2}
                  mode="currency" currency="USD" locale="en-US"
                  className="w-full" inputClassName="text-sm"
                />
              </div>
            )}
          </div>

          {/* Summary */}
          <p className="text-xs text-slate-400">
            {threshold_mode === 'percent'  && `Notify when price drops ≥ ${threshold_percent}%`}
            {threshold_mode === 'absolute' && `Notify when price drops ≥ $${threshold_absolute?.toFixed(2)}`}
            {threshold_mode === 'both'     && `Notify when price drops ≥ ${threshold_percent}% AND ≥ $${threshold_absolute?.toFixed(2)}`}
          </p>
        </div>
      )}

      {!alert_enabled && (
        <p className="text-xs text-slate-400">Notifications are disabled for this product.</p>
      )}
    </div>
  )
}

// ─── URL slot row card ────────────────────────────────────────────────────────

function isValidAmazonUrl(url) {
  if (!url) return true
  try {
    const u = new URL(url)
    return (
      u.hostname.includes('amazon.') &&
      (u.pathname.includes('/dp/') || u.pathname.includes('/gp/product/'))
    )
  } catch {
    return false
  }
}

function SlotRow({ slot, index, onChange }) {
  const { url = '', name = '', scrape_interval_minutes = 60 } = slot
  const asin  = parseAsin(url)
  const valid = isValidAmazonUrl(url)
  const hasUrl = url.trim().length > 0

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      {/* Slot header bar */}
      <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 text-slate-600 text-xs font-bold">
            {index + 1}
          </span>
          <span className="text-sm font-semibold text-slate-800">Product {index + 1}</span>
        </div>
        {hasUrl && (
          <span className="text-xs">
            {valid && asin ? (
              <span className="flex items-center gap-1 text-emerald-600 font-medium">
                <CheckCircle className="w-3.5 h-3.5" />
                ASIN: <span className="font-mono">{asin}</span>
              </span>
            ) : valid ? (
              <span className="flex items-center gap-1 text-amber-500">
                <AlertCircle className="w-3.5 h-3.5" /> ASIN not detected
              </span>
            ) : (
              <span className="flex items-center gap-1 text-red-500">
                <AlertCircle className="w-3.5 h-3.5" /> Invalid Amazon URL
              </span>
            )}
          </span>
        )}
      </div>

      <div className="p-5 flex flex-col gap-4">
        {/* Name + URL on same row — URL gets most of the space */}
        <div className="grid gap-3" style={{ gridTemplateColumns: '200px 1fr' }}>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Display name</label>
            <InputText
              value={name}
              onChange={(e) => onChange({ ...slot, name: e.target.value })}
              placeholder="e.g. Sony Headphones"
              className="text-sm w-full"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Amazon URL</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10">
                <Link className="w-3.5 h-3.5" />
              </span>
              <InputText
                value={url}
                onChange={(e) => onChange({ ...slot, url: e.target.value })}
                placeholder="https://www.amazon.com/dp/XXXXXXXXXX"
                className={`pl-8 text-sm font-mono w-full ${hasUrl && !valid ? 'border-red-400 !' : ''}`}
              />
              {hasUrl && (
                <button
                  type="button"
                  onClick={() => onChange({ ...slot, url: '' })}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer z-10"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Interval slider — full width */}
        <IntervalSlider
          value={scrape_interval_minutes}
          onChange={(minutes) => onChange({ ...slot, scrape_interval_minutes: minutes })}
        />

        {/* Alert thresholds — full width */}
        <AlertThresholds slot={slot} onChange={onChange} />
      </div>
    </div>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function SettingsModal({ visible, onHide, settings, onSave }) {
  const [localSlots, setLocalSlots] = useState(settings?.slots ?? [])
  const [saved, setSaved]           = useState(false)

  useEffect(() => {
    if (visible) {
      const merged = (settings?.slots ?? []).map((s) => ({ ...DEFAULT_ALERT, ...s }))
      setLocalSlots(merged)
      setSaved(false)
    }
  }, [visible, settings])

  function updateSlot(index, updatedSlot) {
    setLocalSlots((prev) => prev.map((s, i) => (i === index ? updatedSlot : s)))
    setSaved(false)
  }

  function handleSave() {
    const allValid = localSlots.every((s) => isValidAmazonUrl(s.url))
    if (!allValid) return
    onSave({ ...settings, slots: localSlots })
    setSaved(true)
    setTimeout(() => { setSaved(false); onHide() }, 800)
  }

  function handleDiscard() {
    setLocalSlots(settings?.slots ?? [])
    onHide()
  }

  const allValid = localSlots.every((s) => isValidAmazonUrl(s.url))

  const footer = (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <Info className="w-3.5 h-3.5" />
        Changes take effect on the next price check.
      </div>
      <div className="flex gap-2">
        <Button label="Discard" severity="secondary" outlined onClick={handleDiscard} size="small" />
        <Button
          label={saved ? 'Saved!' : 'Save Changes'}
          icon={saved ? 'pi pi-check' : undefined}
          onClick={handleSave}
          disabled={!allValid || saved}
          size="small"
          className={saved ? '!bg-emerald-600 !border-emerald-600' : ''}
        />
      </div>
    </div>
  )

  return (
    <Dialog
      visible={visible}
      onHide={handleDiscard}
      header={
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 text-slate-600">
            <Settings2 className="w-4 h-4" />
          </div>
          <div>
            <p className="text-base font-semibold text-slate-900">Settings</p>
            <p className="text-xs text-slate-400 font-normal">
              Configure tracked products and alert thresholds
            </p>
          </div>
        </div>
      }
      footer={footer}
      style={{ width: '780px', maxWidth: '96vw' }}
      modal
      draggable={false}
      resizable={false}
    >
      <div className="flex flex-col gap-4">
        {/* Section label */}
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
          <Settings2 className="w-3.5 h-3.5" />
          Tracked Products &amp; Alert Thresholds
        </div>

        {/* Stacked slot rows */}
        <div className="flex flex-col gap-4">
          {localSlots.map((slot, i) => (
            <SlotRow
              key={slot.id}
              slot={slot}
              index={i}
              onChange={(updated) => updateSlot(i, updated)}
            />
          ))}
        </div>

        {/* Tip */}
        <div className="flex items-start gap-2 text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>
            Paste any <strong className="text-slate-600">amazon.com/dp/…</strong> URL. The ASIN is
            parsed automatically. Per-product thresholds override global defaults in{' '}
            <code className="font-mono bg-slate-100 px-1 rounded">.env</code>.
          </span>
        </div>
      </div>
    </Dialog>
  )
}
