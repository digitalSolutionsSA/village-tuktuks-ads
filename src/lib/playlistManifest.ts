import type { PlaylistItem } from '../types'

function readLocal<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    return JSON.parse(raw) as T[]
  } catch {
    return []
  }
}

function writeLocal<T>(key: string, items: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(items))
  } catch {
    // storage full or unavailable — playback continues from in-memory state
  }
}

function key(tuktukId: number) {
  return `tuktuk-ads:playlist:${tuktukId}`
}

export function loadManifest(tuktukId: number): PlaylistItem[] {
  return readLocal(key(tuktukId))
}

export function saveManifest(tuktukId: number, items: PlaylistItem[]) {
  writeLocal(key(tuktukId), items)
}
