import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { emailAgreement, getAgreementPdfUrl, listAgreements } from '../../lib/clientsApi'
import { agreementFileName } from '../../lib/agreementPdf'
import { useAuth } from '../../context/AuthContext'
import { listStaff, staffName } from '../../lib/staffApi'
import type { ClientAgreementWithClient, Profile } from '../../types'

export function Clients() {
  const { profile } = useAuth()
  const inSales = useLocation().pathname.startsWith('/sales')
  const isAdmin = profile?.role === 'admin'
  const [staff, setStaff] = useState<Map<string, Profile>>(new Map())
  const [agreements, setAgreements] = useState<ClientAgreementWithClient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (isAdmin && !inSales) {
      listStaff()
        .then((list) => setStaff(new Map(list.map((p) => [p.id, p]))))
        .catch(() => {})
    }
    // In the sales portal, admins see their own clients like any rep would.
    listAgreements(inSales ? profile?.id : undefined)
      .then(setAgreements)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load clients.'))
      .finally(() => setLoading(false))
  }, [inSales, isAdmin, profile?.id])

  const openPdf = async (a: ClientAgreementWithClient, download: boolean) => {
    if (!a.pdf_path) return
    setError(null)
    setBusyId(a.id)
    // Open the tab synchronously (inside the tap) so mobile browsers don't block it as a popup.
    const tab = window.open('', '_blank')
    try {
      const name = agreementFileName(a.client.company_name || a.client.legal_name, new Date(a.signed_at))
      const url = await getAgreementPdfUrl(a.pdf_path, download ? name : undefined)
      if (tab) tab.location.href = url
      else window.location.href = url
    } catch (err) {
      tab?.close()
      setError(err instanceof Error ? err.message : 'Failed to open PDF.')
    } finally {
      setBusyId(null)
    }
  }

  const sendEmail = async (a: ClientAgreementWithClient) => {
    if (!confirm(`Email the signed agreement to ${a.client.email}?`)) return
    setError(null)
    setNotice(null)
    setBusyId(a.id)
    try {
      await emailAgreement(a.id)
      setAgreements((prev) =>
        prev.map((x) => (x.id === a.id ? { ...x, emailed_at: new Date().toISOString() } : x)),
      )
      setNotice(`Emailed to ${a.client.email}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send email.')
    } finally {
      setBusyId(null)
    }
  }

  const q = search.trim().toLowerCase()
  const shown = q
    ? agreements.filter((a) =>
        [a.client.company_name, a.client.legal_name, a.client.email, a.client.telephone]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q)),
      )
    : agreements

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-white">Clients</h1>
        <Link
          to={inSales ? '/sales/signup' : '/admin/clients/new'}
          className="rounded-lg bg-purple-500 px-5 py-3 text-sm font-medium text-white hover:bg-purple-400"
        >
          + New client
        </Link>
      </div>
      <p className="mb-6 text-sm text-zinc-400">
        {isAdmin && !inSales
          ? 'Every signed advertising agreement, from all sales staff.'
          : 'Clients you have signed up.'}
      </p>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
      {notice && <p className="mb-4 text-sm text-green-400">{notice}</p>}

      {agreements.length > 0 && (
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by company, name, email or phone"
          className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-purple-400"
        />
      )}

      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : agreements.length === 0 ? (
        <p className="text-sm text-zinc-500">No clients signed up yet.</p>
      ) : (
        <div className="space-y-2">
          {shown.map((a) => {
            const busy = busyId === a.id
            const areas = [...a.areas, ...(a.other_area ? [a.other_area] : [])].join(', ')
            return (
              <div key={a.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-white">{a.client.company_name || a.client.legal_name}</p>
                    <p className="text-sm text-zinc-400">
                      {a.client.legal_name} · {a.client.email}
                      {a.client.telephone && ` · ${a.client.telephone}`}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {a.monthly_fee !== null && `R ${Number(a.monthly_fee).toLocaleString('en-ZA')} /month · `}
                      {areas || 'No area'} · Signed {new Date(a.signed_at).toLocaleDateString('en-ZA')} by{' '}
                      {a.vm_signer_name}
                      {staff.size > 0 && a.created_by && ` (rep: ${staffName(staff.get(a.created_by))})`}
                      {a.emailed_at && ' · Emailed'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => openPdf(a, false)}
                      disabled={busy || !a.pdf_path}
                      className="rounded border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                    >
                      View PDF
                    </button>
                    <button
                      onClick={() => openPdf(a, true)}
                      disabled={busy || !a.pdf_path}
                      className="rounded border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                    >
                      Download
                    </button>
                    <button
                      onClick={() => sendEmail(a)}
                      disabled={busy || !a.pdf_path}
                      className="rounded border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {a.emailed_at ? 'Email again' : 'Email client'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
