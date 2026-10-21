import { useEffect, useState } from 'react'
import { ADVERTISING_AREAS } from '../../lib/agreementText'
import { deletePackage, formatRand, listPackages, savePackage, type PackageInput } from '../../lib/salesApi'
import type { SalesPackage } from '../../types'

const inputClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-purple-400'

const emptyInput = (sort = 0): PackageInput => ({
  name: '',
  description: '',
  monthly_fee: '',
  areas: [],
  features: [],
  sort_order: sort,
  active: true,
})

const toInput = (p: SalesPackage): PackageInput => ({
  name: p.name,
  description: p.description ?? '',
  monthly_fee: p.monthly_fee === null ? '' : String(p.monthly_fee),
  areas: p.areas,
  features: p.features,
  sort_order: p.sort_order,
  active: p.active,
})

/** Packages reps show in the pitch and pre-select on the contract. */
export function Packages() {
  const [packages, setPackages] = useState<SalesPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string | null; input: PackageInput } | null>(null)
  const [featuresText, setFeaturesText] = useState('')

  const load = () =>
    listPackages(true)
      .then(setPackages)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load packages.'))
      .finally(() => setLoading(false))

  useEffect(() => {
    void load()
  }, [])

  const open = (p: SalesPackage | null) => {
    const input = p ? toInput(p) : emptyInput(packages.length)
    setEditing({ id: p?.id ?? null, input })
    setFeaturesText(input.features.join('\n'))
  }

  const set = <K extends keyof PackageInput>(k: K, v: PackageInput[K]) =>
    setEditing((e) => (e ? { ...e, input: { ...e.input, [k]: v } } : e))

  const save = async () => {
    if (!editing) return
    setError(null)
    try {
      await savePackage(editing.id, { ...editing.input, features: featuresText.split('\n') })
      setEditing(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
    }
  }

  const remove = async (p: SalesPackage) => {
    if (!confirm(`Delete the "${p.name}" package? Signed contracts are not affected.`)) return
    try {
      await deletePackage(p.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete.')
    }
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-white">Packages</h1>
        <button onClick={() => open(null)} className="rounded-lg bg-purple-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-purple-400">
          + New package
        </button>
      </div>
      <p className="mb-6 text-sm text-zinc-400">
        Shown to customers on the sales team's pitch screen, and selectable when signing a contract (fills in the fee, areas
        and package notes).
      </p>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {editing && (
        <div className="mb-6 grid gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4 sm:grid-cols-2">
          <label className="text-sm text-zinc-300">
            Name *
            <input className={inputClass} placeholder="e.g. Local Starter" value={editing.input.name} onChange={(e) => set('name', e.target.value)} />
          </label>
          <label className="text-sm text-zinc-300">
            Monthly fee (R)
            <input inputMode="decimal" className={inputClass} value={editing.input.monthly_fee} onChange={(e) => set('monthly_fee', e.target.value)} />
          </label>
          <label className="text-sm text-zinc-300 sm:col-span-2">
            Short description
            <input className={inputClass} value={editing.input.description} onChange={(e) => set('description', e.target.value)} />
          </label>
          <div className="text-sm text-zinc-300 sm:col-span-2">
            Areas included
            <div className="mt-1 flex flex-wrap gap-2">
              {ADVERTISING_AREAS.map((a) => {
                const on = editing.input.areas.includes(a)
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => set('areas', on ? editing.input.areas.filter((x) => x !== a) : [...editing.input.areas, a])}
                    className={`rounded-lg border px-3 py-2 ${on ? 'border-purple-400 bg-purple-500/20 text-white' : 'border-zinc-700 text-zinc-400'}`}
                  >
                    {on ? '✓ ' : ''}
                    {a}
                  </button>
                )
              })}
            </div>
          </div>
          <label className="text-sm text-zinc-300 sm:col-span-2">
            What's included <span className="text-zinc-500">(one per line)</span>
            <textarea rows={4} className={inputClass} value={featuresText} onChange={(e) => setFeaturesText(e.target.value)} />
          </label>
          <label className="text-sm text-zinc-300">
            Display order
            <input inputMode="numeric" className={inputClass} value={editing.input.sort_order} onChange={(e) => set('sort_order', Number(e.target.value.replace(/\D/g, '')) || 0)} />
          </label>
          <label className="flex items-center gap-2 self-end text-sm text-zinc-300">
            <input type="checkbox" checked={editing.input.active} onChange={(e) => set('active', e.target.checked)} />
            Visible to the sales team
          </label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button onClick={() => setEditing(null)} className="rounded-lg border border-zinc-700 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!editing.input.name.trim()}
              className="rounded-lg bg-purple-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-purple-400 disabled:opacity-50"
            >
              Save package
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : packages.length === 0 ? (
        <p className="text-sm text-zinc-500">No packages yet. Without packages, the pitch screen tells customers to ask for a quote.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {packages.map((p) => (
            <div key={p.id} className={`rounded-xl border border-zinc-800 bg-zinc-900 p-4 ${p.active ? '' : 'opacity-50'}`}>
              <p className="font-medium text-white">{p.name}</p>
              <p className="text-lg text-purple-300">{formatRand(p.monthly_fee)} /month</p>
              {p.description && <p className="mt-1 text-sm text-zinc-400">{p.description}</p>}
              {p.areas.length > 0 && <p className="mt-1 text-xs text-zinc-500">📍 {p.areas.join(', ')}</p>}
              {!p.active && <p className="mt-1 text-xs text-zinc-500">Hidden from the sales team</p>}
              <div className="mt-3 flex gap-2">
                <button onClick={() => open(p)} className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
                  Edit
                </button>
                <button onClick={() => remove(p)} className="rounded px-3 py-1.5 text-xs text-red-400 hover:bg-red-950/40">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
