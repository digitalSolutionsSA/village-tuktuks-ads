# Village Tuk-Tuks — Ad Platform

A digital-signage web app for the tuk-tuk fleet, plus an admin portal for
uploading ads and putting them live on specific tuk-tuks or whole groups of
them.

- **Landing** (`/`) — lets someone choose "Sign in as Tuk-Tuk Driver" or
  "Admin sign in."
- **Player** (`/player/1`, `/player/2`, …) — the tablet-facing screen for one
  tuk-tuk. Shows a welcome screen until a driver signs in with their PIN,
  then cycles ads fullscreen. Tapping the screen during playback brings up a
  PIN prompt to exit; it vanishes on its own after 2 seconds of no input.
  Works offline: once media has loaded, it keeps cycling from a local cache
  even with no signal.
- **Admin portal** (`/admin`) — admin-only (no public sign-up). Upload ads,
  then separately choose which tuk-tuks or groups each one goes live on,
  manage the tuk-tuk fleet (add/remove/rename/group/deactivate), manage
  drivers, and see recent driver sign-in activity.

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

### The PIN screen itself

This is already built and needs no further setup: a driver taps "▶ Play
Ads," picks their name, enters their PIN (Admin → Drivers to add/manage
these), and the ad cycle starts fullscreen. Tapping the screen during
playback brings up a PIN prompt to exit back to the welcome screen; if
nobody enters a digit within 2 seconds it silently disappears and playback
continues, undisturbed.

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
                   tuktuks/groups/drivers APIs, kiosk PIN verification
  hooks/          useWakeLock (screen-on), useOnlineStatus
  context/        Auth (session + admin profile)
  components/     Shared admin UI, PinPad, DriverPicker, tuk-tuk picker
  pages/          Landing, admin pages (dashboard, ads, tuk-tuks, groups,
                   drivers), the kiosk player itself
supabase/
  schema.sql      Full DB schema — tables, RLS policies, RPCs, storage bucket
```
