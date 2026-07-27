-- ============================================================================
-- Admin multi-brand: kolom is_super_admin, brand_access, is_approved + helpers + RLS
-- Self-signup admin: handle_new_user trigger deteksi requested_role
-- Jalanin SEKALI di Supabase → SQL Editor → New query → Run
-- ============================================================================

-- 1. Kolom baru di profiles
alter table public.profiles add column if not exists is_super_admin boolean default false;
alter table public.profiles add column if not exists brand_access text[] default '{}';
alter table public.profiles add column if not exists is_approved boolean default true;

create index if not exists profiles_super_admin_idx on public.profiles(is_super_admin) where is_super_admin = true;
create index if not exists profiles_brand_access_idx on public.profiles using gin(brand_access);

-- 2. Helper DB (mirror is_admin/is_finance)
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select is_super_admin = true from public.profiles where id = auth.uid()), false) $$;

create or replace function public.has_brand_access(target_brand text)
returns boolean language sql stable security definer set search_path to public
as $$
  select coalesce(
    (select is_super_admin = true OR target_brand = ANY(brand_access) from public.profiles where id = auth.uid()),
    false
  )
$$;

-- 3. Set akun existing
--    Bagas jadi super admin (akses semua brand)
update public.profiles
   set is_super_admin = true, is_approved = true
 where username = 'marketinggipsyresearch';

--    Putri jadi admin Gipsy Research
update public.profiles
   set is_super_admin = false,
       brand_access = array['Gipsy Research'],
       is_approved = true
 where username = 'putri';

--    Admin brand lain (Petra/Praja/Sendi) — bikin akun dulu di Supabase Auth Dashboard,
--    trus uncomment + sesuaikan username di bawah. Default: butuh verifikasi manual.
-- update public.profiles set is_super_admin = false, brand_access = array['CalmadeAI'], is_approved = true where username = 'petra';
-- update public.profiles set is_super_admin = false, brand_access = array['Jamuzen'],   is_approved = true where username = 'praja';
-- update public.profiles set is_super_admin = false, brand_access = array['Convictio.id'],  is_approved = true where username = 'sendi';

-- 4. Update handle_new_user trigger (sudah ada di schema.sql, recreate untuk pick up function baru)
--    PENTING: trigger ini ngebaca raw_user_meta_data->>'requested_role' dari signup form
--    (kreator vs admin). Admin baru otomatis is_approved=false (perlu verifikasi Bagas).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  uname text;
  dname text;
  req_role text;
  is_admin boolean;
begin
  uname := split_part(new.email, '@', 1);
  uname := regexp_replace(uname, '[^a-zA-Z0-9._-]', '-', 'g');
  while exists (select 1 from public.profiles where username = uname) loop
    uname := uname || floor(random() * 1000)::text;
  end loop;
  dname := coalesce(new.raw_user_meta_data->>'display_name', uname);
  req_role := coalesce(new.raw_user_meta_data->>'requested_role', 'kreator');
  is_admin := (req_role = 'admin');
  insert into public.profiles (id, username, role, display_name, is_approved)
  values (
    new.id,
    uname,
    case when is_admin then 'admin' else 'kreator' end,
    dname,
    case when is_admin then false else true end   -- admin → perlu approval Bagas, kreator → auto-approved
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5. Update RLS — admin lihat data sesuai brand_access (atau semua kalo super admin)
--    Kreator policy GAK diubah.

-- briefs: admin CRUD jika brand dalam akses-nya, atau super admin
drop policy if exists "briefs admin write" on public.briefs;
create policy "briefs admin write" on public.briefs
  for all using (public.has_brand_access(brand)) with check (public.has_brand_access(brand));

-- progress: admin update jika brand brief dalam akses-nya
drop policy if exists "progress admin update" on public.progress;
create policy "progress admin update" on public.progress
  for update using (
    public.is_super_admin() OR
    public.has_brand_access((select brand from public.briefs where id = progress.brief_id))
  );

-- payments: admin CRUD jika brand dalam akses-nya
drop policy if exists "payments admin write" on public.payments;
create policy "payments admin write" on public.payments
  for all using (
    public.is_super_admin() OR
    public.has_brand_access(brand)
  );

-- payment_proofs: admin CRUD jika brand payment dalam akses-nya
drop policy if exists "payment_proofs admin all" on public.payment_proofs;
create policy "payment_proofs admin all" on public.payment_proofs
  for all using (
    public.is_super_admin() OR
    public.has_brand_access((select brand from public.payments where id = payment_proofs.payment_id))
  );

-- profiles: admin baca semua (kreator udah ada self-read)
drop policy if exists "profiles admin read all" on public.profiles;
create policy "profiles admin read all" on public.profiles
  for select using (
    public.is_super_admin() OR
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

-- 6. Verifikasi
select username, role, is_super_admin, brand_access, is_approved
from public.profiles
where role = 'admin' or is_super_admin = true
order by is_super_admin desc, username;