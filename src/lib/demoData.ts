import {
  TUKTUK_COUNT,
  type Ad,
  type MarqueeMessage,
  type PlaylistItem,
  type Profile,
  type SidebarAd,
  type Tuktuk,
} from '../types'

const DEMO_AD_DEFS: { title: string; tagline: string; colors: [string, string] }[] = [
  { title: 'Baobab Backpackers', tagline: 'Stay wild. Stay local.', colors: ['#c2410c', '#78350f'] },
  { title: "Mama Thandi's Kitchen", tagline: 'Home-cooked, tuk-tuk fast', colors: ['#b91c1c', '#166534'] },
  { title: 'SunCharge Solar', tagline: 'Power your home, off-grid', colors: ['#ca8a04', '#1e3a8a'] },
  { title: 'Village Craft Market', tagline: 'Handmade, every Saturday', colors: ['#a21caf', '#db2777'] },
  { title: 'Coastal Cooler Drinks', tagline: 'Ice cold, always close', colors: ['#0e7490', '#0891b2'] },
  { title: 'Zulu Cultural Tours', tagline: 'Book your heritage tour today', colors: ['#1e3a8a', '#a16207'] },
]

function svgAdImage(title: string, tagline: string, [c1, c2]: [string, string]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${c1}"/>
        <stop offset="1" stop-color="${c2}"/>
      </linearGradient>
    </defs>
    <rect width="800" height="450" fill="url(#g)"/>
    <text x="400" y="210" text-anchor="middle" font-family="system-ui, sans-serif" font-size="50" font-weight="700" fill="#fff">${title}</text>
    <text x="400" y="258" text-anchor="middle" font-family="system-ui, sans-serif" font-size="22" fill="rgba(255,255,255,0.85)">${tagline}</text>
  </svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export const DEMO_PROFILE: Profile = {
  id: 'demo-customer',
  email: 'demo@village-tuktuks.example',
  display_name: 'Demo Advertiser',
  role: 'admin',
  username: 'demo',
  phone: null,
  active: true,
  last_seen_at: null,
  monthly_target: null,
  created_at: new Date().toISOString(),
}

export const DEMO_ADS: Ad[] = DEMO_AD_DEFS.map((def, i) => ({
  id: `demo-${i + 1}`,
  customer_id: DEMO_PROFILE.id,
  advertiser_name: def.title,
  title: def.title,
  media_path: `demo/${i + 1}`,
  media_url: svgAdImage(def.title, def.tagline, def.colors),
  media_type: 'image',
  duration_seconds: 3,
  is_active: true,
  start_date: null,
  end_date: null,
  created_at: new Date().toISOString(),
}))

export const DEMO_TUKTUKS: Tuktuk[] = Array.from({ length: TUKTUK_COUNT }, (_, i) => {
  const id = i + 1
  const online = id % 3 !== 0
  return {
    id,
    label: `Tuk-Tuk ${String(id).padStart(2, '0')}`,
    nickname: null,
    active: true,
    group_id: null,
    last_seen_at: new Date(
      Date.now() - (online ? 20_000 : 6 * 60 * 60 * 1000),
    ).toISOString(),
  }
})

/** How many of the 6 demo ads a given tuk-tuk has "assigned" — varied for a realistic-looking fleet. */
export function demoAdCountFor(tuktukId: number) {
  return (tuktukId % DEMO_ADS.length) + 1
}

export function demoPlaylistFor(tuktukId: number): PlaylistItem[] {
  const count = demoAdCountFor(tuktukId)
  return DEMO_ADS.slice(0, count).map((ad, i) => ({
    ...ad,
    assignment_id: `demo-assignment-${tuktukId}-${ad.id}`,
    sort_order: i,
  }))
}

export function demoTuktukIdsForAd(adId: string): number[] {
  return DEMO_TUKTUKS.map((t) => t.id).filter((id) =>
    demoPlaylistFor(id).some((item) => item.id === adId),
  )
}

/** Fixed driver + PIN used only when no real Supabase project is connected. */
export const DEMO_DRIVER = { id: 'demo-driver', username: 'Demo Driver', tuktuk_id: null }
export const DEMO_DRIVER_PIN = '123456'

function sidebarAdImage(label: string, [c1, c2]: [string, string]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${c1}"/>
        <stop offset="1" stop-color="${c2}"/>
      </linearGradient>
    </defs>
    <rect width="300" height="300" fill="url(#g)"/>
    <text x="150" y="160" text-anchor="middle" font-family="system-ui, sans-serif" font-size="26" font-weight="700" fill="#fff">${label}</text>
  </svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function marqueeBannerImage(label: string, tagline: string, [c1, c2]: [string, string]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="200" viewBox="0 0 2000 200">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${c1}"/>
        <stop offset="1" stop-color="${c2}"/>
      </linearGradient>
    </defs>
    <rect width="2000" height="200" fill="url(#g)"/>
    <text x="1000" y="95" text-anchor="middle" font-family="system-ui, sans-serif" font-size="64" font-weight="700" fill="#fff">${label}</text>
    <text x="1000" y="150" text-anchor="middle" font-family="system-ui, sans-serif" font-size="34" fill="rgba(255,255,255,0.85)">${tagline}</text>
  </svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** Sample "my own services" ads for the player's left sidebar, per tuk-tuk. */
export function demoSidebarAdsFor(tuktukId: number): SidebarAd[] {
  const driverLabel = `Tuk-Tuk ${String(tuktukId).padStart(2, '0')} Driver`
  return [
    {
      id: `demo-sidebar-${tuktukId}-1`,
      tuktuk_id: tuktukId,
      title: 'My services',
      media_path: `demo/sidebar/${tuktukId}/1`,
      media_url: sidebarAdImage(driverLabel, ['#166534', '#052e16']),
      is_active: true,
      sort_order: 0,
      created_at: new Date().toISOString(),
    },
    {
      id: `demo-sidebar-${tuktukId}-2`,
      tuktuk_id: tuktukId,
      title: 'Book a ride',
      media_path: `demo/sidebar/${tuktukId}/2`,
      media_url: sidebarAdImage('Charter trips available', ['#7c2d12', '#431407']),
      is_active: true,
      sort_order: 1,
      created_at: new Date().toISOString(),
    },
  ]
}

/** Sample scrolling top-bar messages — one fleet-wide, one aimed at this tuk-tuk. */
export function demoMarqueeFor(tuktukId: number): MarqueeMessage[] {
  return [
    {
      id: 'demo-marquee-fleet',
      tuktuk_id: null,
      advertiser_name: 'Village Tuk-Tuks',
      message: 'Welcome aboard — ask your driver about charter bookings!',
      media_path: null,
      media_url: null,
      is_active: true,
      sort_order: 0,
      created_at: new Date().toISOString(),
    },
    {
      id: `demo-marquee-${tuktukId}`,
      tuktuk_id: tuktukId,
      advertiser_name: 'Baobab Backpackers',
      message: `Special for Tuk-Tuk ${String(tuktukId).padStart(2, '0')} riders: 10% off with code TUKTUK10`,
      media_path: `demo/marquee/${tuktukId}`,
      media_url: marqueeBannerImage('Baobab Backpackers', '10% off with code TUKTUK10', ['#c2410c', '#78350f']),
      is_active: true,
      sort_order: 1,
      created_at: new Date().toISOString(),
    },
  ]
}
