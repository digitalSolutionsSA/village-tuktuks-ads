import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  createMarqueeMessage,
  deleteMarqueeMessage,
  listAllMarquee,
  setMarqueeActive,
} from '../../lib/marqueeApi'
import { listTuktuks } from '../../lib/tuktuksApi'
import { useAuth } from '../../context/AuthContext'
import { tuktukName, type MarqueeMessage, type Tuktuk } from '../../types'

export function Marquee() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [messages, setMessages] = useState<MarqueeMessage[]>([])
  const [tuktuks, setTuktuks] = useState<Tuktuk[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [advertiserName, setAdvertiserName] = useState('')
  const [message, setMessage] = useState('')
  const [target, setTarget] = useState<'all' | number>('all')
  const [file, setFile] = useState<File | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [m, t] = await Promise.all([listAllMarquee(), listTuktuks()])
      setMessages(m)
      setTuktuks(t)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load marquee messages.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return
    setError(null)
    setSaving(true)
    try {
      await createMarqueeMessage({
        tuktukId: target === 'all' ? null : target,
        advertiserName,
        message: message.trim(),
        file,
      })
      setAdvertiserName('')
      setMessage('')
      setTarget('all')
      setFile(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add marquee message.')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (m: MarqueeMessage) => {
    setError(null)
    try {
      await setMarqueeActive(m.id, !m.is_active)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update message.')
    }
  }

  const handleDelete = async (m: MarqueeMessage) => {
    if (!confirm('Remove this marquee message?')) return
    setError(null)
    try {
      await deleteMarqueeMessage(m.id, m.media_path)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove message.')
    }
  }

  const labelFor = (tuktukId: number | null) => {
    if (tuktukId === null) return 'Whole fleet'
    const t = tuktuks.find((x) => x.id === tuktukId)
    return t ? tuktukName(t) : `Tuk-Tuk #${tuktukId}`
  }

  if (loading) return <p className="text-zinc-500">Loading…</p>

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold text-white">Marquee</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Scrolling text shown along the top of every player screen. Target the whole fleet or one
        specific tuk-tuk — customers upload artwork/copy to you, you post it here.
      </p>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {isAdmin && (
        <form
          onSubmit={handleSubmit}
          className="mb-8 space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4"
        >
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">
              Advertiser / customer name (optional)
            </label>
            <input
              value={advertiserName}
              onChange={(e) => setAdvertiserName(e.target.value)}
              placeholder="e.g. Baobab Backpackers"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-purple-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">Message</label>
            <input
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. 10% off with code TUKTUK10"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-purple-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">
              Logo / image (optional)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block text-sm text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-sm file:text-white hover:file:bg-zinc-700"
            />
            <p className="mt-1 text-xs text-zinc-500">
              This is the actual ad shown on the tuk-tuk screens — upload real banner artwork,
              recommended 2000×200px. It's shown as-is (no cropping); the message text above is
              only shown as a fallback until artwork is uploaded.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">Show on</label>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="w-full max-w-xs rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-purple-400"
            >
              <option value="all">Whole fleet</option>
              {tuktuks.map((t) => (
                <option key={t.id} value={t.id}>
                  {tuktukName(t)} only
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white hover:bg-purple-400 disabled:opacity-50"
          >
            {saving ? 'Adding…' : 'Add message'}
          </button>
        </form>
      )}

      {messages.length === 0 ? (
        <p className="text-sm text-zinc-500">No marquee messages yet.</p>
      ) : (
        <div className="space-y-2">
          {messages.map((m) => (
            <div key={m.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  {m.media_url && (
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-black">
                      <img src={m.media_url} className="h-full w-full object-cover" alt="" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {m.advertiser_name ? `${m.advertiser_name}: ` : ''}
                      {m.message}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {labelFor(m.tuktuk_id)} · {m.is_active ? 'active' : 'paused'}
                    </p>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => handleToggle(m)}
                      className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                    >
                      {m.is_active ? 'Pause' : 'Activate'}
                    </button>
                    <button
                      onClick={() => handleDelete(m)}
                      className="rounded border border-red-900 px-2 py-1 text-xs text-red-400 hover:bg-red-950"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {messages.length > 0 && (
        <p className="mt-6 text-xs text-zinc-500">
          Per-tuk-tuk sidebar ads (each driver's own services) are managed from that tuk-tuk's{' '}
          <Link to="/admin/tuktuks" className="text-purple-300 hover:underline">
            detail page
          </Link>
          .
        </p>
      )}
    </div>
  )
}
