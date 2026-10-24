import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  assignCommissionStructure,
  deleteCommissionStructure,
  describeCommission,
  listCommissionStructures,
  saveCommissionStructure,
  type CommissionInput,
} from '../../lib/financeApi'
import { listStaff, staffName } from '../../lib/staffApi'
import type { CommissionStructure, Profile } from '../../types'

const inputClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-brand-400'

const emptyForm = (): CommissionInput => ({ name: '', kind: 'percent', rate: '', months: '1', notes: '', active: true })

/** Main admins: commission structures, and which one each sales person earns on. */
export function Commissions() {
  const [structures, setStructures] = useState<CommissionStructure[]>([])
  const [staff, setStaff] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null | 'new'>(null)
  const [form, setForm] = useState<CommissionInput>(emptyForm)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([listCommissionStructures(), listStaff()])
      setStructures(s)
      setStaff(p.filter((x) => x.active && !x.super_admin))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load commissions.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const open = (s: CommissionStructure | null) => {
    setError(null)
    setNotice(null)
    setEditing(s ? s.id : 'new')
    setForm(
      s
        ? { name: s.name, kind: s.kind, rate: String(s.rate), months: String(s.months), notes: s.notes ?? '', active: s.active }
        : emptyForm(),
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await saveCommissionStructure(editing === 'new' ? null : editing, form)
      setNotice(editing === 'new' ? 'Commission structure added.' : 'Saved. Contracts already signed keep the terms they were signed on.')
      setEditing(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (s: CommissionStructure) => {
    if (!confirm(`Delete "${s.name}"? Sales people on it will have no commission structure. Contracts already signed keep their terms.`)) return
    try {
      await deleteCommissionStructure(s.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete.')
    }
  }

  const assign = async (p: Profile, structureId: string) => {
    setError(null)
    try {
      await assignCommissionStructure(p.id, structureId || null)
      setStaff((list) => list.map((x) => (x.id === p.id ? { ...x, commission_structure_id: structureId || null } : x)))
      setNotice(`${staffName(p)} now earns on ${structures.find((s) => s.id === structureId)?.name ?? 'no structure'} for new contracts.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign.')
    }
  }

  const preview =
    form.rate && Number(form.rate.replace(',', '.')) >= 0
      ? describeCommission({ kind: form.kind, rate: Number(form.rate.replace(',', '.')), months: Number.parseInt(form.months, 10) || 1 })
      : null

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-white">Commissions</h1>
        <button onClick={() => open(null)} className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-on-accent hover:bg-brand-400">
          + New structure
        </button>
      </div>
      <p className="mb-6 text-sm text-zinc-400">
        A structure pays a percentage of each contract's monthly fee, or a flat amount, for a set number of months after
        signing. Each contract keeps the terms its sales person was on when it was signed.
      </p>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
      {notice && <p className="mb-4 text-sm text-green-400">{notice}</p>}

      {editing && (
        <form onSubmit={submit} className="mb-6 grid gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm text-zinc-300 sm:col-span-2">
            Name *
            <input required className={inputClass} placeholder="e.g. Standard rep" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="text-sm text-zinc-300">
            Type
            <select className={inputClass} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as CommissionInput['kind'] })}>
              <option value="percent">% of monthly fee</option>
              <option value="flat">Flat amount (R)</option>
            </select>
          </label>
          <label className="text-sm text-zinc-300">
            {form.kind === 'percent' ? 'Percentage *' : 'Amount (R) *'}
            <input required inputMode="decimal" className={inputClass} value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value.replace(/[^\d.,]/g, '') })} />
          </label>
          <label className="text-sm text-zinc-300">
            Paid for how many months
            <input inputMode="numeric" className={inputClass} value={form.months} onChange={(e) => setForm({ ...form, months: e.target.value.replace(/\D/g, '') })} />
          </label>
          <label className="text-sm text-zinc-300 sm:col-span-2 lg:col-span-2">
            Notes
            <input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 self-end pb-2.5 text-sm text-zinc-300">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Available to assign
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2 lg:col-span-4">
            <p className="text-sm text-zinc-400">{preview && `Pays: ${preview}.`}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-zinc-700 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800">
                Cancel
              </button>
              <button disabled={saving} className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-on-accent hover:bg-brand-400 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : (
        <>
          {structures.length === 0 ? (
            <p className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-400">
              No commission structures yet. Add one, then assign it to your sales people below.
            </p>
          ) : (
            <div className="mb-8 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {structures.map((s) => (
                <div key={s.id} className={`rounded-xl border border-zinc-800 bg-zinc-900 p-4 ${s.active ? '' : 'opacity-60'}`}>
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <p className="font-semibold text-white">{s.name}</p>
                    {!s.active && <span className="rounded bg-zinc-800 px-1.5 text-xs text-zinc-400">not assignable</span>}
                  </div>
                  <p className="text-sm text-zinc-300">{describeCommission(s)}</p>
                  {s.notes && <p className="mt-1 text-xs text-zinc-500">{s.notes}</p>}
                  <p className="mt-2 text-xs text-zinc-500">
                    {staff.filter((p) => p.commission_structure_id === s.id).length} sales people on it
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => open(s)} className="rounded border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
                      Edit
                    </button>
                    <button onClick={() => remove(s)} className="rounded border border-red-900/60 px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-950/40">
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <h2 className="mb-3 font-medium text-white">Who earns on what</h2>
          {staff.length === 0 ? (
            <p className="text-sm text-zinc-500">No sales people yet — add them under Sales team.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-800">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Sales person</th>
                    <th className="px-4 py-3">Commission structure</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {staff.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3 text-zinc-200">{staffName(p)}</td>
                      <td className="px-4 py-3">
                        <select className={`${inputClass} max-w-sm`} value={p.commission_structure_id ?? ''} onChange={(e) => assign(p, e.target.value)}>
                          <option value="">— No commission —</option>
                          {structures
                            .filter((s) => s.active || s.id === p.commission_structure_id)
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name} · {describeCommission(s)}
                              </option>
                            ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
