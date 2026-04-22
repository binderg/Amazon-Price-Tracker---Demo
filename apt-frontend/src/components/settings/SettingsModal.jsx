/**
 * SettingsModal.jsx
 *
 * Manages the user's 3 tracked product URL slots.
 * Parses each URL to show the detected ASIN inline.
 * Includes a fake "upgrade to premium" section — this is a demo placeholder.
 */

import { useState, useEffect } from 'react'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { Button } from 'primereact/button'
import {
  Link,
  CheckCircle,
  AlertCircle,
  Crown,
  ArrowRight,
  Info,
  X,
} from 'lucide-react'
import { parseAsin } from '../../api/mockData'

// ─── URL slot editor ──────────────────────────────────────────────────────────

function isValidAmazonUrl(url) {
  if (!url) return true // empty is ok — slot is just unused
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

function UrlSlot({ slot, index, onChange }) {
  const { url, name } = slot
  const asin = parseAsin(url)
  const valid = isValidAmazonUrl(url)
  const hasUrl = url.trim().length > 0

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-slate-700">
          Product {index + 1}
        </label>
        {hasUrl && (
          <span className="text-xs text-slate-400">
            {valid && asin ? (
              <span className="flex items-center gap-1 text-emerald-600">
                <CheckCircle className="w-3.5 h-3.5" />
                ASIN: <span className="font-mono">{asin}</span>
              </span>
            ) : valid ? (
              <span className="flex items-center gap-1 text-amber-500">
                <AlertCircle className="w-3.5 h-3.5" />
                ASIN not detected
              </span>
            ) : (
              <span className="flex items-center gap-1 text-red-500">
                <AlertCircle className="w-3.5 h-3.5" />
                Invalid Amazon URL
              </span>
            )}
          </span>
        )}
      </div>

      {/* Custom display name */}
      <InputText
        value={name}
        onChange={(e) => onChange({ ...slot, name: e.target.value })}
        placeholder="Display name (optional)"
        className="text-sm"
      />

      {/* URL input */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          <Link className="w-4 h-4" />
        </span>
        <InputText
          value={url}
          onChange={(e) => onChange({ ...slot, url: e.target.value })}
          placeholder="https://www.amazon.com/dp/XXXXXXXXXX"
          className={`pl-9 text-sm font-mono ${
            hasUrl && !valid
              ? 'border-red-400 ! focus:ring-red-200 !'
              : ''
          }`}
        />
        {hasUrl && (
          <button
            type="button"
            onClick={() => onChange({ ...slot, url: '' })}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Premium upsell banner ────────────────────────────────────────────────────

function PremiumBanner() {
  return (
    <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5">
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-amber-100 text-amber-600 flex-shrink-0">
          <Crown className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-semibold text-amber-900">Upgrade to Premium</p>
            <span className="text-xs font-bold text-white bg-amber-500 px-2 py-0.5 rounded-full">
              PRO
            </span>
          </div>
          <p className="text-xs text-amber-700 leading-relaxed">
            You're on the <strong>Free Plan</strong> — up to 3 products. Upgrade to
            track unlimited products, set custom check intervals, and receive instant
            email &amp; SMS alerts on price drops.
          </p>
          <button
            type="button"
            disabled
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-3 py-1.5 rounded-lg transition-colors cursor-not-allowed opacity-70"
            title="Demo — not available"
          >
            View Plans
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

/**
 * @param {{
 *   visible: boolean;
 *   onHide: () => void;
 *   settings: import('../../api/mockData').DEFAULT_SETTINGS;
 *   onSave: (settings: object) => void;
 * }} props
 */
export default function SettingsModal({ visible, onHide, settings, onSave }) {
  const [localSlots, setLocalSlots] = useState(settings?.slots ?? [])
  const [saved, setSaved] = useState(false)

  // Sync local state when the modal is opened
  useEffect(() => {
    if (visible) {
      setLocalSlots(settings?.slots ?? [])
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
    setTimeout(() => {
      setSaved(false)
      onHide()
    }, 800)
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
        <Button
          label="Discard"
          severity="secondary"
          outlined
          onClick={handleDiscard}
          size="small"
        />
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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </div>
          <div>
            <p className="text-base font-semibold text-slate-900">Settings</p>
            <p className="text-xs text-slate-400 font-normal">Manage your tracked products</p>
          </div>
        </div>
      }
      footer={footer}
      style={{ width: '520px', maxWidth: '95vw' }}
      modal
      draggable={false}
      resizable={false}
    >
      <div className="flex flex-col gap-6">
        {/* URL slots */}
        <div className="flex flex-col gap-5">
          {localSlots.map((slot, i) => (
            <UrlSlot
              key={slot.id}
              slot={slot}
              index={i}
              onChange={(updated) => updateSlot(i, updated)}
            />
          ))}
        </div>

        {/* Divider */}
        <hr className="border-slate-200" />

        {/* Premium upsell */}
        <PremiumBanner />
      </div>
    </Dialog>
  )
}
