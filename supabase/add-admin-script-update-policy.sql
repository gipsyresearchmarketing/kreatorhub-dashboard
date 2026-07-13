-- ============================================================================
-- Fix: admin bisa UPDATE brief_scripts (sebelumnya cuma kreator self-update)
-- Tanpa policy ini, auto-update quorum 3/5 → status 'approved'/'rejected'
-- di screens-admin-brief-detail.html gagal silently karena RLS deny.
-- ============================================================================

drop policy if exists "brief_scripts admin update" on public.brief_scripts;
create policy "brief_scripts admin update" on public.brief_scripts
  for update using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

drop policy if exists "brief_scripts admin delete" on public.brief_scripts;
create policy "brief_scripts admin delete" on public.brief_scripts
  for delete using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

-- Verifikasi: admin sekarang punya full read/write/delete di brief_scripts
-- (kreator tetap punya self read/upsert/update/delete policy yg udah ada)
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'brief_scripts'
ORDER BY policyname;
-- Expected: admin delete, admin read all, admin update, kreator self read,
--          kreator self upsert, kreator self update, kreator self delete