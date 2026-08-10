-- ============================================================================
-- Aktifkan is_finance untuk Calmade admin
-- Calmade admin (calmadeai@gmail.com / username 'calmadeai') butuh bisa
-- acc fee + upload bukti transfer untuk brand CalmadeAI. Sebelumnya cuma
-- Putri yg punya is_finance=true.
--
-- Setelah Run: Calmade admin bisa:
--   - klik "Tandai bayar" di fee panel
--   - upload bukti transfer
--   - kirim WA notif ke kreator penerima
--
-- Cara verify:
--   select username, is_finance from public.profiles
--    where username in ('putri', 'calmadeai');
-- Expected: 2 rows, is_finance=true dua-duanya
-- ============================================================================

update public.profiles
   set is_finance = true
 where username = 'calmadeai'
   and is_finance is distinct from true;

-- Verify
select username, display_name, role, brand_access, is_finance
  from public.profiles
 where username in ('putri', 'calmadeai')
 order by username;