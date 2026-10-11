// Emails a signed advertising agreement PDF to the client via Resend.
//
// Secrets (Supabase dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY        – from resend.com, with your sending domain verified
//   CONTRACT_FROM_EMAIL   – e.g. "Village Media <contracts@villagemedia.co.za>"
//   CONTRACT_BCC_EMAIL    – optional; Village Media's own copy of every contract
import { createClient } from 'npm:@supabase/supabase-js@2'
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const resendKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('CONTRACT_FROM_EMAIL')
  if (!resendKey || !from) {
    return json(503, { error: 'Email sending is not set up yet (RESEND_API_KEY / CONTRACT_FROM_EMAIL missing).' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData.user) return json(401, { error: 'Please sign in again.' })

  const { agreement_id } = await req.json().catch(() => ({}))
  if (typeof agreement_id !== 'string') return json(400, { error: 'agreement_id is required' })

  // Read as the caller so RLS decides whether they may see (and therefore send) this agreement.
  const asUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: agreement, error: agreementError } = await asUser
    .from('client_agreements')
    .select('id, pdf_path, signed_at, client:clients(legal_name, company_name, email)')
    .eq('id', agreement_id)
    .maybeSingle()
  if (agreementError) return json(500, { error: agreementError.message })
  if (!agreement?.pdf_path) return json(404, { error: 'Agreement not found.' })

  const client = agreement.client as unknown as { legal_name: string; company_name: string | null; email: string }
  const { data: file, error: fileError } = await admin.storage.from('signed-contracts').download(agreement.pdf_path)
  if (fileError || !file) return json(500, { error: 'Could not read the stored PDF.' })

  const party = client.company_name || client.legal_name
  const slug = party.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'client'
  const bcc = Deno.env.get('CONTRACT_BCC_EMAIL')

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [client.email],
      ...(bcc ? { bcc: [bcc] } : {}),
      subject: 'Your Village Media advertising agreement',
      html: `<p>Hi ${escapeHtml(client.legal_name)},</p>
<p>Thank you for advertising with Village Media. Attached is your signed Digital In-Vehicle Advertising Services Agreement for ${escapeHtml(party)}.</p>
<p>Please keep it for your records. If anything looks wrong, reply to this email or call us on 060 972 9534.</p>
<p>Village Media</p>`,
      attachments: [
        {
          filename: `Village-Media-Agreement-${slug}-${agreement.signed_at.slice(0, 10)}.pdf`,
          content: encodeBase64(new Uint8Array(await file.arrayBuffer())),
        },
      ],
    }),
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    return json(502, { error: `Email provider rejected the message: ${detail.message ?? res.status}` })
  }

  await admin.from('client_agreements').update({ emailed_at: new Date().toISOString() }).eq('id', agreement.id)
  return json(200, { ok: true })
})
