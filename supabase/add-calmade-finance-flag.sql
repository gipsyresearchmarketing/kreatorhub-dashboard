-- ============================================================================
-- Aktifkan is_finance untuk semua brand admin
-- Setiap brand punya finance admin sendiri-sendiri:
--   - Putri      → finance Gipsy Research
--   - CalmadeAI  → finance CalmadeAI
--   - Jamuzen    → finance Jamuzen
--   - Convictio  → finance Convictio.id
--
-- Setelah Run: masing-masing brand admin bisa:
--   - klik "Tandai bayar" di fee panel untuk brand-nya
--   - upload bukti transfer
--   - kirim WA notif ke kreator penerima
--
-- Cross-brand tetap ga bisa: Calmade admin gabisa acc fee Gipsy, dst.
-- (gate is_finance=true + RLS filter by brand_access udah handle ini
--  di frontend: renderFeeRow sembunyiin tombol "Tandai bayar" buat
--  admin yang brand-nya di-scope lain, kecuali finance=true.)
--
-- Verify:
--   select username, display_name, brand_access, is_finance
--     from public.profiles
--    where username in ('putri', 'calmadeai', 'jamuzen', 'convictio')
--    order by username;
-- Expected: 4 rows, is_finance=true semuanya
-- ============================================================================

update public.profiles
   set is_finance = true
 where username in ('calmadeai', 'jamuzen', 'convictio')
   and is_finance is distinct from true;

-- Verify
select username, display_name, role, brand_access, is_finance
  from public.profiles
 where username in ('putri', 'calmadeai', 'jamuzen', 'convictio')
 order by username;