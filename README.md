# Village Tuk-Tuks — Ad Platform

A digital-signage web app for the tuk-tuk fleet, plus an admin portal for
uploading ads and putting them live on specific tuk-tuks or whole groups of
them.

- **Ads** (`/`) — the tablet screen. Starts playing ads immediately, no
  sign-in. Plays this tablet's tuk-tuk (set once by opening `/player` and
  tapping its number, or `/player/7` — the tablet remembers it). A tablet
  with no number yet plays every active ad in the fleet. Ads fill the whole
  screen; the only other thing on it is the Village Media logo (top-left),
  which opens the staff portal. After every 5 ads one of the four passenger
  notices plays for 10 seconds (CCTV → Disclaimer → No smoking → Ride rates,
  in turn) — they're built into the player (`public/Ads/notice-1…4-*.webp`, 2000×953) and
  can't be switched off. With no ads scheduled, the notices play on their own.
  The first tap makes it full screen.
  Works offline: once media has loaded, it keeps cycling from a local cache
  even with no signal.
- **Staff portal** (`/admin`, sign in at `/admin/login`) — one portal for
  sales reps and management (no public sign-up). Its home page is the
  customer-facing **Pitch**, so reps can open it and stay on it at a
  customer. Also: projections, leads, contract sign-up, clients, ads,
  tuk-tuks, groups, marquee, statistics and packages.
  Styled in the logo's colours (brand blue, with the red-gold-green-blue
  stripe); dark by default, with a ☀️ Light / 🌙 Dark switch in the header
  that each device remembers. The tuk-tuk ad screen always stays dark.

Stack: Vite + React + TypeScript + Tailwind CSS v4 + Supabase (Postgres,
Auth, Storage, Realtime).

## 1. Install

```bash
npm install
```

## 2. Connect a Supabase project

1. Create a project at [supabase.com](https://supabase.com) (or reuse an
   existing one).
2. Open **SQL Editor** in that project, paste the entire contents of
   [`supabase/schema.sql`](supabase/schema.sql), and run it. This creates
   every table, RLS policy, and RPC the app needs, seeds 16 tuk-tuk rows, and
   creates the public `creative-media` storage bucket.
3. Copy `.env.example` to `.env.local` and fill in your project's URL and
   anon/publishable key (Project Settings → API):

   ```bash
   cp .env.example .env.local
   ```

4. Restart the dev server if it's already running.

Until `.env.local` is filled in, the app runs a self-contained **demo
mode** — sample ads, no real backend — so it's never blank.

### Creating admin accounts

There's no public sign-up page — the admin is the only one who ever logs
into `/admin`. To create yourself (or a second admin, max 1–2 recommended):

1. Supabase dashboard → Authentication → Users → **Add user** (email +
   password).
2. In the SQL editor: `update public.profiles set role = 'admin' where email = 'you@example.com';`

Optional hardening: Authentication → Providers → Email → turn off "Allow new
users to sign up," since the app never links to a sign-up form anyway.

### Who can do what

- **Sales people** (sign in at `/admin/login` with the username a main admin
  gives them): the **Pitch** (portal home, incl. the live projection),
  **Leads** (add and work them — no deleting), **Sign client** (sign the
  contract on the tablet and email it), **Clients** (no deleting), **Ads**
  (load an ad for a customer and choose which areas it plays in), and
  **Statistics**. Plus the preview player and the dark/light switch.
- **Main admins** (`profiles.super_admin`: info@digitalsolutionssa.co.za,
  jaco@agilegas.co.za, refiloe@agilegas.co.za) — everything above, plus:
  **Sales team** (add / edit / delete sales people with username and
  password), **Commissions** (structures: % of the monthly fee or a flat
  amount, for N months; who earns on which), **Finance** (monthly earnings vs
  costs vs commission, payouts owed per sales person, recording payouts and
  costs, ending contracts), **Tuk-tuks & areas** (add tuk-tuks, nicknames,
  areas), and **Logs**.

The database enforces the same split (`schema.sql` §16): sales people can't
delete leads, customers, contracts or ads, can't change tuk-tuks or areas,
and can't see or change commissions, payouts or costs. Each contract copies
its sales person's commission terms when it is signed.

Sales accounts are created in Admin → Sales performance with a **username** and
password — no email needed (behind the scenes the username maps to
`<username>@staff.villagemedia.local`). This needs the `manage-staff` edge
function deployed:

```bash
npx supabase functions deploy manage-staff --project-ref <your-ref>
```

For an existing database, run **section 14** of `supabase/schema.sql` once.
It also closes a hole where any signed-in user could edit their own role.
Then run **section 15** (super admins, activity log) and **section 16**
(sales vs main admin permissions, commissions, payouts, costs), and redeploy
`manage-staff`.

## 3. Run it

```bash
npm run dev
```

- Admin portal: `http://localhost:5173/admin`
- Player preview: `http://localhost:5173/player/1`

## 4. Deploy

Static site — build and deploy the `dist/` output anywhere (this project
deploys to Netlify via `netlify deploy --prod --dir=dist`):

```bash
npm run build
```

Set the same two env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) on
your host. You need a stable public URL because every tablet points at
`https://your-domain.com/player/<N>`.

## 5. Setting up each Android tablet

The ad screen must fill the whole display with **zero browser UI** — no
address bar, no tabs, nothing a passenger could tap their way out of. Two
ways to get there, and you can combine them:

### Option A — Install it as an app (no extra software)

The site ships a web app manifest, so Chrome can install it as a proper
fullscreen app icon with no browser chrome at all:

1. On the tablet, open that tuk-tuk's **specific** URL —
   `https://your-domain.com/player/<N>` — in Chrome.
2. Chrome menu (⋮) → **Install app** (or **Add to Home screen**).
3. Launch it from the home-screen icon each time, not from a bookmark in
   Chrome itself. It opens fullscreen, no tabs, no address bar.

This is free and quick, but a determined passenger could still exit if they
know Android well (e.g. the system back gesture). For a taxi/passenger
setting, pair it with Option B.

### Option B — Kiosk browser (recommended, locks the OS UI too)

**Fully Kiosk Browser** (free tier is enough; Plus is worth it for a fleet)
from the Play Store locks the tablet at the OS level — no status bar, no
nav/home buttons, auto-restart, remote admin.

1. Install *Fully Kiosk Browser* on the tablet.
2. Set **Start URL** to `https://your-domain.com/player/<N>` — a different
   `N` per tablet, matching its tuk-tuk (copy the exact link from that
   tuk-tuk's detail page in the admin portal).
3. Enable: **Screen Always On**, **Autostart on Boot**, **Kiosk Mode / Lock
   Task Mode** (hides Android nav/status bars), **Auto Reload on Error**.
4. For real audio on video ads, enable Fully Kiosk's autoplay-with-sound
   override — otherwise videos autoplay muted everywhere, guaranteed.
5. For the strongest lock (physically inert home button, not just
   intercepted), provision it as **Device Owner** — see Fully Kiosk's own
   docs; needs a factory-reset tablet and one `adb` command before first
   Google sign-in.

## How offline resilience works

Tuk-tuks won't always have signal. The player is built to keep running
without one:

- On load it instantly renders the **last playlist it saved locally**
  (`localStorage`), so playback resumes immediately even with zero
  connectivity — no blank screen while waiting on a network call.
- Every ad's image/video is downloaded once and stored in the browser's
  Cache Storage. Playback always reads from that local cache, so a dropped
  connection mid-cycle never interrupts anything already downloaded.
- In the background, it refreshes the playlist from Supabase every 5 minutes
  and instantly on any admin change (via Supabase Realtime) whenever a
  connection is available — new/removed ads and reassignments reach the
  tablet without needing a restart.
- A small status dot (top-left) shows *online* vs *offline (cached
  playlist)* for on-the-spot debugging.
- Each tablet also pings a heartbeat once a minute when online, which is
  what powers the online/offline indicator on the admin's tuk-tuk fleet
  page.

## Project structure

```
src/
  lib/            Supabase client, offline media cache, playlist manifest,
                   tuktuks/groups/staff/sales APIs
  hooks/          useWakeLock (screen-on), useOnlineStatus
  context/        Auth (session + admin profile)
  components/     Shared admin UI, tuk-tuk picker, signature pad
  pages/          Staff portal pages (admin/ and sales/), the kiosk player
supabase/
  schema.sql      Full DB schema — tables, RLS policies, RPCs, storage bucket
```
