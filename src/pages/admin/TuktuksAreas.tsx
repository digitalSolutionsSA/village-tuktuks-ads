import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { addTuktuk, listTuktuks, setTuktukGroup, setTuktukNickname } from '../../lib/tuktuksApi'
import { addGroup, listGroups, renameGroup } from '../../lib/groupsApi'
import { timeAgo } from '../../lib/staffApi'
import type { Tuktuk, TuktukGroup } from '../../types'

const ONLINE_THRESHOLD_MS = 3 * 60 * 1000
const inputClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-brand-400'

/** Main admins: add tuk-tuks, give them nicknames, and put them in areas (which ads are aimed at). */
export function TuktuksAreas() {
  const [tuktuks, setTuktuks] = useState<Tuktuk[]>([])
  const [areas, setAreas] = useState<TuktukGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [newArea, setNewArea] = useState('')
  const [nicknames, setNicknames] = useState<Record<number, string>>({})
  const [areaNames, setAreaNames] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    try {
      const [t, g] = await Promise.all([listTuktuks(), listGroups()])
      setTuktuks(t)
      setAreas(g)
      setNicknames(Object.fromEntries(t.map((x) => [x.id, x.nickname ?? ''])))
      setAreaNames(Object.fromEntries(g.map((x) => [x.id, x.name])))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the fleet.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const run = async (action: () => Promise<unknown>, done: string) => {
    setError(null)
    setNotice(null)
    try {
      await action()
      setNotice(done)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  const saveNickname = (t: Tuktuk) => {
    const value = (nicknames[t.id] ?? '').trim()
    if (value === (t.nickname ?? '')) return
    void run(() => setTuktukNickname(t.id, value || null), `${t.label} saved.`)
  }

  const saveAreaName = (g: TuktukGroup) => {
    const value = (areaNames[g.id] ?? '').trim()
    if (!value || value === g.name) return
    void run(() => renameGroup(g.id, value), 'Area renamed.')
  }

  const submitArea = (e: FormEvent) => {
    e.preventDefault()
    if (!newArea.trim()) return
    void run(async () => {
      await addGroup(newArea.trim())
      setNewArea('')
    }, 'Area added.')
  }

  const online = (t: Tuktuk) => t.last_seen_at && Date.now() - new Date(t.last_seen_at).getTime() < ONLINE_THRESHOLD_MS

  if (loading) return <p className="text-zinc-500">Loading…</p>

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-white">Tuk-tuks & areas</h1>
        <button
          onClick={() => void run(async () => (await addTuktuk()).label, 'Tuk-tuk added. Open /player/<number> on its tablet once to link it.')}
          className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-on-accent hover:bg-brand-400"
        >
          + Add tuk-tuk
        </button>
      </div>
      <p className="mb-6 text-sm text-zinc-400">
        Every tuk-tuk belongs to an area. When sales people load an ad they choose areas, and the ad plays on every tuk-tuk
        in them — including ones you add to the area later.
      </p>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
      {notice && <p className="mb-4 text-sm text-green-400">{notice}</p>}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section>
          <h2 className="mb-3 font-medium text-white">Tuk-tuks ({tuktuks.length})</h2>
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Tuk-tuk</th>
                  <th className="px-4 py-3">Nickname</th>
                  <th className="px-4 py-3">Area</th>
                  <th className="px-4 py-3">Screen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {tuktuks.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-2.5 font-medium text-zinc-200">{t.label}</td>
                    <td className="px-4 py-2.5">
                      <input
                        className={inputClass}
                        placeholder="e.g. owner's name"
                        value={nicknames[t.id] ?? ''}
                        onChange={(e) => setNicknames({ ...nicknames, [t.id]: e.target.value })}
                        onBlur={() => saveNickname(t)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        className={inputClass}
                        value={t.group_id ?? ''}
                        onChange={(e) => void run(() => setTuktukGroup(t.id, e.target.value || null), `${t.label} moved.`)}
                      >
                        <option value="">— No area —</option>
                        {areas.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {online(t) ? (
                        <span className="flex items-center gap-1.5 text-green-400">
                          <span className="h-2 w-2 rounded-full bg-green-500" /> Online
                        </span>
                      ) : (
                        <span className="text-zinc-500">{t.last_seen_at ? `Seen ${timeAgo(t.last_seen_at)}` : 'Never connected'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-medium text-white">Areas ({areas.length})</h2>
          <form onSubmit={submitArea} className="mb-3 flex gap-2">
            <input className={inputClass} placeholder="New area, e.g. Meyerton" value={newArea} onChange={(e) => setNewArea(e.target.value)} />
            <button className="shrink-0 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-on-accent hover:bg-brand-400">+ Add</button>
          </form>
          {areas.length === 0 ? (
            <p className="text-sm text-zinc-500">No areas yet. Add one, then put tuk-tuks in it.</p>
          ) : (
            <div className="space-y-2">
              {areas.map((g) => (
                <div key={g.id} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3">
                  <input
                    className={inputClass}
                    value={areaNames[g.id] ?? ''}
                    onChange={(e) => setAreaNames({ ...areaNames, [g.id]: e.target.value })}
                    onBlur={() => saveAreaName(g)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  />
                  <span className="shrink-0 text-xs text-zinc-500">{tuktuks.filter((t) => t.group_id === g.id).length} tuk-tuks</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
