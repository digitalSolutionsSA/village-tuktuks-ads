import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { addTuktuk, deleteTuktuk, listTuktuks, setTuktukGroup, setTuktukNickname, setTuktuksGroup } from '../../lib/tuktuksApi'
import { addGroup, deleteGroup, listGroups, renameGroup } from '../../lib/groupsApi'
import { timeAgo } from '../../lib/staffApi'
import type { Tuktuk, TuktukGroup } from '../../types'

const ONLINE_THRESHOLD_MS = 3 * 60 * 1000
const inputClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-brand-400'
const deleteClass = 'rounded-lg border border-red-900 px-3 py-1.5 text-xs text-red-400 hover:bg-red-950'

/** Main admins: add/delete tuk-tuks, give them nicknames, and put them in areas (which ads are aimed at). */
export function TuktuksAreas() {
  const [tuktuks, setTuktuks] = useState<Tuktuk[]>([])
  const [areas, setAreas] = useState<TuktukGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [newArea, setNewArea] = useState('')
  const [nicknames, setNicknames] = useState<Record<number, string>>({})
  const [areaNames, setAreaNames] = useState<Record<string, string>>({})
  /** The area whose tuk-tuk list is open, and the tuk-tuks ticked in it. */
  const [editingArea, setEditingArea] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())

  const load = useCallback(async () => {
    try {
      const [t, g] = await Promise.all([listTuktuks(), listGroups()])
      setTuktuks(t)
      setAreas(g)
      setNicknames(Object.fromEntries(t.map((x) => [x.id, x.nickname ?? ''])))
      setAreaNames(Object.fromEntries(g.map((x) => [x.id, x.name])))
      return t
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the fleet.')
      return null
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
    // Reload either way so the page always shows what is really saved.
    return load()
  }

  const areaName = (id: string | null) => areas.find((g) => g.id === id)?.name

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

  const openArea = (id: string, list: Tuktuk[] = tuktuks) => {
    setEditingArea(id)
    setPicked(new Set(list.filter((t) => t.group_id === id).map((t) => t.id)))
  }

  const submitArea = async (e: FormEvent) => {
    e.preventDefault()
    const name = newArea.trim()
    if (!name) return
    if (areas.some((g) => g.name.toLowerCase() === name.toLowerCase())) {
      setError(`There is already an area called "${name}".`)
      return
    }
    let created: TuktukGroup | null = null
    await run(async () => {
      created = await addGroup(name)
      setNewArea('')
    }, `Area "${name}" added. Tick the tuk-tuks that work there, then save.`)
    if (created) openArea((created as TuktukGroup).id, [])
  }

  const removeArea = (g: TuktukGroup) => {
    const count = tuktuks.filter((t) => t.group_id === g.id).length
    const msg =
      `Delete the area "${g.name}"?` +
      (count ? ` Its ${count} tuk-tuk${count === 1 ? '' : 's'} will have no area.` : '') +
      ' Ads aimed at this area will stop playing there.'
    if (!confirm(msg)) return
    if (editingArea === g.id) setEditingArea(null)
    void run(() => deleteGroup(g.id), `Area "${g.name}" deleted.`)
  }

  const removeTuktuk = (t: Tuktuk) => {
    if (!confirm(`Delete ${t.label}? Its screen stops getting ads. This can't be undone.`)) return
    void run(() => deleteTuktuk(t.id), `${t.label} deleted.`)
  }

  const toggleArea = (id: string) => {
    if (editingArea === id) setEditingArea(null)
    else openArea(id)
  }

  const togglePicked = (id: number) => {
    const next = new Set(picked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setPicked(next)
  }

  const saveAreaMembers = (g: TuktukGroup) => {
    const current = tuktuks.filter((t) => t.group_id === g.id).map((t) => t.id)
    const added = [...picked].filter((id) => !current.includes(id))
    const removed = current.filter((id) => !picked.has(id))
    if (!added.length && !removed.length) {
      setEditingArea(null)
      return
    }
    void run(async () => {
      await setTuktuksGroup(added, g.id)
      await setTuktuksGroup(removed, null)
      setEditingArea(null)
    }, `"${g.name}" now has ${picked.size} tuk-tuk${picked.size === 1 ? '' : 's'}.`)
  }

  const online = (t: Tuktuk) => t.last_seen_at && Date.now() - new Date(t.last_seen_at).getTime() < ONLINE_THRESHOLD_MS

  if (loading) return <p className="text-zinc-500">Loading…</p>

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-white">Tuk-tuks & areas</h1>
        <button
          onClick={() =>
            void run(async () => (await addTuktuk()).label, 'Tuk-tuk added. Open /player/<number> on its tablet once to link it.')
          }
          className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-on-accent hover:bg-brand-400"
        >
          + Add tuk-tuk
        </button>
      </div>
      <p className="mb-6 text-sm text-zinc-400">
        Every tuk-tuk belongs to an area. When sales people load an ad they choose areas, and the ad plays on every tuk-tuk
        in them — including ones you add to the area later. A tuk-tuk can be in one area at a time.
      </p>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
      {notice && <p className="mb-4 text-sm text-green-400">{notice}</p>}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section>
          <h2 className="mb-3 font-medium text-white">Tuk-tuks ({tuktuks.length})</h2>
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Tuk-tuk</th>
                  <th className="px-4 py-3">Nickname</th>
                  <th className="px-4 py-3">Area</th>
                  <th className="px-4 py-3">Screen</th>
                  <th className="px-4 py-3" />
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
                        onChange={(e) => {
                          const id = e.target.value || null
                          void run(() => setTuktukGroup(t.id, id), `${t.label} moved to ${areaName(id) ?? 'no area'}.`)
                        }}
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
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => removeTuktuk(t)} className={deleteClass}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-medium text-white">Areas ({areas.length})</h2>
          <form onSubmit={(e) => void submitArea(e)} className="mb-3 flex gap-2">
            <input className={inputClass} placeholder="New area, e.g. Meyerton" value={newArea} onChange={(e) => setNewArea(e.target.value)} />
            <button className="shrink-0 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-on-accent hover:bg-brand-400">+ Add</button>
          </form>
          {areas.length === 0 ? (
            <p className="text-sm text-zinc-500">No areas yet. Add one, then put tuk-tuks in it.</p>
          ) : (
            <div className="space-y-2">
              {areas.map((g) => {
                const count = tuktuks.filter((t) => t.group_id === g.id).length
                const open = editingArea === g.id
                return (
                  <div key={g.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
                    <div className="flex items-center gap-3">
                      <input
                        className={inputClass}
                        value={areaNames[g.id] ?? ''}
                        onChange={(e) => setAreaNames({ ...areaNames, [g.id]: e.target.value })}
                        onBlur={() => saveAreaName(g)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                      />
                      <span className="shrink-0 text-xs text-zinc-500">
                        {count} tuk-tuk{count === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => toggleArea(g.id)}
                        className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:border-brand-400"
                      >
                        {open ? 'Close' : 'Choose tuk-tuks'}
                      </button>
                      <button onClick={() => removeArea(g)} className={deleteClass}>
                        Delete area
                      </button>
                    </div>

                    {open && (
                      <div className="mt-3 border-t border-zinc-800 pt-3">
                        <div className="mb-2 flex gap-3 text-xs">
                          <button className="text-brand-300 hover:underline" onClick={() => setPicked(new Set(tuktuks.map((t) => t.id)))}>
                            Select all
                          </button>
                          <button className="text-brand-300 hover:underline" onClick={() => setPicked(new Set())}>
                            Clear
                          </button>
                        </div>
                        <div className="max-h-72 space-y-1 overflow-y-auto">
                          {tuktuks.map((t) => {
                            const elsewhere = t.group_id && t.group_id !== g.id ? areaName(t.group_id) : undefined
                            return (
                              <label
                                key={t.id}
                                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-zinc-200 hover:bg-zinc-800"
                              >
                                <input type="checkbox" checked={picked.has(t.id)} onChange={() => togglePicked(t.id)} />
                                <span>{t.nickname ? `${t.label} · ${t.nickname}` : t.label}</span>
                                {elsewhere && (
                                  <span className="ml-auto text-xs text-zinc-500">
                                    {picked.has(t.id) ? `moves from ${elsewhere}` : `in ${elsewhere}`}
                                  </span>
                                )}
                              </label>
                            )
                          })}
                        </div>
                        <button
                          onClick={() => saveAreaMembers(g)}
                          className="mt-3 w-full rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-on-accent hover:bg-brand-400"
                        >
                          Save {picked.size} tuk-tuk{picked.size === 1 ? '' : 's'} in {g.name}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
