/**
 * useSettings.js
 *
 * Persists the user's slot configuration (URLs + names) in localStorage.
 * Also stores global preferences like the check interval.
 */

import { useState, useCallback } from 'react'
import { DEFAULT_SETTINGS, parseAsin } from '../api/mockData'

const STORAGE_KEY = 'pricewatch_settings'

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw)
    // Merge with defaults so new fields are always present
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      slots: DEFAULT_SETTINGS.slots.map((defaultSlot) => {
        const saved = parsed.slots?.find((s) => s.id === defaultSlot.id)
        return saved ? { ...defaultSlot, ...saved } : defaultSlot
      }),
    }
  } catch {
    return DEFAULT_SETTINGS
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
 * }}
 */
export function useSettings() {
  const [settings, setSettings] = useState(loadSettings)

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

  return { settings, saveSettings, updateSlot, getSlotAsin }
}
