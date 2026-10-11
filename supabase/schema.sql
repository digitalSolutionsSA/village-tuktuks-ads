-- Village Tuk-Tuks Ad Platform — database schema
-- Run this once, in full, in your Supabase project's SQL Editor
-- (Project → SQL Editor → New query → paste → Run).
--
-- Model: admin-only. There is no public self-serve signup — advertisers send
-- artwork to an admin, who uploads and manages everything. See section 7 for
-- how to create admin accounts.

-- ============================================================
-- 1. Profiles (extends auth.users with a role)
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'customer' check (role in ('admin', 'customer')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- security-definer helper avoids recursive RLS lookups on profiles itself
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = uid and role = 'admin'
  );
$$;

create policy "profiles: read own or admin reads all"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin(auth.uid()));

create policy "profiles: update own"
  on public.profiles for update
  using (id = auth.uid());

-- Auto-create a profile row whenever a new auth user signs up (including
-- ones an admin creates directly from the Supabase dashboard).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'display_name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- 2. Tuk-tuk groups (e.g. "Meyerton", "Vereeniging")
-- ============================================================

create table if not exists public.tuktuk_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.tuktuk_groups enable row level security;

create policy "tuktuk_groups: anyone can read"
  on public.tuktuk_groups for select
  using (true);

create policy "tuktuk_groups: admin inserts"
  on public.tuktuk_groups for insert
  with check (public.is_admin(auth.uid()));

create policy "tuktuk_groups: admin updates"
  on public.tuktuk_groups for update
  using (public.is_admin(auth.uid()));

create policy "tuktuk_groups: admin deletes"
  on public.tuktuk_groups for delete
  using (public.is_admin(auth.uid()));

-- ============================================================
-- 3. Tuk-tuks (starts seeded with 16; admins can add/remove/rename/group)
-- ============================================================

create table if not exists public.tuktuks (
  id int primary key,
  label text not null,
  active boolean not null default true,
  group_id uuid references public.tuktuk_groups (id) on delete set null,
  last_seen_at timestamptz
);

insert into public.tuktuks (id, label)
select n, 'Tuk-Tuk ' || lpad(n::text, 2, '0')
from generate_series(1, 16) as n
on conflict (id) do nothing;

alter table public.tuktuks enable row level security;

create policy "tuktuks: anyone can read"
  on public.tuktuks for select
  using (true);

-- Only admins may rename/regroup/activate/deactivate a tuk-tuk directly.
-- Tablets report their heartbeat through the narrow RPC below instead, so
-- the public anon key alone can never rewrite a tuk-tuk's label or status.
create policy "tuktuks: admin updates"
  on public.tuktuks for update
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "tuktuks: admin manages"
  on public.tuktuks for insert
  with check (public.is_admin(auth.uid()));

create policy "tuktuks: admin deletes"
  on public.tuktuks for delete
  using (public.is_admin(auth.uid()));

create or replace function public.report_heartbeat(tuktuk_id_param int)
returns void
language sql
security definer
set search_path = public
as $$
  update public.tuktuks set last_seen_at = now() where id = tuktuk_id_param;
$$;

grant execute on function public.report_heartbeat(int) to anon, authenticated;

-- ============================================================
-- 4. Creatives (the uploaded ads — admin-managed only)
-- ============================================================
-- Named "creatives" rather than "ads" on purpose: browser ad-blocker
-- extensions (uBlock, Brave's built-in blocker, AdGuard, etc.) commonly
-- block any request whose path contains "ads", which would silently break
-- every upload/edit for a large share of real users.

create table if not exists public.creatives (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  advertiser_name text,
  title text not null,
  media_path text not null,
  media_url text not null,
  media_type text not null check (media_type in ('image', 'video')),
  duration_seconds int not null default 8,
  is_active boolean not null default true,
  start_date date,
  end_date date,
  created_at timestamptz not null default now()
);

create index if not exists creatives_customer_id_idx on public.creatives (customer_id);

alter table public.creatives enable row level security;

-- The player (anon, unauthenticated) only ever needs active ads.
create policy "creatives: anyone can read active ones"
  on public.creatives for select
  using (is_active = true or public.is_admin(auth.uid()));

create policy "creatives: admin inserts"
  on public.creatives for insert
  with check (public.is_admin(auth.uid()));

create policy "creatives: admin updates"
  on public.creatives for update
  using (public.is_admin(auth.uid()));

create policy "creatives: admin deletes"
  on public.creatives for delete
  using (public.is_admin(auth.uid()));

-- ============================================================
-- 5. Ad assignments — individual tuk-tuks and whole groups
-- ============================================================

create table if not exists public.ad_assignments (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references public.creatives (id) on delete cascade,
  tuktuk_id int not null references public.tuktuks (id) on delete cascade,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (ad_id, tuktuk_id)
);

create index if not exists ad_assignments_tuktuk_id_idx on public.ad_assignments (tuktuk_id);
create index if not exists ad_assignments_ad_id_idx on public.ad_assignments (ad_id);

alter table public.ad_assignments enable row level security;

create table if not exists public.ad_group_assignments (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references public.creatives (id) on delete cascade,
  group_id uuid not null references public.tuktuk_groups (id) on delete cascade,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (ad_id, group_id)
);

create index if not exists ad_group_assignments_group_id_idx on public.ad_group_assignments (group_id);
create index if not exists ad_group_assignments_ad_id_idx on public.ad_group_assignments (ad_id);

alter table public.ad_group_assignments enable row level security;

-- Assignment rows carry no sensitive data (just ids) — readable by everyone
-- so the unauthenticated tablet player can build its playlist.
create policy "ad_assignments: anyone can read"
  on public.ad_assignments for select
  using (true);

create policy "ad_assignments: admin manages"
  on public.ad_assignments for insert
  with check (public.is_admin(auth.uid()));

create policy "ad_assignments: admin updates"
  on public.ad_assignments for update
  using (public.is_admin(auth.uid()));

create policy "ad_assignments: admin deletes"
  on public.ad_assignments for delete
  using (public.is_admin(auth.uid()));

create policy "ad_group_assignments: anyone can read"
  on public.ad_group_assignments for select
  using (true);

create policy "ad_group_assignments: admin manages"
  on public.ad_group_assignments for insert
  with check (public.is_admin(auth.uid()));

create policy "ad_group_assignments: admin updates"
  on public.ad_group_assignments for update
  using (public.is_admin(auth.uid()));

create policy "ad_group_assignments: admin deletes"
  on public.ad_group_assignments for delete
  using (public.is_admin(auth.uid()));

-- ============================================================
-- 6. Sidebar ads — a tuk-tuk's own logo/services, shown in the player's
--    left-hand bar so each driver can advertise their own thing alongside
--    the main ad cycle.
-- ============================================================

create table if not exists public.tuktuk_sidebar_ads (
  id uuid primary key default gen_random_uuid(),
  tuktuk_id int not null references public.tuktuks (id) on delete cascade,
  title text not null,
  media_path text not null,
  media_url text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists tuktuk_sidebar_ads_tuktuk_id_idx on public.tuktuk_sidebar_ads (tuktuk_id);

alter table public.tuktuk_sidebar_ads enable row level security;

create policy "tuktuk_sidebar_ads: anyone can read active ones"
  on public.tuktuk_sidebar_ads for select
  using (is_active = true or public.is_admin(auth.uid()));

create policy "tuktuk_sidebar_ads: admin inserts"
  on public.tuktuk_sidebar_ads for insert
  with check (public.is_admin(auth.uid()));

create policy "tuktuk_sidebar_ads: admin updates"
  on public.tuktuk_sidebar_ads for update
  using (public.is_admin(auth.uid()));

create policy "tuktuk_sidebar_ads: admin deletes"
  on public.tuktuk_sidebar_ads for delete
  using (public.is_admin(auth.uid()));

-- ============================================================
-- 7. Marquee messages — scrolling top-bar text ads. Target one specific
--    tuk-tuk (a specific customer's tuk-tuk) or leave tuktuk_id null to
--    scroll fleet-wide.
-- ============================================================

create table if not exists public.marquee_messages (
  id uuid primary key default gen_random_uuid(),
  tuktuk_id int references public.tuktuks (id) on delete cascade,
  advertiser_name text,
  message text not null,
  media_path text,
  media_url text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists marquee_messages_tuktuk_id_idx on public.marquee_messages (tuktuk_id);

alter table public.marquee_messages enable row level security;

create policy "marquee_messages: anyone can read active ones"
  on public.marquee_messages for select
  using (is_active = true or public.is_admin(auth.uid()));

create policy "marquee_messages: admin inserts"
  on public.marquee_messages for insert
  with check (public.is_admin(auth.uid()));

create policy "marquee_messages: admin updates"
  on public.marquee_messages for update
  using (public.is_admin(auth.uid()));

create policy "marquee_messages: admin deletes"
  on public.marquee_messages for delete
  using (public.is_admin(auth.uid()));

-- ============================================================
-- 8. Storage bucket for ad media (public read, admin write)
-- ============================================================
-- Named "creative-media" (not "ads-media") for the same ad-blocker reason
-- noted above — see section 4.

insert into storage.buckets (id, name, public)
values ('creative-media', 'creative-media', true)
on conflict (id) do nothing;

create policy "creative-media: public read"
  on storage.objects for select
  using (bucket_id = 'creative-media');

create policy "creative-media: admin upload"
  on storage.objects for insert
  with check (bucket_id = 'creative-media' and public.is_admin(auth.uid()));

create policy "creative-media: admin deletes"
  on storage.objects for delete
  using (bucket_id = 'creative-media' and public.is_admin(auth.uid()));

-- ============================================================
-- 9. Drivers — each has their own username + PIN. If tuktuk_id is set, that
--    driver's PIN only verifies on that one tablet; null means any tablet.
-- ============================================================
-- Tablets never read a driver's PIN directly — only admins can, via this
-- table's RLS. Tablets call verify_driver_pin(driver_id, tuktuk_id, candidate)
-- instead, which returns just true/false. The public "active_driver_names"
-- view exposes only id + username + tuktuk_id (no PIN) so the tablet can show
-- a name picker already filtered to names valid on that tuk-tuk.

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  pin text not null,
  active boolean not null default true,
  tuktuk_id int references public.tuktuks (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists drivers_tuktuk_id_idx on public.drivers (tuktuk_id);

alter table public.drivers enable row level security;

create policy "drivers: admin reads"
  on public.drivers for select
  using (public.is_admin(auth.uid()));

create policy "drivers: admin inserts"
  on public.drivers for insert
  with check (public.is_admin(auth.uid()));

create policy "drivers: admin updates"
  on public.drivers for update
  using (public.is_admin(auth.uid()));

create policy "drivers: admin deletes"
  on public.drivers for delete
  using (public.is_admin(auth.uid()));

-- Owned by the migration-running role, so it can expose username/id to
-- anon/authenticated without exposing the underlying table's PIN column.
create or replace view public.active_driver_names as
  select id, username, tuktuk_id from public.drivers where active = true;

grant select on public.active_driver_names to anon, authenticated;

-- Superseded by the 3-arg version below (also checks tuk-tuk assignment).
drop function if exists public.verify_driver_pin(uuid, text);

create or replace function public.verify_driver_pin(
  driver_id_param uuid,
  tuktuk_id_param int,
  candidate text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.drivers
    where id = driver_id_param
      and pin = candidate
      and active = true
      and (tuktuk_id is null or tuktuk_id = tuktuk_id_param)
  );
$$;

grant execute on function public.verify_driver_pin(uuid, int, text) to anon, authenticated;

-- Sign-in / sign-out log. Snapshots the driver's username and tuk-tuk's
-- label at the time, so history stays readable even if either is later
-- renamed or deleted.
create table if not exists public.driver_sessions (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references public.drivers (id) on delete set null,
  driver_username text not null,
  tuktuk_id int references public.tuktuks (id) on delete set null,
  tuktuk_label text not null,
  action text not null check (action in ('sign_in', 'sign_out')),
  created_at timestamptz not null default now()
);

create index if not exists driver_sessions_created_at_idx on public.driver_sessions (created_at desc);

alter table public.driver_sessions enable row level security;

create policy "driver_sessions: admin reads"
  on public.driver_sessions for select
  using (public.is_admin(auth.uid()));

-- No direct insert/update/delete policies — all writes go through this RPC,
-- which runs as its owner and so can insert despite the table's RLS.
create or replace function public.log_driver_session(
  driver_id_param uuid,
  tuktuk_id_param int,
  action_param text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_label text;
begin
  select username into v_username from public.drivers where id = driver_id_param;
  select label into v_label from public.tuktuks where id = tuktuk_id_param;
  if v_username is null or v_label is null then
    return;
  end if;
  insert into public.driver_sessions (driver_id, driver_username, tuktuk_id, tuktuk_label, action)
  values (driver_id_param, v_username, tuktuk_id_param, v_label, action_param);
end;
$$;

grant execute on function public.log_driver_session(uuid, int, text) to anon, authenticated;

-- ============================================================
-- 10. Realtime (so tablets get instant updates when admin changes ads)
-- ============================================================

alter publication supabase_realtime add table public.creatives;
alter publication supabase_realtime add table public.ad_assignments;
alter publication supabase_realtime add table public.ad_group_assignments;
alter publication supabase_realtime add table public.tuktuk_sidebar_ads;
alter publication supabase_realtime add table public.marquee_messages;

-- ============================================================
-- 11. Create admin accounts
-- ============================================================
-- There is no public sign-up page. To create an admin (yourself, or a
-- second admin), go to the Supabase dashboard → Authentication → Users →
-- Add user, set an email + password there, then run:
--   update public.profiles set role = 'admin' where email = 'you@example.com';
--
-- Optional hardening: Authentication → Providers → Email → turn off
-- "Allow new users to sign up", since this app never links to a sign-up
-- form anyway.

-- ============================================================
-- 12. Client sign-up & signed agreements (sales portal)
-- ============================================================
-- "sales" users can only sign up clients. Create one like an admin (section
-- 11), then: update public.profiles set role = 'sales' where email = '...';

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'sales', 'customer'));

create or replace function public.is_staff(uid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = uid and role in ('admin', 'sales')); $$;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  company_name text,
  registration_no text,
  physical_address text,
  email text not null,
  telephone text,
  authorised_rep text,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.clients enable row level security;
create policy "clients: staff reads own, admin reads all" on public.clients for select
  using (public.is_admin(auth.uid()) or (created_by = auth.uid() and public.is_staff(auth.uid())));
create policy "clients: staff inserts" on public.clients for insert
  with check (public.is_staff(auth.uid()) and created_by = auth.uid());
create policy "clients: admin updates" on public.clients for update using (public.is_admin(auth.uid()));
create policy "clients: admin deletes" on public.clients for delete using (public.is_admin(auth.uid()));

-- Named "client_agreements" (no "ads") for the ad-blocker reason in section 4.
create table if not exists public.client_agreements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  effective_date date not null,
  areas text[] not null default '{}',
  other_area text,
  monthly_fee numeric(12, 2),
  vat text check (vat in ('inclusive', 'exclusive', 'not_applicable')),
  campaign_start date,
  initial_term text,
  package_notes text,
  client_signer_name text not null,
  client_signer_company text,
  client_signer_capacity text,
  vm_signer_name text not null,
  vm_signer_capacity text,
  signed_at timestamptz not null default now(),
  pdf_path text,
  emailed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists client_agreements_client_id_idx on public.client_agreements (client_id);
alter table public.client_agreements enable row level security;
create policy "client_agreements: staff reads own, admin reads all" on public.client_agreements for select
  using (public.is_admin(auth.uid()) or (created_by = auth.uid() and public.is_staff(auth.uid())));
create policy "client_agreements: staff inserts" on public.client_agreements for insert
  with check (public.is_staff(auth.uid()) and created_by = auth.uid());
create policy "client_agreements: creator or admin updates" on public.client_agreements for update
  using (public.is_admin(auth.uid()) or (created_by = auth.uid() and public.is_staff(auth.uid())));
create policy "client_agreements: admin deletes" on public.client_agreements for delete using (public.is_admin(auth.uid()));

-- Private bucket; files stored as <uploader uid>/<agreement id>.pdf
insert into storage.buckets (id, name, public)
values ('signed-contracts', 'signed-contracts', false)
on conflict (id) do nothing;
create policy "signed-contracts: staff uploads own folder" on storage.objects for insert
  with check (bucket_id = 'signed-contracts' and public.is_staff(auth.uid())
    and (storage.foldername(name))[1] = auth.uid()::text);
create policy "signed-contracts: owner or admin reads" on storage.objects for select
  using (bucket_id = 'signed-contracts' and (public.is_admin(auth.uid())
    or (public.is_staff(auth.uid()) and (storage.foldername(name))[1] = auth.uid()::text)));
create policy "signed-contracts: admin deletes" on storage.objects for delete
  using (bucket_id = 'signed-contracts' and public.is_admin(auth.uid()));

-- Emailing the PDF: deploy supabase/functions/send-contract and set its
-- secrets RESEND_API_KEY, CONTRACT_FROM_EMAIL (and optional CONTRACT_BCC_EMAIL).
