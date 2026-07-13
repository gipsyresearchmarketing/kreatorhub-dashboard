-- ============================================================================
-- Verify + Re-enable Realtime publications untuk kreatorhub dashboard
-- Run di Supabase → SQL Editor.
--
-- Cek tabel mana yang sudah ke-publish ke 'supabase_realtime'.
-- Kalau ada yang ilang, ALTER publication di-bawah ini akan ADD-kan balik.
-- (Supabase: ALTER PUBLICATION ... ADD TABLE bersifat idempotent untuk add,
--  tapi saya pakai IF NOT EXISTS pattern supaya aman re-run.)
-- ============================================================================

-- 1. Cek state publication saat ini
SELECT tablename AS currently_in_publication
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN ('briefs', 'brief_scripts', 'approvals', 'payment_proofs', 'progress', 'history', 'payments')
ORDER BY tablename;

-- Expected output (kalau sehat):
--   approvals
--   brief_scripts
--   briefs
--   payment_proofs
--   progress
-- (history & payments ga dipublish, soalnya ga ada realtime subscription di client)

-- 2. Re-enable untuk 3 tabel yang subscription-nya ada di client.
--    DROP dulu (kalau ada), lalu ADD — supaya bersih dari duplicate entry.
DO $$
DECLARE
  t text;
  missing_tables text[] := ARRAY['brief_scripts', 'approvals', 'payment_proofs'];
BEGIN
  FOREACH t IN ARRAY missing_tables LOOP
    -- Drop kalau ada (idempotent)
    EXECUTE format('alter publication supabase_realtime drop table if exists public.%I', t);
    -- Re-add
    EXECUTE format('alter publication supabase_realtime add table public.%I', t);
    RAISE NOTICE 'Re-published: public.%', t;
  END LOOP;
END $$;

-- 3. Verify ulang — harusnya 3 row sekarang
SELECT tablename AS after_fix
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN ('brief_scripts', 'approvals', 'payment_proofs')
ORDER BY tablename;
-- Expected: 3 rows

-- ============================================================================
-- Kalau setelah ini realtime masih bermasalah:
--   1. Buka browser DevTools → Console
--   2. Liat log "[realtime] brief_scripts status:" — biasanya 'SUBSCRIBED' atau 'CHANNEL_ERROR'
--   3. Kalau 'CHANNEL_ERROR' → publication ini bener-bener ilang. Cek Dashboard →
--      Database → Replication → lihat publication 'supabase_realtime' tabel mana aja
--      yang ke-list.
-- ============================================================================