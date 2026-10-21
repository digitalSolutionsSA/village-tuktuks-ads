import { isSupabaseConfigured, supabase } from './supabase'
import { agreementFileName, buildAgreementPdf, type AgreementPdfInput } from './agreementPdf'
import { markLeadSigned } from './salesApi'
import type { Client, ClientAgreementWithClient } from '../types'

const DEMO_ERROR = 'Demo mode — connect Supabase (see README) to sign up real clients.'

/** Private bucket — signed contracts are only readable by their uploader and admins. */
export const CONTRACTS_BUCKET = 'signed-contracts'

const blank = (v: string) => v.trim() || null

export interface SignedAgreementResult {
  agreementId: string
  clientId: string
  pdf: Blob
  fileName: string
}

/**
 * Saves the client, generates + uploads the signed PDF, then records the agreement.
 * The agreement row is only written once its PDF is safely stored.
 */
export async function createSignedAgreement(
  input: Omit<AgreementPdfInput, 'agreementId' | 'signedAt'>,
  /** The lead being signed, if any — it is marked won and linked to the new client. */
  leadId?: string | null,
): Promise<SignedAgreementResult> {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) throw new Error('Your session has expired — please sign in again.')

  const { client, schedule, clientSigner, vmSigner } = input
  const { data: clientRow, error: clientError } = await supabase
    .from('clients')
    .insert({
      legal_name: client.legal_name.trim(),
      company_name: blank(client.company_name),
      registration_no: blank(client.registration_no),
      physical_address: blank(client.physical_address),
      email: client.email.trim(),
      telephone: blank(client.telephone),
      authorised_rep: blank(client.authorised_rep),
      created_by: uid,
    })
    .select()
    .single()
  if (clientError) throw clientError

  const agreementId = crypto.randomUUID()
  const signedAt = new Date()
  const pdf = await buildAgreementPdf({ ...input, agreementId, signedAt })
  const pdfPath = `${uid}/${agreementId}.pdf`
  const { error: uploadError } = await supabase.storage
    .from(CONTRACTS_BUCKET)
    .upload(pdfPath, pdf, { contentType: 'application/pdf' })
  if (uploadError) throw uploadError

  const fee = schedule.monthly_fee.replace(/[^\d.]/g, '')
  const { error: agreementError } = await supabase.from('client_agreements').insert({
    id: agreementId,
    client_id: (clientRow as Client).id,
    effective_date: schedule.effective_date,
    areas: schedule.areas,
    other_area: blank(schedule.other_area),
    monthly_fee: fee ? Number(fee) : null,
    vat: schedule.vat || null,
    campaign_start: schedule.campaign_start || null,
    initial_term: blank(schedule.initial_term),
    package_notes: blank(schedule.package_notes),
    client_signer_name: clientSigner.name.trim(),
    client_signer_company: blank(clientSigner.company),
    client_signer_capacity: blank(clientSigner.capacity),
    vm_signer_name: vmSigner.name.trim(),
    vm_signer_capacity: blank(vmSigner.capacity),
    signed_at: signedAt.toISOString(),
    pdf_path: pdfPath,
    lead_id: leadId ?? null,
    created_by: uid,
  })
  if (agreementError) throw agreementError

  const clientId = (clientRow as Client).id
  if (leadId) {
    // The contract is already saved — a failure here must not look like a failed signing.
    await markLeadSigned(leadId, clientId, client.company_name || client.legal_name).catch((err) =>
      console.error('[clients] failed to update lead', err),
    )
  }

  return {
    agreementId,
    clientId,
    pdf,
    fileName: agreementFileName(client.company_name || client.legal_name, signedAt),
  }
}

/** Admins see every agreement; sales staff only the ones they signed up (enforced by RLS). */
export async function listAgreements(createdBy?: string): Promise<ClientAgreementWithClient[]> {
  if (!isSupabaseConfigured) return []
  let q = supabase
    .from('client_agreements')
    .select('*, client:clients(*)')
    .order('signed_at', { ascending: false })
  if (createdBy) q = q.eq('created_by', createdBy)
  const { data, error } = await q
  if (error) throw error
  return (data as ClientAgreementWithClient[]) ?? []
}

/** Short-lived link to a stored contract PDF. */
export async function getAgreementPdfUrl(pdfPath: string, downloadName?: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(CONTRACTS_BUCKET)
    .createSignedUrl(pdfPath, 300, downloadName ? { download: downloadName } : undefined)
  if (error) throw error
  return data.signedUrl
}

/** Emails the stored PDF to the client via the send-contract edge function. */
export async function emailAgreement(agreementId: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error(DEMO_ERROR)
  const { data, error } = await supabase.functions.invoke('send-contract', {
    body: { agreement_id: agreementId },
  })
  if (error) {
    // Surface the function's own message (e.g. "email not configured") rather than a generic one.
    const ctx = (error as { context?: Response }).context
    const body = ctx ? await ctx.json().catch(() => null) : null
    throw new Error(body?.error ?? error.message)
  }
  if (data?.error) throw new Error(data.error)
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
