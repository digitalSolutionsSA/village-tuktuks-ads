import { useEffect, useRef, useState } from 'react'

const IDLE_TIMEOUT_MS = 2000

interface Props {
  title: string
  pinLength?: number
  onVerify: (pin: string) => Promise<boolean>
  onSuccess: () => void
  /** Fired after IDLE_TIMEOUT_MS with no key press — the pad should vanish. */
  onIdleTimeout: () => void
}

export function PinPad({ title, pinLength = 6, onVerify, onSuccess, onIdleTimeout }: Props) {
  const [digits, setDigits] = useState('')
  const [error, setError] = useState(false)
  const [checking, setChecking] = useState(false)
  const idleTimer = useRef<number | null>(null)

  const resetIdleTimer = () => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(onIdleTimeout, IDLE_TIMEOUT_MS)
  }

  useEffect(() => {
    resetIdleTimer()
    return () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pressDigit = async (d: string) => {
    if (checking) return
    setError(false)
    resetIdleTimer()
    const next = (digits + d).slice(0, pinLength)
    setDigits(next)
    if (next.length === pinLength) {
      setChecking(true)
      const ok = await onVerify(next)
      setChecking(false)
      if (ok) {
        if (idleTimer.current) window.clearTimeout(idleTimer.current)
        onSuccess()
      } else {
        setError(true)
        setDigits('')
        resetIdleTimer()
      }
    }
  }

  const pressBackspace = () => {
    resetIdleTimer()
    setDigits((d) => d.slice(0, -1))
  }

  return (
    <div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-black/90 backdrop-blur-sm"
      onClick={(e) => {
        e.stopPropagation()
        resetIdleTimer()
      }}
    >
      <p className="text-lg text-white">{title}</p>

      <div className="flex gap-3">
        {Array.from({ length: pinLength }).map((_, i) => (
          <div
            key={i}
            className={`h-4 w-4 rounded-full border-2 ${
              i < digits.length ? 'border-purple-400 bg-purple-400' : 'border-zinc-600'
            }`}
          />
        ))}
      </div>

      {error && <p className="text-sm text-red-400">Incorrect PIN</p>}

      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => pressDigit(d)}
            className="h-16 w-16 rounded-full bg-zinc-800 text-2xl text-white active:bg-zinc-700"
          >
            {d}
          </button>
        ))}
        <div />
        <button
          type="button"
          onClick={() => pressDigit('0')}
          className="h-16 w-16 rounded-full bg-zinc-800 text-2xl text-white active:bg-zinc-700"
        >
          0
        </button>
        <button
          type="button"
          onClick={pressBackspace}
          className="h-16 w-16 rounded-full bg-zinc-800 text-lg text-white active:bg-zinc-700"
        >
          ⌫
        </button>
      </div>
    </div>
  )
}
