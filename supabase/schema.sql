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

-- ============================================================
-- 13. Tuk-tuk nicknames (e.g. the owner's name)
-- ============================================================
alter table public.tuktuks add column if not exists nickname text;

-- ============================================================
-- 14. Management & sales team portals
-- ============================================================
-- Existing projects: run just this section in the SQL Editor. It is safe to
-- re-run.
--
-- Roles: "admin" = Village Media management (full access, incl. tuk-tuks,
-- ads and drivers). "sales" = sales reps (sales portal only: pitch, leads,
-- packages, contract sign-up, their own clients). Sales accounts are created
-- from Admin -> Sales team (username + password) via the manage-staff edge
-- function.

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists active boolean not null default true;
alter table public.profiles add column if not exists last_seen_at timestamptz;
alter table public.profiles add column if not exists monthly_target int;
create unique index if not exists profiles_username_key on public.profiles (lower(username));

-- SECURITY FIX: the old "update own" policy let any signed-in user change
-- their own role (e.g. promote themselves to admin). Profiles are now only
-- edited by admins; reps' online status goes through staff_heartbeat().
drop policy if exists "profiles: update own" on public.profiles;
drop policy if exists "profiles: admin updates" on public.profiles;
create policy "profiles: admin updates" on public.profiles for update
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Deactivated staff lose access immediately, even with a still-valid session.
create or replace function public.is_admin(uid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = uid and role = 'admin' and active); $$;

create or replace function public.is_staff(uid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = uid and role in ('admin', 'sales') and active); $$;

-- Online periods. A heartbeat every minute extends the current session; a gap
-- of more than 5 minutes starts a new one.
create table if not exists public.staff_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists staff_sessions_user_idx on public.staff_sessions (user_id, last_seen_at desc);
alter table public.staff_sessions enable row level security;
drop policy if exists "staff_sessions: own or admin reads" on public.staff_sessions;
create policy "staff_sessions: own or admin reads" on public.staff_sessions for select
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

create or replace function public.staff_heartbeat()
returns void language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_staff(auth.uid()) then return; end if;
  update public.profiles set last_seen_at = now() where id = auth.uid();
  select id into v_id from public.staff_sessions
    where user_id = auth.uid() and ended_at is null and last_seen_at > now() - interval '5 minutes'
    order by last_seen_at desc limit 1;
  if v_id is null then
    insert into public.staff_sessions (user_id) values (auth.uid());
  else
    update public.staff_sessions set last_seen_at = now() where id = v_id;
  end if;
end;
$$;

create or replace function public.staff_sign_out()
returns void language sql security definer set search_path = public
as $$
  update public.staff_sessions set ended_at = now(), last_seen_at = now()
    where user_id = auth.uid() and ended_at is null;
$$;

revoke execute on function public.staff_heartbeat() from public, anon;
revoke execute on function public.staff_sign_out() from public, anon;
grant execute on function public.staff_heartbeat() to authenticated;
grant execute on function public.staff_sign_out() to authenticated;

-- Packages reps can pitch and pre-select on the contract.
create table if not exists public.sales_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  monthly_fee numeric(12, 2),
  areas text[] not null default '{}',
  features text[] not null default '{}',
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.sales_packages enable row level security;
drop policy if exists "sales_packages: staff reads" on public.sales_packages;
drop policy if exists "sales_packages: admin manages" on public.sales_packages;
create policy "sales_packages: staff reads" on public.sales_packages for select using (public.is_staff(auth.uid()));
create policy "sales_packages: admin manages" on public.sales_packages for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Leads (prospects). Reps see and work their own; admins see everyone's.
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  contact_name text,
  phone text,
  email text,
  address text,
  area text,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'meeting', 'proposal', 'won', 'lost')),
  source text,
  notes text,
  follow_up_date date,
  estimated_value numeric(12, 2),
  client_id uuid references public.clients (id) on delete set null,
  owner_id uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leads_owner_idx on public.leads (owner_id, updated_at desc);
alter table public.leads enable row level security;
drop policy if exists "leads: owner or admin reads" on public.leads;
drop policy if exists "leads: staff inserts own" on public.leads;
drop policy if exists "leads: owner or admin updates" on public.leads;
drop policy if exists "leads: owner or admin deletes" on public.leads;
create policy "leads: owner or admin reads" on public.leads for select
  using (public.is_admin(auth.uid()) or (owner_id = auth.uid() and public.is_staff(auth.uid())));
create policy "leads: staff inserts own" on public.leads for insert
  with check (public.is_admin(auth.uid()) or (owner_id = auth.uid() and public.is_staff(auth.uid())));
-- Reps cannot hand their leads to someone else; only admins reassign.
create policy "leads: owner or admin updates" on public.leads for update
  using (public.is_admin(auth.uid()) or (owner_id = auth.uid() and public.is_staff(auth.uid())))
  with check (public.is_admin(auth.uid()) or owner_id = auth.uid());
create policy "leads: owner or admin deletes" on public.leads for delete
  using (public.is_admin(auth.uid()) or (owner_id = auth.uid() and public.is_staff(auth.uid())));

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists leads_touch on public.leads;
create trigger leads_touch before update on public.leads
  for each row execute procedure public.touch_updated_at();

-- Lead timeline: notes, calls, visits, status changes and signed contracts.
create table if not exists public.lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null default auth.uid(),
  kind text not null check (kind in ('note', 'call', 'visit', 'status', 'signed')),
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists lead_events_lead_idx on public.lead_events (lead_id, created_at desc);
alter table public.lead_events enable row level security;
drop policy if exists "lead_events: visible with lead" on public.lead_events;
drop policy if exists "lead_events: staff adds to visible lead" on public.lead_events;
-- The subquery runs under leads' own RLS, so events follow lead visibility.
create policy "lead_events: visible with lead" on public.lead_events for select
  using (exists (select 1 from public.leads l where l.id = lead_id));
create policy "lead_events: staff adds to visible lead" on public.lead_events for insert
  with check (user_id = auth.uid() and public.is_staff(auth.uid())
    and exists (select 1 from public.leads l where l.id = lead_id));

-- Which lead a signed agreement came from (for conversion tracking).
alter table public.client_agreements add column if not exists lead_id uuid references public.leads (id) on delete set null;

-- ============================================================
-- 15. Sales team = admins; super admins track sales performance
-- ============================================================
-- Existing projects: run just this section in the SQL Editor. It is safe to
-- re-run.
--
-- Everyone on staff ("admin" or "sales") now has full admin access: tuk-tuks,
-- ads, drivers, statistics, clients, contracts. On top of that, super admins
-- (the three management accounts below) are the only ones who can add, edit,
-- deactivate or delete staff, and see the sales performance page and the
-- staff activity log.

alter table public.profiles add column if not exists super_admin boolean not null default false;
update public.profiles set super_admin = true, role = 'admin'
  where lower(email) in ('info@digitalsolutionssa.co.za', 'jaco@agilegas.co.za', 'refiloe@agilegas.co.za', 'rephiloe@agilegas.co.za');

create or replace function public.is_admin(uid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = uid and role in ('admin', 'sales') and active); $$;

create or replace function public.is_super_admin(uid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = uid and super_admin and active); $$;

-- Only super admins edit profiles (roles, targets, active flag).
drop policy if exists "profiles: admin updates" on public.profiles;
create policy "profiles: admin updates" on public.profiles for update
  using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

-- Online periods: your own, or everyone's for super admins.
drop policy if exists "staff_sessions: own or admin reads" on public.staff_sessions;
create policy "staff_sessions: own or admin reads" on public.staff_sessions for select
  using (user_id = auth.uid() or public.is_super_admin(auth.uid()));

-- Activity log: sign-ins, sign-outs, customers added, contracts signed, ads
-- loaded. Written only by the functions/triggers below; read by super admins.
create table if not exists public.staff_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  -- Kept so the log still reads correctly after a person is deleted.
  actor_name text,
  action text not null,
  summary text not null,
  entity_type text,
  entity_id text,
  created_at timestamptz not null default now()
);
create index if not exists staff_activity_created_idx on public.staff_activity (created_at desc);
create index if not exists staff_activity_user_idx on public.staff_activity (user_id, created_at desc);
alter table public.staff_activity enable row level security;
drop policy if exists "staff_activity: super admin reads" on public.staff_activity;
create policy "staff_activity: super admin reads" on public.staff_activity for select
  using (public.is_super_admin(auth.uid()));

create or replace function public.log_staff_activity(
  p_action text, p_summary text, p_entity_type text default null, p_entity_id text default null
)
returns void language plpgsql security definer set search_path = public
as $$
declare v_name text;
begin
  if auth.uid() is null or not public.is_staff(auth.uid()) then return; end if;
  select coalesce(display_name, username, email) into v_name from public.profiles where id = auth.uid();
  insert into public.staff_activity (user_id, actor_name, action, summary, entity_type, entity_id)
    values (auth.uid(), v_name, p_action, p_summary, p_entity_type, p_entity_id);
end;
$$;
-- Internal only: called from the triggers and RPCs below, never from the app.
revoke execute on function public.log_staff_activity(text, text, text, text) from public, anon, authenticated;

-- Called by the app right after a successful sign-in.
create or replace function public.staff_sign_in()
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_staff(auth.uid()) then return; end if;
  update public.staff_sessions set ended_at = last_seen_at where user_id = auth.uid() and ended_at is null;
  insert into public.staff_sessions (user_id) values (auth.uid());
  update public.profiles set last_seen_at = now() where id = auth.uid();
  perform public.log_staff_activity('sign_in', 'Signed in');
end;
$$;

create or replace function public.staff_sign_out()
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.staff_sessions set ended_at = now(), last_seen_at = now()
    where user_id = auth.uid() and ended_at is null;
  perform public.log_staff_activity('sign_out', 'Signed out');
end;
$$;

revoke execute on function public.staff_sign_in() from public, anon;
revoke execute on function public.staff_sign_out() from public, anon;
grant execute on function public.staff_sign_in() to authenticated;
grant execute on function public.staff_sign_out() to authenticated;

create or replace function public.trg_log_staff_activity()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_client text;
begin
  if TG_TABLE_NAME = 'clients' then
    perform public.log_staff_activity('client_added',
      'Added customer ' || coalesce(new.company_name, new.legal_name), 'client', new.id::text);
  elsif TG_TABLE_NAME = 'client_agreements' then
    select coalesce(company_name, legal_name) into v_client from public.clients where id = new.client_id;
    perform public.log_staff_activity('contract_signed',
      'Signed contract with ' || coalesce(v_client, 'a customer')
        || coalesce(' · R' || to_char(new.monthly_fee, 'FM999G999G990D00') || '/month', ''),
      'client', new.client_id::text);
  elsif TG_TABLE_NAME = 'leads' then
    if TG_OP = 'INSERT' then
      perform public.log_staff_activity('lead_added', 'Added lead ' || new.business_name, 'lead', new.id::text);
    elsif new.status is distinct from old.status then
      perform public.log_staff_activity('lead_status',
        new.business_name || ': ' || old.status || ' → ' || new.status, 'lead', new.id::text);
    end if;
  elsif TG_TABLE_NAME = 'creatives' then
    if TG_OP = 'INSERT' then
      perform public.log_staff_activity('ad_uploaded',
        'Uploaded ad "' || new.title || '"' || coalesce(' for ' || new.advertiser_name, ''), 'ad', new.id::text);
    elsif TG_OP = 'DELETE' then
      perform public.log_staff_activity('ad_deleted', 'Deleted ad "' || old.title || '"', 'ad', old.id::text);
      return old;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists clients_activity on public.clients;
create trigger clients_activity after insert on public.clients
  for each row execute procedure public.trg_log_staff_activity();
drop trigger if exists client_agreements_activity on public.client_agreements;
create trigger client_agreements_activity after insert on public.client_agreements
  for each row execute procedure public.trg_log_staff_activity();
drop trigger if exists leads_activity on public.leads;
create trigger leads_activity after insert or update of status on public.leads
  for each row execute procedure public.trg_log_staff_activity();
drop trigger if exists creatives_activity on public.creatives;
create trigger creatives_activity after insert or delete on public.creatives
  for each row execute procedure public.trg_log_staff_activity();

-- Ad assignments: one row per "put live" action is enough, so log the
-- per-tuk-tuk / per-group inserts as a single line per statement.
create or replace function public.trg_log_ad_assignment()
returns trigger language plpgsql security definer set search_path = public
as $$
declare r record;
begin
  for r in
    select c.id, c.title, count(*) as n from new_rows nr join public.creatives c on c.id = nr.ad_id group by c.id, c.title
  loop
    perform public.log_staff_activity('ad_assigned',
      'Put ad "' || r.title || '" live on ' || r.n || ' ' ||
        case when TG_TABLE_NAME = 'ad_group_assignments' then 'group' else 'tuk-tuk' end ||
        case when r.n = 1 then '' else 's' end,
      'ad', r.id::text);
  end loop;
  return null;
end;
$$;
drop trigger if exists ad_assignments_activity on public.ad_assignments;
create trigger ad_assignments_activity after insert on public.ad_assignments
  referencing new table as new_rows for each statement execute procedure public.trg_log_ad_assignment();
drop trigger if exists ad_group_assignments_activity on public.ad_group_assignments;
create trigger ad_group_assignments_activity after insert on public.ad_group_assignments
  referencing new table as new_rows for each statement execute procedure public.trg_log_ad_assignment();

-- ============================================================
-- 16. Main admins vs sales people; commissions and finance
-- ============================================================
-- Existing projects: run just this section in the SQL Editor. It is safe to
-- re-run.
--
-- Sales people: pitch, add leads, sign up customers, sign and send contracts,
-- load ads for customers and choose which areas (groups) they show in,
-- statistics, preview player. They can't delete leads, customers, contracts
-- or ads, and can't change the fleet.
-- Main admins (super admins): everything sales people can do, plus the sales
-- team, logs, commission structures, finance (earnings, costs, payouts) and
-- tuk-tuks / areas.

-- Tuk-tuks and areas: main admins only.
drop policy if exists "tuktuks: admin manages" on public.tuktuks;
drop policy if exists "tuktuks: admin updates" on public.tuktuks;
drop policy if exists "tuktuks: admin deletes" on public.tuktuks;
create policy "tuktuks: admin manages" on public.tuktuks for insert with check (public.is_super_admin(auth.uid()));
create policy "tuktuks: admin updates" on public.tuktuks for update
  using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));
create policy "tuktuks: admin deletes" on public.tuktuks for delete using (public.is_super_admin(auth.uid()));

drop policy if exists "tuktuk_groups: admin inserts" on public.tuktuk_groups;
drop policy if exists "tuktuk_groups: admin updates" on public.tuktuk_groups;
drop policy if exists "tuktuk_groups: admin deletes" on public.tuktuk_groups;
create policy "tuktuk_groups: admin inserts" on public.tuktuk_groups for insert with check (public.is_super_admin(auth.uid()));
create policy "tuktuk_groups: admin updates" on public.tuktuk_groups for update using (public.is_super_admin(auth.uid()));
create policy "tuktuk_groups: admin deletes" on public.tuktuk_groups for delete using (public.is_super_admin(auth.uid()));

-- Ads go live by area (group). Per-tuk-tuk placement, marquee, sidebar ads,
-- packages and drivers have no screens in the app any more: main admins only.
drop policy if exists "ad_assignments: admin manages" on public.ad_assignments;
drop policy if exists "ad_assignments: admin updates" on public.ad_assignments;
drop policy if exists "ad_assignments: admin deletes" on public.ad_assignments;
create policy "ad_assignments: admin manages" on public.ad_assignments for insert with check (public.is_super_admin(auth.uid()));
create policy "ad_assignments: admin updates" on public.ad_assignments for update using (public.is_super_admin(auth.uid()));
create policy "ad_assignments: admin deletes" on public.ad_assignments for delete using (public.is_super_admin(auth.uid()));

drop policy if exists "marquee_messages: admin inserts" on public.marquee_messages;
drop policy if exists "marquee_messages: admin updates" on public.marquee_messages;
drop policy if exists "marquee_messages: admin deletes" on public.marquee_messages;
create policy "marquee_messages: admin inserts" on public.marquee_messages for insert with check (public.is_super_admin(auth.uid()));
create policy "marquee_messages: admin updates" on public.marquee_messages for update using (public.is_super_admin(auth.uid()));
create policy "marquee_messages: admin deletes" on public.marquee_messages for delete using (public.is_super_admin(auth.uid()));

drop policy if exists "tuktuk_sidebar_ads: admin inserts" on public.tuktuk_sidebar_ads;
drop policy if exists "tuktuk_sidebar_ads: admin updates" on public.tuktuk_sidebar_ads;
drop policy if exists "tuktuk_sidebar_ads: admin deletes" on public.tuktuk_sidebar_ads;
create policy "tuktuk_sidebar_ads: admin inserts" on public.tuktuk_sidebar_ads for insert with check (public.is_super_admin(auth.uid()));
create policy "tuktuk_sidebar_ads: admin updates" on public.tuktuk_sidebar_ads for update using (public.is_super_admin(auth.uid()));
create policy "tuktuk_sidebar_ads: admin deletes" on public.tuktuk_sidebar_ads for delete using (public.is_super_admin(auth.uid()));

drop policy if exists "sales_packages: admin manages" on public.sales_packages;
create policy "sales_packages: admin manages" on public.sales_packages for all
  using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

drop policy if exists "drivers: admin reads" on public.drivers;
drop policy if exists "drivers: admin inserts" on public.drivers;
drop policy if exists "drivers: admin updates" on public.drivers;
drop policy if exists "drivers: admin deletes" on public.drivers;
create policy "drivers: admin reads" on public.drivers for select using (public.is_super_admin(auth.uid()));
create policy "drivers: admin inserts" on public.drivers for insert with check (public.is_super_admin(auth.uid()));
create policy "drivers: admin updates" on public.drivers for update using (public.is_super_admin(auth.uid()));
create policy "drivers: admin deletes" on public.drivers for delete using (public.is_super_admin(auth.uid()));

-- Nothing a sales person adds can be deleted by them.
drop policy if exists "leads: owner or admin deletes" on public.leads;
create policy "leads: owner or admin deletes" on public.leads for delete using (public.is_super_admin(auth.uid()));
drop policy if exists "clients: admin deletes" on public.clients;
create policy "clients: admin deletes" on public.clients for delete using (public.is_super_admin(auth.uid()));
drop policy if exists "client_agreements: admin deletes" on public.client_agreements;
create policy "client_agreements: admin deletes" on public.client_agreements for delete using (public.is_super_admin(auth.uid()));
drop policy if exists "creatives: admin deletes" on public.creatives;
create policy "creatives: admin deletes" on public.creatives for delete using (public.is_super_admin(auth.uid()));
drop policy if exists "creative-media: admin deletes" on storage.objects;
create policy "creative-media: admin deletes" on storage.objects for delete
  using (bucket_id = 'creative-media' and public.is_super_admin(auth.uid()));
drop policy if exists "signed-contracts: admin deletes" on storage.objects;
create policy "signed-contracts: admin deletes" on storage.objects for delete
  using (bucket_id = 'signed-contracts' and public.is_super_admin(auth.uid()));

-- Which customer an ad was loaded for.
alter table public.creatives add column if not exists client_id uuid references public.clients (id) on delete set null;

-- Commission structures. A structure pays either a percentage of the contract's
-- monthly fee or a flat amount, for each of the first `months` months of the contract.
create table if not exists public.commission_structures (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('percent', 'flat')),
  rate numeric(12, 2) not null check (rate >= 0),
  months int not null default 1 check (months between 1 and 60),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.commission_structures enable row level security;
drop policy if exists "commission_structures: main admins" on public.commission_structures;
create policy "commission_structures: main admins" on public.commission_structures for all
  using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

alter table public.profiles add column if not exists commission_structure_id uuid
  references public.commission_structures (id) on delete set null;

-- Each contract keeps the commission terms in force when it was signed, so
-- later changes to a structure never rewrite past earnings.
alter table public.client_agreements add column if not exists commission_structure_id uuid
  references public.commission_structures (id) on delete set null;
alter table public.client_agreements add column if not exists commission_kind text check (commission_kind in ('percent', 'flat'));
alter table public.client_agreements add column if not exists commission_rate numeric(12, 2);
alter table public.client_agreements add column if not exists commission_months int;
-- Set by a main admin when a customer stops advertising; earnings stop after it.
alter table public.client_agreements add column if not exists ended_on date;

create or replace function public.trg_agreement_commission()
returns trigger language plpgsql security definer set search_path = public
as $$
declare cs record;
begin
  select s.* into cs from public.profiles p join public.commission_structures s on s.id = p.commission_structure_id
    where p.id = new.created_by;
  -- Always taken from the signer's structure, never from what the app sends.
  if found then
    new.commission_structure_id := cs.id;
    new.commission_kind := cs.kind;
    new.commission_rate := cs.rate;
    new.commission_months := cs.months;
  else
    new.commission_structure_id := null;
    new.commission_kind := null;
    new.commission_rate := null;
    new.commission_months := null;
  end if;
  new.ended_on := null;
  return new;
end;
$$;
drop trigger if exists client_agreements_commission on public.client_agreements;
create trigger client_agreements_commission before insert on public.client_agreements
  for each row execute procedure public.trg_agreement_commission();

-- Sales people may update their own contracts (e.g. when it is emailed), but only
-- main admins can touch the commission terms or end a contract.
create or replace function public.trg_agreement_guard()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_super_admin(auth.uid()) and (
    new.commission_structure_id is distinct from old.commission_structure_id
    or new.commission_kind is distinct from old.commission_kind
    or new.commission_rate is distinct from old.commission_rate
    or new.commission_months is distinct from old.commission_months
    or new.ended_on is distinct from old.ended_on
    or new.monthly_fee is distinct from old.monthly_fee
    or new.created_by is distinct from old.created_by
  ) then
    raise exception 'Only main admins can change commission, fees or end dates on a contract.';
  end if;
  return new;
end;
$$;
drop trigger if exists client_agreements_guard on public.client_agreements;
create trigger client_agreements_guard before update on public.client_agreements
  for each row execute procedure public.trg_agreement_guard();

-- Commission paid out to sales people.
create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  amount numeric(12, 2) not null check (amount > 0),
  paid_on date not null default current_date,
  note text,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists payouts_user_idx on public.payouts (user_id, paid_on desc);
alter table public.payouts enable row level security;
drop policy if exists "payouts: main admins" on public.payouts;
create policy "payouts: main admins" on public.payouts for all
  using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

-- Running costs (fuel, data, driver fees, printing, ...), per month.
create table if not exists public.costs (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  category text not null,
  description text,
  amount numeric(12, 2) not null check (amount > 0),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists costs_month_idx on public.costs (month);
alter table public.costs enable row level security;
drop policy if exists "costs: main admins" on public.costs;
create policy "costs: main admins" on public.costs for all
  using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

-- ============================================================
-- 17. Ad length follows the customer's package
-- ============================================================
-- Existing projects: run just this section in the SQL Editor. It is safe to
-- re-run.
--
-- Standard (R950) = 5 seconds per play, Premium (R1,450) = 10 seconds.
-- Sales people must load every ad for a signed customer, and its length is
-- set from that customer's package. Main admins choose the length themselves.

-- Package from the notes ("Standard…" / "Premium…"), otherwise the one-area fee.
-- Uses the newest agreement that hasn't ended. Keep in sync with src/lib/adPackage.ts.
create or replace function public.package_ad_seconds(client_id_param uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case
    when a.package_notes ilike '%premium%' then 10
    when a.package_notes ilike '%standard%' then 5
    when a.monthly_fee is null then null
    when a.monthly_fee - 100 * greatest(
      cardinality(a.areas) + case when coalesce(trim(a.other_area), '') <> '' then 1 else 0 end - 1, 0
    ) >= 1200 then 10
    else 5
  end
  from public.client_agreements a
  where a.client_id = client_id_param
  order by (a.ended_on is null) desc, a.signed_at desc
  limit 1;
$$;

create or replace function public.trg_creatives_package_length()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seconds int;
begin
  -- Main admins, and the SQL editor / service role (no signed-in user), pick freely.
  if auth.uid() is null or public.is_super_admin(auth.uid()) then
    return new;
  end if;
  -- Leave older ads alone when a sales person only changes something else (e.g. dates).
  if TG_OP = 'UPDATE'
     and new.client_id is not distinct from old.client_id
     and new.duration_seconds = old.duration_seconds then
    return new;
  end if;
  if new.client_id is null then
    raise exception 'Choose the signed customer this ad is for.';
  end if;
  v_seconds := public.package_ad_seconds(new.client_id);
  if v_seconds is null then
    raise exception 'Can''t tell from this customer''s contract whether they''re on Standard or Premium — ask management to load the ad.';
  end if;
  new.duration_seconds := v_seconds;
  return new;
end;
$$;

drop trigger if exists creatives_package_length on public.creatives;
create trigger creatives_package_length before insert or update on public.creatives
  for each row execute procedure public.trg_creatives_package_length();

-- ============================================================
-- 18. Video is Premium only, cut off at 10 seconds
-- ============================================================
-- Existing projects: run just this section in the SQL Editor. It is safe to
-- re-run.
--
-- Applies to everyone, main admins included: a video can't be loaded for a
-- Standard customer, and every video is saved as 10 seconds (the player stops
-- it there however long the file is). Runs after section 17's trigger
-- ("creatives_package_length" < "creatives_video_premium" alphabetically).
-- Keep in sync with VIDEO_MAX_SECONDS in src/lib/adPackage.ts.
create or replace function public.trg_creatives_video_premium()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.media_type <> 'video' then
    return new;
  end if;
  -- The SQL editor / service role (no signed-in user) can do anything.
  if auth.uid() is not null
     and new.client_id is not null
     and public.package_ad_seconds(new.client_id) = 5 then
    raise exception 'Video is only available on the Premium package — this customer is on Standard, so please load an image.';
  end if;
  new.duration_seconds := 10;
  return new;
end;
$$;

drop trigger if exists creatives_video_premium on public.creatives;
create trigger creatives_video_premium before insert or update on public.creatives
  for each row execute procedure public.trg_creatives_video_premium();
