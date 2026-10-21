// Village Media Digital In-Vehicle Advertising Services Agreement.
// Source: Village_Media_Digital_Advertising_Agreement_Updated_Oct2026.pdf (final) — keep
// this in sync with the signed-off legal version.

/**
 * While true, the sign-up screen and every PDF carry a "DRAFT FOR ATTORNEY REVIEW"
 * warning. The October 2026 version is final, so this is off.
 */
export const AGREEMENT_IS_DRAFT = false

/** Bump whenever the clause wording changes, so each PDF records which version was signed. */
export const AGREEMENT_VERSION = '2026-10 final'

export const VILLAGE_MEDIA = {
  name: 'Village Connect Media (Pty) Ltd',
  /** Printed in the footer of every page. */
  footerName: 'Village Connect Media (PTY ltd.) t/a Village Media',
  // Blank in the source document — fill in and they'll print on every new contract.
  registrationNo: '',
  businessAddress: 'Cnr Rooibok & Henley Drive, Highbury, Henley on Klip, 1961',
  email: '',
  telephone: '060 972 9534',
}

export const ADVERTISING_AREAS = ['Meyerton', 'Vanderbijlpark', 'Heidelberg', 'Walkerville'] as const

export const DEFAULT_AD_DURATION = '10 seconds, unless otherwise agreed in writing'

/** Fixed by clause 10.1, so it is not editable per client. */
export const INITIAL_TERM = '12 months from Campaign Start Date'

export const VAT_OPTIONS = [
  { value: 'inclusive', label: 'Inclusive' },
  { value: 'exclusive', label: 'Exclusive' },
  { value: 'not_applicable', label: 'Not applicable' },
] as const

export interface AgreementSection {
  title: string
  clauses: string[]
}

/** Sections 3–19 (1 and 2 are the filled-in details and schedule; 20 is signatures). */
export const AGREEMENT_SECTIONS: AgreementSection[] = [
  {
    title: '3. BACKGROUND',
    clauses: [
      '3.1 Village Connect Media (Pty) Ltd ("Village Media" or the "Service Provider") provides digital advertising and media services.',
      '3.2 Village Media operates a digital advertising network utilising screens installed in participating Village Tuk passenger vehicles and may, from time to time, use other approved participating vehicles, locations or digital displays.',
      '3.3 The Client wishes to advertise its business, products, services or brand through the Village Media digital advertising network, and the parties wish to regulate that relationship on the terms set out below.',
    ],
  },
  {
    title: '4. SERVICES PROVIDED',
    clauses: [
      "4.1 The Service Provider will display the Client's approved digital advertising material on participating digital advertising screens within the advertising area(s) selected in the Campaign Schedule.",
      '4.2 Unless otherwise agreed in writing, the standard advertising slot is a digital advertisement with a maximum duration of ten (10) seconds forming part of a rotating playlist.',
      "4.3 Campaign content may include approved still images, graphics, animations, video, QR codes, offers, contact details and other digital media supported by the Service Provider's platform.",
      '4.4 The Service Provider may remotely upload, schedule, replace, pause or remove campaign content as reasonably required to operate the network.',
      "4.5 The Service Provider will use commercially reasonable efforts to keep participating screens operational and the Client's approved campaign scheduled during the paid campaign period.",
    ],
  },
  {
    title: '5. ADVERTISING AREA, FLEET AND ROUTES',
    clauses: [
      '5.1 Advertising is sold by selected operating area unless the Campaign Schedule states otherwise.',
      '5.2 Vehicle numbers, screen numbers, routes, operating hours and passenger demand may vary during the campaign because Village Tuk is an active transport service.',
      '5.3 Routes and destinations are determined by passenger demand and operational requirements. The Service Provider does not guarantee that a particular vehicle will travel on a particular road, suburb or route at a particular time.',
      '5.4 The Service Provider may move a campaign between participating screens or vehicles within the selected advertising area to maintain delivery of the service.',
    ],
  },
  {
    title: '6. ESTIMATED PLAYS, RIDERSHIP AND ADVERTISING RESULTS',
    clauses: [
      '6.1 Any figure quoted for scheduled advertisement plays, impressions, passenger journeys, fleet size, operating hours, audience size or advertising exposure is an estimate based on historical data, planned schedules and/or then-current operating conditions.',
      '6.2 Unless expressly guaranteed in the Campaign Schedule, no quoted estimate constitutes a guaranteed minimum number of plays, views, passengers, impressions, enquiries, leads, QR-code scans, website visits, sales or revenue.',
      '6.3 A scheduled digital play does not mean that every passenger viewed, read, remembered or interacted with the advertisement.',
      "6.4 The Client acknowledges that the service provides an advertising and exposure opportunity and that marketing outcomes depend on factors outside the Service Provider's control.",
    ],
  },
  {
    title: '7. CONTENT, ARTWORK AND APPROVAL',
    clauses: [
      '7.1 The Client must provide accurate logos, artwork, product information, prices, promotions, contact details and other campaign information in the format reasonably requested by the Service Provider.',
      '7.2 The Client warrants that it owns, licenses or otherwise has lawful authority to use all logos, photographs, trademarks, music, video, wording and other materials supplied for the campaign.',
      '7.3 The Client remains responsible for the accuracy, legality and substantiation of all claims, prices, offers and statements contained in its advertisement.',
      '7.4 The Service Provider may refuse, pause, remove or require amendment of content that it reasonably considers unlawful, misleading, defamatory, discriminatory, offensive, politically sensitive, infringing, unsafe or likely to cause material reputational harm.',
      '7.5 The Client must approve final artwork before publication where approval is requested. Approval may be given by email or other written electronic communication.',
    ],
  },
  {
    title: '8. DESIGN AND CONTENT CHANGES',
    clauses: [
      '8.1 Any design, animation, video production, resizing or content-creation service supplied by Village Media will be charged only where stated in the Campaign Schedule, quotation or invoice.',
      "8.2 Minor campaign updates may be included at the Service Provider's discretion. Material redesigns, repeated changes or production work may attract an additional fee quoted in advance.",
      '8.3 Content changes are subject to reasonable lead times and technical compatibility with the digital advertising platform.',
    ],
  },
  {
    title: '9. FEES AND PAYMENT',
    clauses: [
      '9.1 The Client must pay the monthly advertising fee specified in the Campaign Schedule or applicable written quotation.',
      '9.2 Monthly advertising fees are payable in advance on or before the 25th day of each month for the following month of advertising, unless otherwise agreed in writing.',
      "9.3 Payment must be made by EFT to the bank account stated on the Service Provider's valid invoice. The Client should verify any notified change of banking details using a known contact channel before payment.",
      '9.4 If an amount remains unpaid after its due date, the Service Provider may, subject to applicable law and any required notice, suspend or pause the campaign until the account is brought up to date.',
      '9.5 Suspension for non-payment does not waive amounts lawfully due under this Agreement.',
    ],
  },
  {
    title: '10. TERM, RENEWAL AND CANCELLATION',
    clauses: [
      '10.1 The initial fixed term of this Agreement is twelve (12) months from the Campaign Start Date stated in the Campaign Schedule.',
      "10.2 After expiry of the initial twelve (12) month term, this Agreement will continue on a month-to-month basis unless either party gives thirty (30) days' written notice of cancellation.",
      '10.3 If the Client cancels this Agreement before the end of the initial twelve (12) month term, the Client shall pay a cancellation fee equal to fifty percent (50%) of the total monthly advertising fees remaining for the unexpired portion of that initial term. This fee is in addition to any unpaid fees already due. The application of this clause remains subject to any mandatory applicable law.',
      '10.4 The Service Provider may terminate or suspend the Agreement for material breach, non-payment, unlawful advertising content or serious reputational risk, subject to any notice or remedy period required by applicable law.',
    ],
  },
  {
    title: '11. SCREEN, SOFTWARE, CONNECTIVITY AND VEHICLE DOWNTIME',
    clauses: [
      '11.1 Digital advertising depends on vehicles, screens, power, mobile data, software, servers and third-party technology. Temporary interruptions may occur.',
      '11.2 Downtime may result from maintenance, repairs, accidents, breakdowns, theft, vandalism, regulatory requirements, connectivity failures, software or hardware faults, load shedding, power issues or other operational circumstances.',
      '11.3 Where a material portion of the selected campaign network is unavailable for a sustained period, the Service Provider will use commercially reasonable efforts to restore service, move the campaign to alternative participating screens in the selected area, extend the campaign, or provide an appropriate pro-rata credit where reasonable in the circumstances.',
      '11.4 Short-term or intermittent outages that do not materially affect the campaign as a whole will not automatically entitle the Client to a refund.',
    ],
  },
  {
    title: '12. REPORTING AND PLATFORM DATA',
    clauses: [
      '12.1 Where available, Village Media may provide campaign information such as scheduled plays, screen status, vehicle activity, operating information or passenger ride statistics.',
      '12.2 Reports and dashboard information are provided for informational purposes and may be affected by third-party platform limitations, connectivity, software faults, delayed synchronisation or technical inaccuracies.',
      '12.3 Platform data is not an independent audited audience measurement unless expressly stated otherwise.',
    ],
  },
  {
    title: '13. INTELLECTUAL PROPERTY AND MARKETING USE',
    clauses: [
      '13.1 The Client retains ownership of intellectual property it supplies to the Service Provider.',
      "13.2 Unless otherwise agreed in writing, ownership of bespoke creative work specifically commissioned and fully paid for by the Client will pass to the Client, excluding the Service Provider's pre-existing templates, systems, software, know-how and brand assets.",
      "13.3 The Client grants the Service Provider a non-exclusive licence for the campaign term to reproduce, resize, encode, display and transmit the Client's approved materials as necessary to deliver the advertising service.",
      '13.4 Unless the Client objects in writing, the Service Provider may photograph or capture examples of the live campaign and use them for its portfolio, sales presentations and marketing, provided that confidential Client information is not disclosed.',
    ],
  },
  {
    title: '14. CONFIDENTIALITY AND PERSONAL INFORMATION',
    clauses: [
      "14.1 Each party must keep the other party's non-public confidential business information confidential and use it only for purposes connected with this Agreement.",
      '14.2 Each party will process personal information received under this Agreement in accordance with applicable South African data-protection law and only for legitimate business and contractual purposes.',
    ],
  },
  {
    title: '15. LIMITATION OF LIABILITY',
    clauses: [
      '15.1 To the fullest extent permitted by law, neither party will be liable to the other for indirect, consequential, special or incidental loss arising from this Agreement.',
      '15.2 The Service Provider is not liable for loss of profit, loss of anticipated business, loss of goodwill or loss caused by a failure of an advertisement to generate a particular marketing result.',
      "15.3 Subject to applicable law, the Service Provider's aggregate liability arising from the campaign will not exceed the advertising fees paid by the Client during the three (3) months immediately preceding the event giving rise to the claim.",
      '15.4 Nothing in this Agreement excludes or limits liability to the extent that such exclusion or limitation is prohibited by law.',
    ],
  },
  {
    title: '16. FORCE MAJEURE',
    clauses: [
      '16.1 Neither party will be liable for delay or failure to perform caused by circumstances beyond its reasonable control, including civil unrest, strikes, acts of government, fuel shortages, load shedding, widespread communications failures, fire, flood, severe weather, natural disaster, epidemic or pandemic, or similar events.',
      '16.2 The affected party must take reasonable steps to minimise the effect of the event and resume performance when reasonably possible.',
    ],
  },
  {
    title: '17. NOTICES',
    clauses: [
      '17.1 Formal notices under this Agreement must be in writing and sent to the physical or email addresses stated in this Agreement, unless a party notifies the other of updated details in writing.',
      '17.2 Ordinary campaign approvals, artwork approvals and operational instructions may be communicated by email or other agreed written electronic channel.',
    ],
  },
  {
    title: '18. DISPUTE RESOLUTION AND GOVERNING LAW',
    clauses: [
      '18.1 The parties will first attempt in good faith to resolve any dispute through direct negotiation.',
      '18.2 If the dispute is not resolved, the parties may agree to mediation or arbitration before resorting to litigation.',
      '18.3 This Agreement is governed by the laws of the Republic of South Africa, and nothing in it limits any mandatory statutory right or remedy.',
    ],
  },
  {
    title: '19. GENERAL',
    clauses: [
      '19.1 This Agreement, together with the Campaign Schedule and any quotation expressly incorporated into it, constitutes the agreement between the parties concerning the campaign.',
      '19.2 No material amendment is valid unless recorded in writing and agreed by authorised representatives of both parties.',
      '19.3 If any provision is invalid or unenforceable, the remaining provisions will continue in force.',
      '19.4 No failure or delay in enforcing a right constitutes a waiver of that right.',
      "19.5 The Client may not assign this Agreement without the Service Provider's prior written consent. The Service Provider may use contractors and technology providers to deliver the service while remaining responsible for its contractual obligations.",
    ],
  },
]

export const SIGNATURE_DECLARATION =
  'By signing below, each signatory warrants that he or she is authorised to bind the relevant party and acknowledges that the Campaign Schedule and these terms form the agreement between the parties.'
