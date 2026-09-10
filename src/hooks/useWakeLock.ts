import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Keeps the tablet screen awake using the Wake Lock API, re-acquiring it
 * whenever the tab regains visibility (locks are released automatically by
 * the browser when a page is hidden/backgrounded).
 */
export function useWakeLock() {
  const lockRef = useRef<WakeLockSentinel | null>(null)
  const [active, setActive] = useState(false)

  const request = useCallback(async () => {
    if (!('wakeLock' in navigator)) return
    try {
      const lock = await navigator.wakeLock.request('screen')
      lockRef.current = lock
      setActive(true)
      lock.addEventListener('release', () => setActive(false))
    } catch (err) {
      console.warn('[useWakeLock] request failed', err)
      setActive(false)
    }
  }, [])

  useEffect(() => {
    request()

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') request()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      lockRef.current?.release().catch(() => {})
    }
  }, [request])

  return { active, request }
}
