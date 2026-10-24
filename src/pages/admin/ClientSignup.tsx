import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { SignaturePad, type SignaturePadHandle } from '../../components/SignaturePad'
import {
  ADVERTISING_AREAS,
  AGREEMENT_IS_DRAFT,
  DEFAULT_AD_DURATION,
  INITIAL_TERM,
  SIGNATURE_DECLARATION,
  TERM_OPTIONS,
  VAT_OPTIONS,
  VILLAGE_MEDIA,
  agreementSectionsFor,
} from '../../lib/agreementText'
import { createSignedAgreement, downloadBlob, emailAgreement } from '../../lib/clientsApi'
import type { AgreementPdfInput } from '../../lib/agreementPdf'
import { formatRand, getLead, listPackages } from '../../lib/salesApi'
import type { Lead, SalesPackage } from '../../types'

type ClientDetails = AgreementPdfInput['client']
type Schedule = AgreementPdfInput['schedule']

const STEPS = ['Client details', 'Campaign', 'Terms', 'Client signs', 'Village Media signs'] as const

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const emptyClient = (): ClientDetails => ({
  legal_name: '',
  company_name: '',
  registration_no: '',
  physical_address: '',
  email: '',
  telephone: '',
  authorised_rep: '',
})

const emptySchedule = (): Schedule => ({
  effective_date: today(),
  areas: [],
  other_area: '',
  monthly_fee: '',
  vat: '',
  campaign_start: '',
  initial_term: INITIAL_TERM,
  package_notes: '',
})

const inputClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-3 text-base text-white outline-none focus:border-brand-400'

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-zinc-300">
        {label}
        {required && <span className="text-brand-400"> *</span>}
      </span>
      {children}
    </label>
  )
}

export function ClientSignup() {
  const { profile } = useAuth()
  // Shared by both portals; links stay inside whichever one we're in.
  const base = '/admin'
  const [params] = useSearchParams()
  const [lead, setLead] = useState<Lead | null>(null)
  const [packages, setPackages] = useState<SalesPackage[]>([])
  const [packageId, setPackageId] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const [client, setClient] = useState<ClientDetails>(emptyClient)
  const [schedule, setSchedule] = useState<Schedule>(emptySchedule)
  const [agreed, setAgreed] = useState(false)
  const [clientSigner, setClientSigner] = useState({ name: '', company: '', capacity: '' })
  const [vmSigner, setVmSigner] = useState({ name: profile?.display_name ?? '', capacity: 'Sales Representative' })
  const [clientSig, setClientSig] = useState('')
  const [padEmpty, setPadEmpty] = useState(true)
  const padRef = useRef<SignaturePadHandle>(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ agreementId: string; pdf: Blob; fileName: string } | null>(null)
  const [emailState, setEmailState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const [emailError, setEmailError] = useState<string | null>(null)

  const setC = (k: keyof ClientDetails, v: string) => setClient((c) => ({ ...c, [k]: v }))
  const setS = <K extends keyof Schedule>(k: K, v: Schedule[K]) => setSchedule((s) => ({ ...s, [k]: v }))

  const applyPackage = (p: SalesPackage) => {
    setPackageId(p.id)
    setSchedule((s) => ({
      ...s,
      areas: p.areas.length ? p.areas.filter((a) => (ADVERTISING_AREAS as readonly string[]).includes(a)) : s.areas,
      monthly_fee: p.monthly_fee !== null ? String(p.monthly_fee) : s.monthly_fee,
      package_notes: p.name + (p.description ? ` — ${p.description}` : ''),
    }))
  }

  // ?lead=<id> pre-fills the client from a lead; ?package=<id> pre-selects a package from the pitch.
  const leadParam = params.get('lead')
  const packageParam = params.get('package')
  useEffect(() => {
    listPackages()
      .then((list) => {
        setPackages(list)
        const p = packageParam && list.find((x) => x.id === packageParam)
        if (p) applyPackage(p)
      })
      .catch(() => {})
    if (!leadParam) return
    getLead(leadParam)
      .then((l) => {
        if (!l) return
        setLead(l)
        setClient((c) => ({
          ...c,
          legal_name: c.legal_name || l.business_name,
          company_name: c.company_name || l.business_name,
          email: c.email || l.email || '',
          telephone: c.telephone || l.phone || '',
          physical_address: c.physical_address || l.address || '',
          authorised_rep: c.authorised_rep || l.contact_name || '',
        }))
        const area = ADVERTISING_AREAS.find((a) => a.toLowerCase() === l.area?.toLowerCase())
        if (area) setSchedule((s) => (s.areas.length ? s : { ...s, areas: [area] }))
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadParam, packageParam])

  const emailValid = /^\S+@\S+\.\S+$/.test(client.email.trim())
  const canContinue = [
    Boolean(client.legal_name.trim() && emailValid && client.telephone.trim()),
    Boolean(
      (schedule.areas.length || schedule.other_area.trim()) &&
        schedule.monthly_fee.trim() &&
        schedule.vat &&
        schedule.campaign_start,
    ),
    agreed,
    Boolean(clientSigner.name.trim() && !padEmpty),
    Boolean(vmSigner.name.trim() && !padEmpty),
  ][step]

  const sendEmail = async (agreementId: string) => {
    setEmailState('sending')
    setEmailError(null)
    try {
      await emailAgreement(agreementId)
      setEmailState('sent')
    } catch (err) {
      setEmailState('failed')
      setEmailError(err instanceof Error ? err.message : 'Failed to send email.')
    }
  }

  const next = async () => {
    setError(null)
    if (step === 1 && !clientSigner.name) {
      // Pre-fill the client signature block from the details already captured.
      setClientSigner((s) => ({
        ...s,
        name: client.authorised_rep || client.legal_name,
        company: client.company_name,
      }))
    }
    if (step === 3) {
      setClientSig(padRef.current!.toPng())
    }
    if (step < STEPS.length - 1) {
      setStep(step + 1)
      setPadEmpty(true)
      window.scrollTo(0, 0)
      return
    }

    // Final step — save everything.
    setSaving(true)
    try {
      const res = await createSignedAgreement({
        client,
        schedule,
        clientSigner: { ...clientSigner, signaturePng: clientSig },
        vmSigner: { ...vmSigner, signaturePng: padRef.current!.toPng() },
      }, lead?.id)
      setResult(res)
      downloadBlob(res.pdf, res.fileName)
      void sendEmail(res.agreementId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the agreement.')
    } finally {
      setSaving(false)
    }
  }

  const back = () => {
    setError(null)
    setStep(step - 1)
    setPadEmpty(true)
    if (step === 4) setClientSig('')
  }

  const restart = () => {
    setStep(0)
    setClient(emptyClient())
    setSchedule(emptySchedule())
    setAgreed(false)
    setClientSigner({ name: '', company: '', capacity: '' })
    setClientSig('')
    setLead(null)
    setPackageId(null)
    setResult(null)
    setEmailState('idle')
    setEmailError(null)
    setError(null)
  }

  if (result) {
    return (
      <div className="mx-auto max-w-xl text-center">
        <div className="mb-4 text-5xl">✓</div>
        <h1 className="mb-2 text-2xl font-semibold text-white">Agreement signed</h1>
        <p className="mb-6 text-zinc-400">
          {client.company_name || client.legal_name} is signed up. The PDF has been downloaded and saved to
          the system.
        </p>
        <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm">
          {emailState === 'sending' && <p className="text-zinc-300">Emailing a copy to {client.email}…</p>}
          {emailState === 'sent' && <p className="text-green-400">A copy was emailed to {client.email}.</p>}
          {emailState === 'failed' && (
            <>
              <p className="mb-2 text-amber-300">Couldn't email the PDF: {emailError}</p>
              <button
                onClick={() => sendEmail(result.agreementId)}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-zinc-200 hover:bg-zinc-800"
              >
                Try again
              </button>
            </>
          )}
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={() => downloadBlob(result.pdf, result.fileName)}
            className="rounded-lg border border-zinc-700 px-4 py-3 text-zinc-200 hover:bg-zinc-800"
          >
            Download PDF again
          </button>
          <button
            onClick={restart}
            className="rounded-lg bg-brand-500 px-4 py-3 font-medium text-on-accent hover:bg-brand-400"
          >
            Sign up another client
          </button>
          <Link to={`${base}/clients`} className="rounded-lg px-4 py-3 text-zinc-400 hover:text-white">
            All clients
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">New client</h1>
        <Link to={lead ? `${base}/leads/${lead.id}` : `${base}/clients`} className="text-sm text-zinc-400 hover:text-white">
          Cancel
        </Link>
      </div>
      {lead && (
        <p className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300">
          Signing lead <span className="font-medium text-white">{lead.business_name}</span> — it will be
          marked as signed once the contract is saved.
        </p>
      )}

      <ol className="mb-6 flex gap-1">
        {STEPS.map((label, i) => (
          <li key={label} className="flex-1">
            <div className={`h-1.5 rounded-full ${i <= step ? 'bg-brand-500' : 'bg-zinc-800'}`} />
            <span className={`mt-1 hidden text-xs sm:block ${i === step ? 'text-white' : 'text-zinc-500'}`}>
              {label}
            </span>
          </li>
        ))}
      </ol>

      {AGREEMENT_IS_DRAFT && (
        <p className="mb-4 rounded-lg border border-amber-900/50 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
          This agreement is still marked "Draft for attorney review — not for signature until legally
          reviewed".
        </p>
      )}

      {step === 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client / legal name" required>
            <input className={inputClass} value={client.legal_name} onChange={(e) => setC('legal_name', e.target.value)} />
          </Field>
          <Field label="Company name">
            <input className={inputClass} value={client.company_name} onChange={(e) => setC('company_name', e.target.value)} />
          </Field>
          <Field label="Registration no.">
            <input className={inputClass} value={client.registration_no} onChange={(e) => setC('registration_no', e.target.value)} />
          </Field>
          <Field label="Authorised representative">
            <input className={inputClass} value={client.authorised_rep} onChange={(e) => setC('authorised_rep', e.target.value)} />
          </Field>
          <Field label="Email" required>
            <input type="email" inputMode="email" className={inputClass} value={client.email} onChange={(e) => setC('email', e.target.value)} />
          </Field>
          <Field label="Telephone" required>
            <input type="tel" inputMode="tel" className={inputClass} value={client.telephone} onChange={(e) => setC('telephone', e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Physical address">
              <textarea rows={2} className={inputClass} value={client.physical_address} onChange={(e) => setC('physical_address', e.target.value)} />
            </Field>
          </div>
          <Field label="Effective date" required>
            <input type="date" className={inputClass} value={schedule.effective_date} onChange={(e) => setS('effective_date', e.target.value)} />
          </Field>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5">
          {packages.length > 0 && (
            <Field label="Package">
              <div className="grid gap-2 sm:grid-cols-2">
                {packages.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPackage(p)}
                    className={`rounded-lg border px-4 py-3 text-left text-sm ${
                      packageId === p.id ? 'border-brand-400 bg-brand-500/20 text-white' : 'border-zinc-700 text-zinc-300'
                    }`}
                  >
                    <span className="block font-medium">{p.name}</span>
                    <span className="text-xs text-zinc-400">{formatRand(p.monthly_fee)} /month</span>
                  </button>
                ))}
              </div>
            </Field>
          )}
          <Field label="Advertising area(s)" required>
            <div className="flex flex-wrap gap-2">
              {ADVERTISING_AREAS.map((area) => {
                const on = schedule.areas.includes(area)
                return (
                  <button
                    key={area}
                    type="button"
                    onClick={() =>
                      setS('areas', on ? schedule.areas.filter((a) => a !== area) : [...schedule.areas, area])
                    }
                    className={`rounded-lg border px-4 py-3 text-sm ${
                      on ? 'border-brand-400 bg-brand-500/20 text-white' : 'border-zinc-700 text-zinc-300'
                    }`}
                  >
                    {on ? '✓ ' : ''}
                    {area}
                  </button>
                )
              })}
            </div>
          </Field>
          <Field label="Other area">
            <input className={inputClass} placeholder="Leave empty if none" value={schedule.other_area} onChange={(e) => setS('other_area', e.target.value)} />
          </Field>
          <p className="text-sm text-zinc-400">
            Digital ad duration: <span className="text-zinc-200">{DEFAULT_AD_DURATION}</span>
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Monthly fee (R)" required>
              <input inputMode="decimal" className={inputClass} placeholder="e.g. 1500" value={schedule.monthly_fee} onChange={(e) => setS('monthly_fee', e.target.value.replace(/[^\d.,\s]/g, ''))} />
            </Field>
            <Field label="VAT" required>
              <div className="flex gap-2">
                {VAT_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setS('vat', o.value)}
                    className={`flex-1 rounded-lg border px-2 py-3 text-sm ${
                      schedule.vat === o.value ? 'border-brand-400 bg-brand-500/20 text-white' : 'border-zinc-700 text-zinc-300'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Campaign start date" required>
              <input type="date" className={inputClass} value={schedule.campaign_start} onChange={(e) => setS('campaign_start', e.target.value)} />
            </Field>
            <Field label="Initial term" required>
              <div className="flex gap-2">
                {TERM_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setS('initial_term', o.value)}
                    className={`flex-1 rounded-lg border px-2 py-3 text-sm ${
                      schedule.initial_term === o.value ? 'border-brand-400 bg-brand-500/20 text-white' : 'border-zinc-700 text-zinc-300'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </Field>
          </div>
          <Field label="Selected package / notes">
            <textarea rows={3} className={inputClass} value={schedule.package_notes} onChange={(e) => setS('package_notes', e.target.value)} />
          </Field>
        </div>
      )}

      {step === 2 && (
        <div>
          <p className="mb-3 text-sm text-zinc-400">Hand the tablet to the client to read the terms.</p>
          <div className="mb-4 max-h-[55vh] overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm leading-relaxed text-zinc-300">
            {agreementSectionsFor(schedule.initial_term).map((section) => (
              <section key={section.title} className="mb-4">
                <h3 className="mb-1 font-semibold text-white">{section.title}</h3>
                {section.clauses.map((c) => (
                  <p key={c} className="mb-1.5">
                    {c}
                  </p>
                ))}
              </section>
            ))}
          </div>
          <label className="flex items-start gap-3 rounded-lg border border-zinc-800 p-4">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-brand-500" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span className="text-sm text-zinc-200">
              I have read and accept these terms and the Campaign Schedule on behalf of{' '}
              {client.company_name || client.legal_name}.
            </span>
          </label>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">{SIGNATURE_DECLARATION}</p>
          <h2 className="font-medium text-white">For the Client</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Name" required>
              <input className={inputClass} value={clientSigner.name} onChange={(e) => setClientSigner((s) => ({ ...s, name: e.target.value }))} />
            </Field>
            <Field label="Company">
              <input className={inputClass} value={clientSigner.company} onChange={(e) => setClientSigner((s) => ({ ...s, company: e.target.value }))} />
            </Field>
            <Field label="Capacity">
              <input className={inputClass} placeholder="e.g. Owner, Director" value={clientSigner.capacity} onChange={(e) => setClientSigner((s) => ({ ...s, capacity: e.target.value }))} />
            </Field>
          </div>
          <SignatureField key="client" padRef={padRef} onChange={setPadEmpty} />
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">Hand the tablet back to sign for {VILLAGE_MEDIA.name}.</p>
          <h2 className="font-medium text-white">For {VILLAGE_MEDIA.name}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required>
              <input className={inputClass} value={vmSigner.name} onChange={(e) => setVmSigner((s) => ({ ...s, name: e.target.value }))} />
            </Field>
            <Field label="Capacity">
              <input className={inputClass} value={vmSigner.capacity} onChange={(e) => setVmSigner((s) => ({ ...s, capacity: e.target.value }))} />
            </Field>
          </div>
          <SignatureField key="vm" padRef={padRef} onChange={setPadEmpty} />
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      <div className="mt-6 flex justify-between gap-3">
        <button
          onClick={back}
          disabled={step === 0 || saving}
          className="rounded-lg border border-zinc-700 px-5 py-3 text-zinc-200 hover:bg-zinc-800 disabled:invisible"
        >
          Back
        </button>
        <button
          onClick={next}
          disabled={!canContinue || saving}
          className="rounded-lg bg-brand-500 px-6 py-3 font-medium text-on-accent hover:bg-brand-400 disabled:opacity-50"
        >
          {step === STEPS.length - 1 ? (saving ? 'Saving…' : 'Sign & save agreement') : step === 2 ? 'Accept & continue' : 'Next'}
        </button>
      </div>
    </div>
  )
}

function SignatureField({
  padRef,
  onChange,
}: {
  padRef: React.RefObject<SignaturePadHandle | null>
  onChange: (empty: boolean) => void
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm text-zinc-300">
          Sign below<span className="text-brand-400"> *</span>
        </span>
        <button type="button" onClick={() => padRef.current?.clear()} className="text-sm text-zinc-400 hover:text-white">
          Clear
        </button>
      </div>
      <SignaturePad ref={padRef} onChange={onChange} />
    </div>
  )
}
