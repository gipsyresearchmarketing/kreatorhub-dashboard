-- ============================================================================
-- 1) RLS untuk script_library (Library & Kalender Konten) — belum ada sebelumnya
-- 2) Setup akun admin busdev Gipsy Research
--
-- CARA PAKAI:
--   a. BIKIN AKUN DULU di Supabase → Authentication → Users → Add user
--      - Email:    busdevgipsyresearch@gmail.com
--      - Password: (pilih lo, trus simpen di password manager)
--      - centang "Auto Confirm User" supaya nggak perlu verifikasi email
--      (SQL di bawah HANYA jalan kalau akun-nya sudah ada di auth.users — makanya
--       profile-nya harus dibuat oleh trigger handle_new_user, atau insert manual.)
--
--   b. Jalankan file ini di SQL Editor → Run
--
-- Kenapa perlu RLS: script_library tadinya nggak punya policy sama sekali, artinya
-- semua user yang login (termasuk kreator!) bisa SELECT semua baris. Jadi tanpa ini,
-- "brand lain jangan kasih akses" nggak bisa dijamin di level database.
-- ============================================================================


-- ---- 1. RLS script_library ----
alter table public.script_library enable row level security;

-- Admin: baca semua row yang brand-nya dalam akses-nya (atau super admin).
-- Pakai has_brand_access() yg udah ada dari add-admin-brand-access.sql.
drop policy if exists "script_library admin read" on public.script_library;
create policy "script_library admin read" on public.script_library
  for select using (
    public.is_super_admin() OR public.has_brand_access(brand)
  );

-- Admin: tambah / ubah / hapus hanya row di brand akses-nya.
drop policy if exists "script_library admin write" on public.script_library;
create policy "script_library admin write" on public.script_library
  for all using (
    public.is_super_admin() OR public.has_brand_access(brand)
  ) with check (
    public.is_super_admin() OR public.has_brand_access(brand)
  );

-- Kreator: BACA semua script library (dipakai halaman kreator buat lihat contoh?).
-- Kalau kreator-SEHARUSNYA nggak boleh lihat library, hapus policy ini.
drop policy if exists "script_library kreator read" on public.script_library;
create policy "script_library kreator read" on public.script_library
  for select using (
    (select role from public.profiles where id = auth.uid()) = 'kreator'
    OR public.is_super_admin()
    OR public.has_brand_access(brand)
  );


-- ---- 2. Setup akun admin busdev ----
-- GANTI username di bawah kalau trigger handle_new_user bikin username berbeda.
-- Default: split_part(email,'@',1) = "busdevgipsyresearch".
-- Kalau trigger gak jalan / username-nya beda, cari dulu:
--   select username, role from public.profiles where email like '%busdev%';

update public.profiles
set role            = 'admin',
    is_super_admin  = false,
    brand_access    = array['Gipsy Research'],  -- HANYA Gipsy Research
    is_approved     = true,                     -- langsung approve, ga perlu verifikasi manual
    display_name    = coalesce(nullif(display_name, ''), 'Busdev Gipsy Research')
where username = 'busdevgipsyresearch';

-- Kalau username-nya ternyata "busdevgipsyresearch" tapi email-nya beda,
-- atau lo mau pake username custom, uncomment + sesuaikan:
-- update public.profiles
-- set role = 'admin', is_super_admin = false,
--     brand_access = array['Gipsy Research'], is_approved = true
-- where username = 'busdev';   -- <-- ganti


-- ---- 3. Verifikasi ----
-- Cek akun busdev:
select username, role, is_super_admin, brand_access, is_approved
from public.profiles
where role = 'admin'
order by is_super_admin desc, username;

-- Cek policy script_library udah aktif:
select policyname, cmd, qual
from pg_policies
where tablename = 'script_library'
order by policyname;