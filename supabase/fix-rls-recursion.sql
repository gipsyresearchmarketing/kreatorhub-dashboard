-- ============================================================================
-- Fix RLS infinite recursion + buka profiles untuk semua admin (supaya admin
-- brand bisa lihat SEMUA kreator untuk assignment)
-- Idempotent — aman run berulang. Jalanin sekali di Supabase → SQL Editor.
-- ============================================================================

-- 1. profiles admin read all
--    Sebelumnya: pake (select role from profiles WHERE id = auth.uid()) = 'admin'
--    → infinite recursion. Fix: pake function is_admin() (SECURITY DEFINER, aman).
--    Sekarang: super admin ATAU admin (semua role admin) bisa SELECT semua profiles.
drop policy if exists "profiles admin read all" on public.profiles;
create policy "profiles admin read all" on public.profiles
  for select using (public.is_super_admin() OR public.is_admin());

-- 2. profiles self read — biar user bisa lihat row sendiri sendiri (sudah ada di schema.sql,
--    tapi redefine biar idempotent & gak conflict)
drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read" on public.profiles
  for select using (auth.uid() = id);

-- 3. briefs admin write — admin lihat/edit brief brand-nya aja (atau semua kalo super admin)
drop policy if exists "briefs admin write" on public.briefs;
create policy "briefs admin write" on public.briefs
  for all using (
    public.is_super_admin() OR public.has_brand_access(brand)
  ) with check (
    public.is_super_admin() OR public.has_brand_access(brand)
  );

-- 4. progress admin update — admin update progress brief di brand-nya
drop policy if exists "progress admin update" on public.progress;
create policy "progress admin update" on public.progress
  for update using (
    public.is_super_admin() OR
    public.has_brand_access((select brand from public.briefs where id = progress.brief_id))
  );

-- 5. payments admin write — admin CRUD payment brand-nya
drop policy if exists "payments admin write" on public.payments;
create policy "payments admin write" on public.payments
  for all using (
    public.is_super_admin() OR public.has_brand_access(brand)
  ) with check (
    public.is_super_admin() OR public.has_brand_access(brand)
  );

-- 6. payments own read — kreator bisa read payment sendiri
drop policy if exists "payments own read" on public.payments;
create policy "payments own read" on public.payments
  for select using (
    public.is_super_admin() OR
    auth.uid() = (select id from public.profiles where username = payments.kreator limit 1)
  );

-- 7. payment_proofs admin all — admin CRUD bukti bayar payment di brand-nya
drop policy if exists "payment_proofs admin all" on public.payment_proofs;
create policy "payment_proofs admin all" on public.payment_proofs
  for all using (
    public.is_super_admin() OR
    public.has_brand_access((select brand from public.payments where id = payment_proofs.payment_id))
  ) with check (
    public.is_super_admin() OR
    public.has_brand_access((select brand from public.payments where id = payment_proofs.payment_id))
  );

-- 8. Verifikasi policies aktif
select tablename, policyname, cmd
  from pg_policies
 where tablename in ('profiles', 'briefs', 'progress', 'payments', 'payment_proofs')
 order by tablename, policyname;