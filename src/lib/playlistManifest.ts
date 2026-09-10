import type { MarqueeMessage, PlaylistItem, SidebarAd } from '../types'

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

function sidebarKey(tuktukId: number) {
  return `tuktuk-ads:sidebar:${tuktukId}`
}

export function loadSidebarManifest(tuktukId: number): SidebarAd[] {
  return readLocal(sidebarKey(tuktukId))
}

export function saveSidebarManifest(tuktukId: number, items: SidebarAd[]) {
  writeLocal(sidebarKey(tuktukId), items)
}

function marqueeKey(tuktukId: number) {
  return `tuktuk-ads:marquee:${tuktukId}`
}

export function loadMarqueeManifest(tuktukId: number): MarqueeMessage[] {
  return readLocal(marqueeKey(tuktukId))
}

export function saveMarqueeManifest(tuktukId: number, items: MarqueeMessage[]) {
  writeLocal(marqueeKey(tuktukId), items)
}
