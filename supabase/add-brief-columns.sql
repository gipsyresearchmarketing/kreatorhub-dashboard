-- Migrasi: tambah kolom fee + assigned_to ke tabel briefs
-- Jalanin sekali di Supabase → SQL Editor.

alter table public.briefs add column if not exists fee numeric;
alter table public.briefs add column if not exists assigned_to text;  -- username kreator PIC; null = terbuka

-- Verifikasi:
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'briefs'
order by ordinal_position;
-- Expect ada baris: fee (numeric), assigned_to (text)
