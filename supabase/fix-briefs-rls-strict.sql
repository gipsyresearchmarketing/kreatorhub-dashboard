-- ============================================================================
-- Fix: briefs policy terlalu permissive (allow semua authenticated user read)
-- + tambah progress admin SELECT policy (yg gak ada sebelumnya)
-- Setelah Run: admin brand cuma liat brief + progress brand-nya
-- ============================================================================

-- 1. Drop policy "briefs read all auth" (gak filter brand)
drop policy if exists "briefs read all auth" on public.briefs;

-- 2. Create policy baru: briefs SELECT filter by brand_access
create policy "briefs read all auth" on public.briefs
  for select using (public.is_super_admin() OR public.has_brand_access(brand));

-- 3. Tambah progress admin SELECT policy (yg gak ada di schema.sql)
drop policy if exists "progress admin read" on public.progress;
create policy "progress admin read" on public.progress
  for select using (
    public.is_super_admin() OR
    public.has_brand_access((select brand from public.briefs where id = progress.brief_id))
  );
-- Catatan: progress.brand juga ada (di-set saat upload), jadi lebih simple:
-- public.is_super_admin() OR public.has_brand_access(brand)
-- Tapi kita join ke briefs via brief_id untuk konsistensi.

-- 4. Verifikasi policies briefs + progress
select tablename, policyname, cmd, left(qual, 80) as using_clause
  from pg_policies
 where tablename in ('briefs', 'progress')
 order by tablename, policyname;