-- ============================================================================
-- Fix RLS infinite recursion: policies yg nge-subquery profiles.role ganti jadi
-- helper is_super_admin() OR has_brand_access() (gak recursive)
-- Jalanin sekali di Supabase → SQL Editor → New query → Run
-- ============================================================================

-- 1. profiles admin read all — sebelumnya: (select role from profiles...) = 'admin'
--    nge-trigger recursion. Fix: super admin sees all + self read udah ada.
drop policy if exists "profiles admin read all" on public.profiles;
create policy "profiles admin read all" on public.profiles
  for select using (public.is_super_admin());

-- 2. briefs admin write
drop policy if exists "briefs admin write" on public.briefs;
create policy "briefs admin write" on public.briefs
  for all using (
    public.is_super_admin() OR public.has_brand_access(brand)
  ) with check (
    public.is_super_admin() OR public.has_brand_access(brand)
  );

-- 3. progress admin update
drop policy if exists "progress admin update" on public.progress;
create policy "progress admin update" on public.progress
  for update using (
    public.is_super_admin() OR
    public.has_brand_access((select brand from public.briefs where id = progress.brief_id))
  );

-- 4. payments admin write
drop policy if exists "payments admin write" on public.payments;
create policy "payments admin write" on public.payments
  for all using (
    public.is_super_admin() OR public.has_brand_access(brand)
  ) with check (
    public.is_super_admin() OR public.has_brand_access(brand)
  );

-- 5. payment_proofs admin all
drop policy if exists "payment_proofs admin all" on public.payment_proofs;
create policy "payment_proofs admin all" on public.payment_proofs
  for all using (
    public.is_super_admin() OR
    public.has_brand_access((select brand from public.payments where id = payment_proofs.payment_id))
  ) with check (
    public.is_super_admin() OR
    public.has_brand_access((select brand from public.payments where id = payment_proofs.payment_id))
  );

-- 6. payments own read — sebelumnya: ngecek profiles, recursive. Fix: pake auth.uid() direct.
drop policy if exists "payments own read" on public.payments;
create policy "payments own read" on public.payments
  for select using (
    public.is_super_admin() OR
    auth.uid() = (select id from public.profiles where username = payments.kreator limit 1)
  );

-- 7. profiles self read — fix biar gak recursive juga (kalo sebelumnya pernah drop)
drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read" on public.profiles
  for select using (auth.uid() = id);

-- 8. Test: query profiles WHERE id = auth.uid() harusnya return 1 row (gak error recursion)
--    Catatan: query ini cuma jalan kalo dijalanin di SQL Editor sbg role yg punya akses.
--    Via REST API dengan anon key mungkin masih ditolak, tapi admin login akan jalan.
--    Verifikasi real: coba login di app setelah Run SQL ini.

-- 9. Verifikasi policies aktif
select tablename, policyname, cmd
  from pg_policies
 where tablename in ('profiles', 'briefs', 'progress', 'payments', 'payment_proofs')
 order by tablename, policyname;