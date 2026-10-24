import type { jsPDF as JsPdf } from 'jspdf'
import {
  ADVERTISING_AREAS,
  AGREEMENT_IS_DRAFT,
  AGREEMENT_VERSION,
  DEFAULT_AD_DURATION,
  INITIAL_TERM,
  SIGNATURE_DECLARATION,
  VAT_OPTIONS,
  VILLAGE_MEDIA,
  agreementSectionsFor,
} from './agreementText'
import type { VatOption } from '../types'

export interface AgreementPdfInput {
  agreementId: string
  signedAt: Date
  client: {
    legal_name: string
    company_name: string
    registration_no: string
    physical_address: string
    email: string
    telephone: string
    authorised_rep: string
  }
  schedule: {
    effective_date: string
    areas: string[]
    other_area: string
    monthly_fee: string
    vat: VatOption | ''
    campaign_start: string
    initial_term: string
    package_notes: string
  }
  clientSigner: { name: string; company: string; capacity: string; signaturePng: string }
  vmSigner: { name: string; capacity: string; signaturePng: string }
}

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 18
const CONTENT_W = PAGE_W - MARGIN * 2
const LABEL_W = 55
const BLANK = '________________________________'

export function agreementFileName(companyOrName: string, signedAt: Date) {
  const slug = companyOrName.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'client'
  return `Village-Media-Agreement-${slug}-${signedAt.toISOString().slice(0, 10)}.pdf`
}

/** Builds the signed agreement PDF. jsPDF is loaded on demand so it stays out of the player bundle. */
export async function buildAgreementPdf(input: AgreementPdfInput): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = MARGIN

  const ensureSpace = (h: number) => {
    if (y + h > PAGE_H - MARGIN - 8) {
      doc.addPage()
      y = MARGIN
    }
  }

  const paragraph = (text: string, size = 9.5, style: 'normal' | 'bold' = 'normal', gap = 1.6) => {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    const lines = doc.splitTextToSize(text, CONTENT_W) as string[]
    const lh = size * 0.42
    for (const line of lines) {
      ensureSpace(lh)
      doc.text(line, MARGIN, y)
      y += lh
    }
    y += gap
  }

  const heading = (text: string) => {
    ensureSpace(12)
    y += 2
    paragraph(text, 11, 'bold', 1.2)
  }

  const row = (label: string, value: string) => {
    doc.setFontSize(9.5)
    doc.setFont('helvetica', 'normal')
    const lines = doc.splitTextToSize(value || BLANK, CONTENT_W - LABEL_W - 4) as string[]
    const h = Math.max(1, lines.length) * 4 + 3
    ensureSpace(h)
    doc.setDrawColor(200)
    doc.rect(MARGIN, y - 4, CONTENT_W, h)
    doc.setFont('helvetica', 'bold')
    doc.text(label, MARGIN + 2, y)
    doc.setFont('helvetica', 'normal')
    doc.text(lines, MARGIN + LABEL_W, y)
    y += h
  }

  const checkboxRow = (label: string, options: { label: string; checked: boolean }[]) => {
    doc.setFontSize(9.5)
    doc.setFont('helvetica', 'normal')
    // Lay options out left-to-right, wrapping onto extra lines when they run out of width.
    const startX = MARGIN + LABEL_W
    const maxX = MARGIN + CONTENT_W - 2
    const placed: { x: number; line: number; label: string; checked: boolean }[] = []
    let x = startX
    let line = 0
    for (const opt of options) {
      const text = doc.splitTextToSize(opt.label, maxX - startX - 5)[0] as string
      const w = 4.5 + doc.getTextWidth(text)
      if (x > startX && x + w > maxX) {
        x = startX
        line++
      }
      placed.push({ x, line, label: text, checked: opt.checked })
      x += w + 5
    }
    const h = (line + 1) * 5 + 2
    ensureSpace(h)
    doc.setDrawColor(200)
    doc.rect(MARGIN, y - 4, CONTENT_W, h)
    doc.setFont('helvetica', 'bold')
    doc.text(label, MARGIN + 2, y)
    doc.setFont('helvetica', 'normal')
    doc.setDrawColor(60)
    for (const p of placed) {
      const py = y + p.line * 5
      doc.rect(p.x, py - 3, 3, 3)
      if (p.checked) {
        doc.line(p.x + 0.5, py - 2.5, p.x + 2.5, py - 0.5)
        doc.line(p.x + 2.5, py - 2.5, p.x + 0.5, py - 0.5)
      }
      doc.text(p.label, p.x + 4.5, py)
    }
    y += h
  }

  const signatureBlock = (
    title: string,
    rows: [string, string][],
    signaturePng: string,
    date: string,
  ) => {
    ensureSpace(70)
    paragraph(title, 10, 'bold', 1)
    for (const [l, v] of rows) row(l, v)
    // Signature row: taller box with the drawn signature image
    const h = 26
    doc.setDrawColor(200)
    doc.rect(MARGIN, y - 4, CONTENT_W, h)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.text('Signature', MARGIN + 2, y)
    // Fit inside the box without stretching — the tablet pad is wider than it is tall.
    const props = doc.getImageProperties(signaturePng)
    const scale = Math.min((CONTENT_W - LABEL_W - 4) / props.width, 23 / props.height)
    doc.addImage(signaturePng, 'PNG', MARGIN + LABEL_W, y - 3, props.width * scale, props.height * scale)
    y += h
    row('Date', date)
    y += 4
  }

  // ---- Title ----
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('VILLAGE MEDIA', PAGE_W / 2, y + 2, { align: 'center' })
  y += 8
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('A VILLAGE TUK ADVERTISING NETWORK', PAGE_W / 2, y, { align: 'center' })
  y += 7
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('DIGITAL IN-VEHICLE ADVERTISING SERVICES AGREEMENT', PAGE_W / 2, y, { align: 'center' })
  y += 8

  if (AGREEMENT_IS_DRAFT) {
    doc.setFillColor(254, 243, 199)
    doc.rect(MARGIN, y - 4.5, CONTENT_W, 7, 'F')
    doc.setTextColor(146, 64, 14)
    doc.setFontSize(9)
    doc.text('DRAFT FOR ATTORNEY REVIEW - NOT FOR SIGNATURE UNTIL LEGALLY REVIEWED', PAGE_W / 2, y, {
      align: 'center',
    })
    doc.setTextColor(0)
    y += 8
  }

  const { client, schedule } = input
  const signedDate = input.signedAt.toLocaleDateString('en-ZA')

  // ---- 1. Parties ----
  heading('1. PARTIES AND EFFECTIVE DATE')
  row('Effective Date', schedule.effective_date)
  row('Client / Legal Name', client.legal_name)
  row('Company Name', client.company_name)
  row('Registration No.', client.registration_no)
  row('Physical Address', client.physical_address)
  row('Email', client.email)
  row('Telephone', client.telephone)
  row('Authorised Representative', client.authorised_rep)
  y += 1
  paragraph('AND', 9.5, 'bold', 2)
  row('Service Provider', VILLAGE_MEDIA.name)
  row('Registration No.', VILLAGE_MEDIA.registrationNo)
  row('Business Address', VILLAGE_MEDIA.businessAddress)
  row('Email', VILLAGE_MEDIA.email)
  row('Telephone', VILLAGE_MEDIA.telephone)

  // ---- 2. Campaign schedule ----
  heading('2. CAMPAIGN SCHEDULE')
  checkboxRow('Advertising Area(s)', [
    ...ADVERTISING_AREAS.map((a) => ({ label: a, checked: schedule.areas.includes(a) })),
    { label: `Other${schedule.other_area ? `: ${schedule.other_area}` : ''}`, checked: Boolean(schedule.other_area) },
  ])
  row('Digital Ad Duration', DEFAULT_AD_DURATION)
  row('Monthly Fee', schedule.monthly_fee ? `R ${schedule.monthly_fee}` : '')
  checkboxRow(
    'VAT',
    VAT_OPTIONS.map((o) => ({ label: o.label, checked: schedule.vat === o.value })),
  )
  row('Campaign Start Date', schedule.campaign_start)
  row('Initial Term', schedule.initial_term || INITIAL_TERM)
  row('Selected Package / Notes', schedule.package_notes)

  // ---- 3–19. Terms ----
  for (const section of agreementSectionsFor(schedule.initial_term || INITIAL_TERM)) {
    heading(section.title)
    for (const clause of section.clauses) paragraph(clause)
  }

  // ---- 20. Signatures ----
  heading('20. SIGNATURES')
  paragraph(SIGNATURE_DECLARATION, 9.5, 'normal', 4)
  signatureBlock(
    `For ${VILLAGE_MEDIA.name}`,
    [
      ['Name', input.vmSigner.name],
      ['Capacity', input.vmSigner.capacity],
    ],
    input.vmSigner.signaturePng,
    signedDate,
  )
  signatureBlock(
    'For the Client',
    [
      ['Name', input.clientSigner.name],
      ['Company', input.clientSigner.company],
      ['Capacity', input.clientSigner.capacity],
    ],
    input.clientSigner.signaturePng,
    signedDate,
  )
  paragraph(
    `Signed electronically on ${input.signedAt.toLocaleString('en-ZA')} via the Village Media sales portal.`,
    8,
    'normal',
  )

  addFooters(doc, input.agreementId)
  return doc.output('blob')
}

function addFooters(doc: JsPdf, agreementId: string) {
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(120)
    doc.text(
      `${VILLAGE_MEDIA.footerName} - Digital Advertising Services Agreement | Page ${i} of ${pages}`,
      PAGE_W / 2,
      PAGE_H - 13,
      { align: 'center' },
    )
    doc.text(`Ref ${agreementId} · Terms version ${AGREEMENT_VERSION}`, PAGE_W / 2, PAGE_H - 9, { align: 'center' })
    doc.setTextColor(0)
  }
}
