-- ============================================================================
-- Finance flag: kolom is_finance di profiles, helper is_finance(), tandai Putri
-- Jalanin sekali di Supabase → SQL Editor.
-- ============================================================================

-- 1. Kolom flag + index partial (cuma row finance yang ke-index, hemat space)
alter table public.profiles add column if not exists is_finance boolean default false;
create index if not exists profiles_is_finance_idx on public.profiles(is_finance) where is_finance = true;

-- 2. Helper DB (mirror is_admin() di schema.sql line 128)
--    Dipakai RLS kalau nanti mau hard-lock di DB level (skrg belum — gate di JS aja).
create or replace function public.is_finance()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select is_finance = true from public.profiles where id = auth.uid()), false) $$;

-- 3. TANDAI akun Putri sebagai finance.
--    ⚠️ PENTING: ganti 'putri' di WHERE clause jadi username akun Putri yang beneran ada.
--    Cek dulu di Supabase → Authentication → Users atau Table Editor → profiles
--    buat tau username yang dipakai.
update public.profiles
   set is_finance = true
 where username = 'putri';   -- ← BAGAS: edit username ini sebelum Run kalau bukan 'putri'

-- 4. Verifikasi: harusnya muncul minimal 1 baris (Putri)
select username, role, display_name, is_finance
  from public.profiles
 where is_finance = true;