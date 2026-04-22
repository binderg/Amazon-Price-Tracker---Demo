/**
 * useSettings.js
 *
 * Persists the user's slot configuration (URLs + names) in localStorage,
 * and synchronises with the backend on mount.
 *
 * Priority order:
 *   1. Backend DB (source of truth in live mode)
 *   2. localStorage (fast initial render / offline fallback)
 *   3. EMPTY_SETTINGS (brand-new install with no data)
 *
 * In DEMO_MODE the hook falls back to DEFAULT_SETTINGS (mock data) as before.
 */

import { useState, useEffect, useCallback } from 'react'
import { DEMO_MODE, getSettings } from '../api/apiClient'
import { DEFAULT_SETTINGS, DEFAULT_ALERT, parseAsin } from '../api/mockData'

const STORAGE_KEY = 'pricewatch_settings'

/** Empty 3-slot config used as the live-mode default (no mock URLs). */
const EMPTY_SETTINGS = {
  slots: [
    { id: 1, url: '', name: '', scrape_interval_minutes: 60, ...DEFAULT_ALERT },
    { id: 2, url: '', name: '', scrape_interval_minutes: 60, ...DEFAULT_ALERT },
    { id: 3, url: '', name: '', scrape_interval_minutes: 60, ...DEFAULT_ALERT },
  ],
}

function getAppDefault() {
  return DEMO_MODE ? DEFAULT_SETTINGS : EMPTY_SETTINGS
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return getAppDefault()
    const parsed = JSON.parse(raw)
    const def = getAppDefault()
    // Merge with defaults so new fields are always present
    return {
      ...def,
      ...parsed,
      slots: def.slots.map((defaultSlot) => {
        const saved = parsed.slots?.find((s) => s.id === defaultSlot.id)
        return saved ? { ...defaultSlot, ...saved } : defaultSlot
      }),
    }
  } catch {
    return getAppDefault()
  }
}

function persistSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    console.error('[useSettings] Failed to persist settings')
  }
}

/**
 * @returns {{
 *   settings: typeof DEFAULT_SETTINGS,
 *   saveSettings: (next: typeof DEFAULT_SETTINGS) => void,
 *   updateSlot: (id: number, patch: Partial<Slot>) => void,
 *   getSlotAsin: (id: number) => string | null,
 *   settingsLoading: boolean,
 * }}
 */
export function useSettings() {
  const [settings, setSettings] = useState(loadSettings)
  const [settingsLoading, setSettingsLoading] = useState(!DEMO_MODE)

  // On mount (live mode only), fetch the current slot config from the backend
  // and override whatever was in localStorage.
  useEffect(() => {
    if (DEMO_MODE) return
    let cancelled = false

    getSettings()
      .then((backendSettings) => {
        if (cancelled) return
        if (backendSettings?.slots?.length > 0) {
          const def = getAppDefault()
          // Merge backend slots with per-slot defaults so new alert fields are present
          const merged = {
            ...def,
            ...backendSettings,
            slots: def.slots.map((defaultSlot) => {
              const fromBackend = backendSettings.slots.find((s) => s.id === defaultSlot.id)
              return fromBackend
                ? { ...defaultSlot, ...fromBackend }
                : defaultSlot
            }),
          }
          setSettings(merged)
          persistSettings(merged)
        }
      })
      .catch((err) => {
        console.warn('[useSettings] Could not load settings from backend:', err.message)
      })
      .finally(() => {
        if (!cancelled) setSettingsLoading(false)
      })

    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const saveSettings = useCallback((next) => {
    setSettings(next)
    persistSettings(next)
  }, [])

  const updateSlot = useCallback(
    (id, patch) => {
      const next = {
        ...settings,
        slots: settings.slots.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      }
      saveSettings(next)
    },
    [settings, saveSettings],
  )

  const getSlotAsin = useCallback(
    (id) => {
      const slot = settings.slots.find((s) => s.id === id)
      return slot ? parseAsin(slot.url) : null
    },
    [settings.slots],
  )

  return { settings, saveSettings, updateSlot, getSlotAsin, settingsLoading }
}
