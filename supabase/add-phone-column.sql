-- Migrasi: tambah kolom phone ke tabel profiles (buat notifikasi WhatsApp)
-- Jalanin sekali di Supabase → SQL Editor.

alter table public.profiles add column if not exists phone text;

-- Verifikasi:
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
order by ordinal_position;
-- Expect ada baris: phone (text)
