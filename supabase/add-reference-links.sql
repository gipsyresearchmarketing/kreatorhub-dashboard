-- ============================================================================
-- Kolom VIDEO REFERENSI: link video acuan untuk kreator
--
-- Dipakai di 2 tempat:
--   script_library.reference_links — admin ngedit di halaman Library konten
--   briefs.reference_links        — tersalin saat script di-assign ke kreator,
--                                   tampil di halaman "Brief & script" kreator
--
-- Tipe: text[] (array of URL). 1 link per baris di form.
--
-- CARA PAKAI: Supabase → SQL Editor → paste → Run
-- ============================================================================

alter table public.briefs
  add column if not exists reference_links text[] default '{}';

alter table public.script_library
  add column if not exists reference_links text[] default '{}';

-- Jaga supaya nggak ada NULL (biar frontend ga perlu handle dua kasus)
update public.briefs set reference_links = '{}' where reference_links is null;
update public.script_library set reference_links = '{}' where reference_links is null;


-- ---- Verifikasi ----
select table_name, column_name, data_type, column_default
from information_schema.columns
where column_name = 'reference_links'
order by table_name;
