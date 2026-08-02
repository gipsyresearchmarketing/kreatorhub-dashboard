-- ============================================================================
-- Fix: admin bisa INSERT/UPDATE brief_scripts untuk kreator apapun
-- Tanpa policy ini, admin tidak bisa pre-populate script untuk kreator
-- (mis. briefing yang admin sudah siapkan script-nya sendiri).
-- Kreator self upsert/update/delete tetap ada (gak ke-replace).
-- ============================================================================

-- Admin: INSERT row brief_scripts untuk kreator apapun
drop policy if exists "brief_scripts admin insert" on public.brief_scripts;
create policy "brief_scripts admin insert" on public.brief_scripts
  for insert
  to authenticated
  with check (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

-- Verifikasi policies di brief_scripts
select policyname, cmd
  from pg_policies
 where tablename = 'brief_scripts'
 order by policyname;
-- Expected: admin delete, admin insert, admin read all, admin update,
--           kreator self delete, kreator self read, kreator self update, kreator self upsert