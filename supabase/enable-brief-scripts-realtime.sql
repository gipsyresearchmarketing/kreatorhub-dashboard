-- ============================================================================
-- Enable Supabase Realtime untuk tabel brief_scripts
-- Supabase Realtime pakai Postgres logical replication.
-- Tabel baru harus di-ADD ke publication 'supabase_realtime' dulu.
-- ============================================================================

alter publication supabase_realtime add table public.brief_scripts;
