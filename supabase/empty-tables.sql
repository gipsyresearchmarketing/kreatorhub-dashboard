-- ============================================================================
-- KOSONGKAN SEMUA DATA TABEL (untuk clean test end-to-end)
-- Profile & auth.users DIBIARKAN (login harus tetap bisa)
-- ============================================================================

TRUNCATE TABLE public.history CASCADE;
TRUNCATE TABLE public.progress CASCADE;
TRUNCATE TABLE public.payments CASCADE;
TRUNCATE TABLE public.briefs CASCADE;

-- Hapus file di storage buckets (manual di dashboard)
-- Storage → videos → select all → delete
-- Storage → thumbnails → select all → delete

-- Verifikasi
SELECT 'briefs' as tabel, count(*) as rows FROM public.briefs
UNION ALL SELECT 'progress', count(*) FROM public.progress
UNION ALL SELECT 'history',  count(*) FROM public.history
UNION ALL SELECT 'payments', count(*) FROM public.payments
UNION ALL SELECT 'profiles', count(*) FROM public.profiles;
-- Expected: briefs/progress/history/payments = 0, profiles = 2 (admin + sasa.id)