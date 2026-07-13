-- ============================================================================
-- Fix: tambah kolom kontak & rekening ke profiles biar kreator bisa simpan
-- email + nama bank + nomor rekening persisten di server.
--
-- Sebelumnya cuma `display_name` + `avatar` + `phone`. Field baru:
--   - email          (untuk newsletter/backup notifikasi)
--   - bank_name      (BCA / Mandiri / BNI / etc.)
--   - bank_account   (nomor rekening buat transfer fee)
--
-- Idempotent: ALTER ... ADD COLUMN IF NOT EXISTS aman re-run.
-- ============================================================================

alter table public.profiles
  add column if not exists email text,
  add column if not exists bank_name text,
  add column if not exists bank_account text;

-- Verify struktur
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;
-- Expected (sesudah run): id, username, role, display_name, avatar, phone,
--                         created_at, email, bank_name, bank_account