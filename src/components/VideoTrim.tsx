import { useRef, useState } from 'react'
import { VIDEO_MAX_SECONDS } from '../lib/adPackage'

const formatTime = (seconds: number) => {
  const s = Math.max(seconds, 0)
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`
}

/** Pick which 10 seconds of a longer video play on the tuk-tuks, with a preview of just that part. Key it by `src`. */
export function VideoTrim({ src, start, onChange }: { src: string; start: number; onChange: (start: number) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)

  const maxStart = duration ? Math.max(duration - VIDEO_MAX_SECONDS, 0) : 0
  const end = Math.min(start + VIDEO_MAX_SECONDS, duration ?? start + VIDEO_MAX_SECONDS)

  // Show the first frame of the chosen part whenever the start moves.
  const seekTo = (s: number) => {
    const v = videoRef.current
    if (!v) return
    v.pause()
    setPlaying(false)
    v.currentTime = s
  }

  const togglePreview = () => {
    const v = videoRef.current
    if (!v) return
    if (playing) return seekTo(start)
    v.currentTime = start
    v.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
  }

  return (
    <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
        <video
          ref={videoRef}
          src={src}
          className="h-full w-full object-contain"
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration
            setDuration(Number.isFinite(d) ? d : null)
            // A saved start past the end (e.g. the file was swapped) falls back to the latest allowed start.
            const clamped = Math.min(start, Math.max(d - VIDEO_MAX_SECONDS, 0))
            if (clamped !== start) onChange(Math.round(clamped * 10) / 10)
            e.currentTarget.currentTime = clamped
          }}
          onTimeUpdate={(e) => {
            if (playing && e.currentTarget.currentTime >= end) seekTo(start)
          }}
          onEnded={() => seekTo(start)}
        />
      </div>

      {duration === null ? (
        <p className="mt-2 text-xs text-zinc-500">Reading the video…</p>
      ) : duration <= VIDEO_MAX_SECONDS ? (
        <p className="mt-2 text-xs text-zinc-500">
          This video is {formatTime(duration)} long, so it plays in full.
        </p>
      ) : (
        <>
          <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
            <span>Choose which {VIDEO_MAX_SECONDS} seconds play</span>
            <span className="font-medium text-brand-200">
              {formatTime(start)} – {formatTime(end)} of {formatTime(duration)}
            </span>
          </div>
          {/* The highlighted band shows the chosen part of the whole video. */}
          <div className="relative mt-2 h-2 rounded-full bg-zinc-800">
            <div
              className="absolute inset-y-0 rounded-full bg-brand-500/60"
              style={{ left: `${(start / duration) * 100}%`, width: `${((end - start) / duration) * 100}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={maxStart}
            step={0.1}
            value={start}
            onChange={(e) => {
              const s = Number(e.target.value)
              onChange(s)
              seekTo(s)
            }}
            className="mt-2 w-full accent-brand-400"
            aria-label="Start of the part that plays"
          />
        </>
      )}

      {duration !== null && (
        <button
          type="button"
          onClick={togglePreview}
          className="mt-2 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          {playing ? '■ Stop preview' : `▶ Preview the ${duration > VIDEO_MAX_SECONDS ? 'chosen part' : 'video'}`}
        </button>
      )}
    </div>
  )
}
