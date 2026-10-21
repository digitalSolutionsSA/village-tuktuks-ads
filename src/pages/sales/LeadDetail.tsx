import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { LEAD_STATUS_STYLES } from '../../components/StatCard'
import { useAuth } from '../../context/AuthContext'
import { ADVERTISING_AREAS } from '../../lib/agreementText'
import {
  addLeadEvent,
  createLead,
  deleteLead,
  emptyLeadInput,
  getLead,
  leadToInput,
  listLeadEvents,
  reassignLead,
  updateLead,
  type LeadInput,
} from '../../lib/salesApi'
import { listStaff, staffName } from '../../lib/staffApi'
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  type Lead,
  type LeadEvent,
  type LeadEventKind,
  type Profile,
} from '../../types'

const inputClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-3 text-base text-white outline-none focus:border-purple-400'

const EVENT_ICONS: Record<LeadEventKind, string> = { note: '📝', call: '📞', visit: '🤝', status: '↻', signed: '✅' }

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-zinc-300">
        {label}
        {required && <span className="text-purple-400"> *</span>}
      </span>
      {children}
    </label>
  )
}

/** Create (/leads/new) or view + work a lead (/leads/:id), in either portal. */
export function LeadDetail() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const { profile } = useAuth()
  const inSales = useLocation().pathname.startsWith('/sales')
  const base = inSales ? '/sales' : '/admin'
  const isAdmin = profile?.role === 'admin'

  const [lead, setLead] = useState<Lead | null>(null)
  const [form, setForm] = useState<LeadInput>(emptyLeadInput)
  const [events, setEvents] = useState<LeadEvent[]>([])
  const [staff, setStaff] = useState<Profile[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [activity, setActivity] = useState<{ kind: LeadEventKind; body: string }>({ kind: 'call', body: '' })

  useEffect(() => {
    if (isAdmin) listStaff().then(setStaff).catch(() => {})
    if (isNew) return
    Promise.all([getLead(id!), listLeadEvents(id!)])
      .then(([l, ev]) => {
        if (!l) {
          setError('Lead not found.')
          return
        }
        setLead(l)
        setForm(leadToInput(l))
        setEvents(ev)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load lead.'))
      .finally(() => setLoading(false))
  }, [id, isNew, isAdmin])

  const staffById = useMemo(() => new Map(staff.map((p) => [p.id, p])), [staff])
  const set = <K extends keyof LeadInput>(k: K, v: LeadInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  const reloadEvents = async (leadId: string) => setEvents(await listLeadEvents(leadId))

  const save = async () => {
    setError(null)
    setNotice(null)
    setSaving(true)
    try {
      if (isNew) {
        const created = await createLead(form)
        navigate(`${base}/leads/${created.id}`, { replace: true })
        return
      }
      const updated = await updateLead(lead!, form)
      setLead(updated)
      await reloadEvents(updated.id)
      setNotice('Saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save lead.')
    } finally {
      setSaving(false)
    }
  }

  const logActivity = async () => {
    if (!lead || !activity.body.trim()) return
    setError(null)
    try {
      await addLeadEvent(lead.id, activity.kind, activity.body)
      setActivity((a) => ({ ...a, body: '' }))
      await reloadEvents(lead.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log activity.')
    }
  }

  const reassign = async (ownerId: string) => {
    if (!lead) return
    try {
      await reassignLead(lead.id, ownerId)
      setLead({ ...lead, owner_id: ownerId })
      await addLeadEvent(lead.id, 'note', `Reassigned to ${staffName(staffById.get(ownerId))}`)
      await reloadEvents(lead.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reassign.')
    }
  }

  const remove = async () => {
    if (!lead || !confirm(`Delete the lead "${lead.business_name}"? This can't be undone.`)) return
    try {
      await deleteLead(lead.id)
      navigate(`${base}/leads`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete lead.')
    }
  }

  if (loading) return <p className="text-zinc-500">Loading…</p>
  if (!isNew && !lead) return <p className="text-sm text-red-400">{error ?? 'Lead not found.'}</p>

  const signed = lead?.status === 'won' && lead.client_id

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to={`${base}/leads`} className="text-sm text-zinc-400 hover:text-white">
            ← Leads
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-white">{isNew ? 'New lead' : lead!.business_name}</h1>
          {lead && (
            <p className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
              <span className={`rounded-full px-2 py-0.5 font-medium ${LEAD_STATUS_STYLES[lead.status]}`}>
                {LEAD_STATUS_LABELS[lead.status]}
              </span>
              Added {new Date(lead.created_at).toLocaleDateString('en-ZA')}
            </p>
          )}
        </div>
        {lead && !signed && (
          <div className="flex flex-wrap gap-2">
          <Link
            to={`/sales/projection?lead=${lead.id}`}
            className="rounded-lg border border-zinc-700 px-5 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
          >
            📈 Show projection
          </Link>
          <Link
            to={`${base}/signup?lead=${lead.id}`}
            className="rounded-lg bg-green-600 px-5 py-3 text-sm font-medium text-white hover:bg-green-500"
          >
            ✎ Sign contract now
          </Link>
          </div>
        )}
        {signed && (
          <span className="rounded-lg border border-green-700 px-4 py-2 text-sm text-green-300">✓ Contract signed</span>
        )}
      </div>

      {isAdmin && !inSales && lead && staff.length > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm">
          <span className="text-zinc-400">Sales rep</span>
          <select
            value={lead.owner_id ?? ''}
            onChange={(e) => reassign(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
          >
            {!lead.owner_id && <option value="">Unassigned</option>}
            {staff.map((p) => (
              <option key={p.id} value={p.id}>
                {staffName(p)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Business name" required>
            <input className={inputClass} value={form.business_name} onChange={(e) => set('business_name', e.target.value)} />
          </Field>
        </div>
        <Field label="Contact person">
          <input className={inputClass} value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} />
        </Field>
        <Field label="Phone">
          <input type="tel" inputMode="tel" className={inputClass} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Email">
          <input type="email" inputMode="email" className={inputClass} value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Area">
          <input list="lead-areas" className={inputClass} value={form.area} onChange={(e) => set('area', e.target.value)} />
          <datalist id="lead-areas">
            {ADVERTISING_AREAS.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Address">
            <input className={inputClass} value={form.address} onChange={(e) => set('address', e.target.value)} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Status">
            <div className="flex flex-wrap gap-2">
              {LEAD_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set('status', s)}
                  className={`rounded-lg border px-3 py-2.5 text-sm ${
                    form.status === s ? 'border-purple-400 bg-purple-500/20 text-white' : 'border-zinc-700 text-zinc-300'
                  }`}
                >
                  {LEAD_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <Field label="Follow-up date">
          <input type="date" className={inputClass} value={form.follow_up_date} onChange={(e) => set('follow_up_date', e.target.value)} />
        </Field>
        <Field label="Estimated monthly value (R)">
          <input inputMode="decimal" className={inputClass} value={form.estimated_value} onChange={(e) => set('estimated_value', e.target.value.replace(/[^\d.,\s]/g, ''))} />
        </Field>
        <Field label="Source">
          <input className={inputClass} placeholder="e.g. Walk-in, referral, cold call" value={form.source} onChange={(e) => set('source', e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Notes">
            <textarea rows={3} className={inputClass} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      {notice && <p className="mt-4 text-sm text-green-400">{notice}</p>}

      <div className="mt-5 flex flex-wrap justify-between gap-3">
        {lead ? (
          <button onClick={remove} className="rounded-lg px-4 py-3 text-sm text-red-400 hover:bg-red-950/40">
            Delete lead
          </button>
        ) : (
          <span />
        )}
        <button
          onClick={save}
          disabled={saving || !form.business_name.trim()}
          className="rounded-lg bg-purple-500 px-6 py-3 font-medium text-white hover:bg-purple-400 disabled:opacity-50"
        >
          {saving ? 'Saving…' : isNew ? 'Add lead' : 'Save changes'}
        </button>
      </div>

      {lead && (
        <section className="mt-8">
          <h2 className="mb-3 font-medium text-white">Activity</h2>
          <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <div className="mb-2 flex gap-2">
              {(['call', 'visit', 'note'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setActivity((a) => ({ ...a, kind: k }))}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    activity.kind === k ? 'border-purple-400 bg-purple-500/20 text-white' : 'border-zinc-700 text-zinc-400'
                  }`}
                >
                  {EVENT_ICONS[k]} {k === 'call' ? 'Call' : k === 'visit' ? 'Visit' : 'Note'}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={activity.body}
                onChange={(e) => setActivity((a) => ({ ...a, body: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && logActivity()}
                placeholder="What happened? e.g. Met the owner, wants a quote for Meyerton"
                className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-purple-400"
              />
              <button
                onClick={logActivity}
                disabled={!activity.body.trim()}
                className="rounded-lg border border-zinc-700 px-4 py-2.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
              >
                Log
              </button>
            </div>
          </div>
          {events.length === 0 ? (
            <p className="text-sm text-zinc-500">No activity yet.</p>
          ) : (
            <ol className="space-y-2">
              {events.map((ev) => (
                <li key={ev.id} className="flex gap-3 text-sm">
                  <span aria-hidden>{EVENT_ICONS[ev.kind]}</span>
                  <div>
                    <p className="text-zinc-200">{ev.body}</p>
                    <p className="text-xs text-zinc-500">
                      {new Date(ev.created_at).toLocaleString('en-ZA')}
                      {staffById.size > 0 && ev.user_id && ` · ${staffName(staffById.get(ev.user_id))}`}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  )
}
