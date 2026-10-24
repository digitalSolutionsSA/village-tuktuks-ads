import { useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'vt.theme'
const listeners = new Set<() => void>()

function read(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

let current: Theme = read()

function setTheme(next: Theme) {
  current = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* storage blocked — the choice just lasts for this visit */
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * The staff portal's colour mode, remembered per device. Dark by default. Apply it with
 * `data-theme={theme}` on a page's root element (see index.css); the tuk-tuk player never does.
 */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, () => current)
  return { theme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') }
}
