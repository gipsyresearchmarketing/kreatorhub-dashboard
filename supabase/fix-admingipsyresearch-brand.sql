-- ============================================================================
-- Fix admingipsyresearch admin: brand_access kosong
-- Sebelumnya add-admin-brand-access.sql ngirim profile baru dgn brand_access,
-- tapi admingipsyresearch (akun lama dari sesi 5) ke-skip karena belum ada
-- pas SQL itu jalan. Hasilnya: brand_access=[] + is_super_admin=false
-- + is_finance=false → account ini ga bisa akses brand apapun.
--
-- Fix: set brand_access=['Gipsy Research'] (sesuai pattern admin Gipsy lain:
-- agung, bagus, petra, praja, putri).
-- ============================================================================

update public.profiles
   set brand_access = ARRAY['Gipsy Research']::text[]
 where username = 'admingipsyresearch'
   and brand_access = '{}';

-- Verify
select username, display_name, role, brand_access, is_finance, is_super_admin
  from public.profiles
 where username = 'admingipsyresearch';