import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'

export interface SignaturePadHandle {
  clear: () => void
  isEmpty: () => boolean
  /** Signature as a PNG data URL, dark ink on white so it prints cleanly in the PDF. */
  toPng: () => string
}

/** Finger/stylus signature box for the sales tablet. */
export function SignaturePad({
  ref,
  onChange,
  className = 'h-48 w-full',
}: {
  ref?: Ref<SignaturePadHandle>
  onChange?: (empty: boolean) => void
  /** Size of the box; a smaller one suits initials. */
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const hasInk = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)

  const resetCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    // Match the backing store to the displayed size (× DPR) so strokes stay sharp.
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111827'
    hasInk.current = false
    onChange?.(true)
  }

  useEffect(() => {
    resetCanvas()
  }, [])

  useImperativeHandle(ref, () => ({
    clear: resetCanvas,
    isEmpty: () => !hasInk.current,
    toPng: () => canvasRef.current!.toDataURL('image/png'),
  }))

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const handleDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = point(e)
    // A single tap still leaves a dot.
    const ctx = e.currentTarget.getContext('2d')!
    ctx.beginPath()
    ctx.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2)
    ctx.fillStyle = '#111827'
    ctx.fill()
    if (!hasInk.current) {
      hasInk.current = true
      onChange?.(false)
    }
  }

  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return
    const p = point(e)
    const ctx = e.currentTarget.getContext('2d')!
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
  }

  const handleUp = () => {
    drawing.current = false
    last.current = null
  }

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      className={`${className} cursor-crosshair rounded-lg border-2 border-dashed border-zinc-600 bg-white`}
      style={{ touchAction: 'none' }}
    />
  )
}
