-- ============================================================================
-- Fix: kreator kehilangan akses baca briefs setelah fix-briefs-rls-strict.sql
-- Policy "briefs read all auth" baru hanya izinkan super admin + admin brand.
-- Kreator harus bisa baca brief yang di-assign ke mereka (assigned_to = username)
-- atau brief terbuka (assigned_to IS NULL).
-- ============================================================================

-- Tambah policy kreator read: assigned_to = username ATAU assigned_to NULL
-- Multiple SELECT policies di-OR-kan di Postgres RLS.
drop policy if exists "briefs kreator read" on public.briefs;
create policy "briefs kreator read" on public.briefs
  for select
  to authenticated
  using (
    assigned_to = (select username from public.profiles where id = auth.uid())
    or assigned_to is null
  );

-- Verifikasi
select tablename, policyname, cmd, left(qual, 120) as using_clause
  from pg_policies
 where tablename = 'briefs'
 order by policyname;