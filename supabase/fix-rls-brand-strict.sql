-- ============================================================================
-- Fix RLS strict brand_access: admin brand cuma akses brand-nya
-- Sebelumnya qualifier cuma 'is_super_admin()' → admin brand bisa lihat semua brand
-- Sekarang: is_super_admin() sees all, admin brand cuma akses brand_access-nya
-- Kreator sees own (kreator policy udah ada)
-- ============================================================================

begin;

-- 1. briefs: admin perlu has_brand_access(brand)
drop policy if exists "briefs admin write" on public.briefs;
create policy "briefs admin write" on public.briefs
  for all
  to authenticated
  using (
    public.is_super_admin()
    or public.has_brand_access(brand)
  )
  with check (
    public.is_super_admin()
    or public.has_brand_access(brand)
  );

-- 2. progress: admin update (sebelumnya filter via brief.brand)
drop policy if exists "progress admin update" on public.progress;
create policy "progress admin update" on public.progress
  for update
  to authenticated
  using (
    public.is_super_admin()
    or public.has_brand_access(
      (select brand from public.briefs where id = progress.brief_id)
    )
  );

-- 3. payments: admin perlu has_brand_access(brand)
drop policy if exists "payments admin write" on public.payments;
create policy "payments admin write" on public.payments
  for all
  to authenticated
  using (
    public.is_super_admin()
    or public.has_brand_access(brand)
  )
  with check (
    public.is_super_admin()
    or public.has_brand_access(brand)
  );

-- 4. payment_proofs: admin perlu has_brand_access via payments.brand
drop policy if exists "payment_proofs admin all" on public.payment_proofs;
create policy "payment_proofs admin all" on public.payment_proofs
  for all
  to authenticated
  using (
    public.is_super_admin()
    or public.has_brand_access(
      (select brand from public.payments where id = payment_proofs.payment_id)
    )
  )
  with check (
    public.is_super_admin()
    or public.has_brand_access(
      (select brand from public.payments where id = payment_proofs.payment_id)
    )
  );

-- 5. profiles admin read all — kalau ke-revert jadi 'is_super_admin()' only, fix ke 'is_super_admin() OR is_admin()'
-- (drop placeholder; kita re-create if missing)
drop policy if exists "profiles admin read all" on public.profiles;
create policy "profiles admin read all" on public.profiles
  for select
  to authenticated
  using (public.is_super_admin() or public.is_admin());

commit;

-- 6. Verifikasi
select tablename, policyname, cmd
  from pg_policies
 where tablename in ('briefs', 'progress', 'payments', 'payment_proofs', 'profiles')
   and policyname in ('briefs admin write', 'progress admin update', 'payments admin write', 'payment_proofs admin all', 'profiles admin read all')
 order by tablename;