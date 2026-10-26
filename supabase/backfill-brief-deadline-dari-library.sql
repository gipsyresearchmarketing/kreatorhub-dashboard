-- ============================================================================
-- Backfill deadline: briefs ← script_library.scheduled_date
--
-- KASUAL: versi sebelumnya Step 2-nya di-comment-out, jadi pas di-paste + Run
-- cuma SELECT preview yang jalan — NOLAK ada yang ditulis. File ini UPDATE-nya AKTIF.
--
-- Cara pakai: Supabase Dashboard → SQL Editor → paste SELURUH file ini → Run.
-- Aman diulang: filter "deadline masih kosong" bikin run kedua = 0 baris.
-- ============================================================================

-- ---- STEP 1: PREVIEW — daftar brief yang bakal ke-backfill ----
select
  b.id             as brief_id,
  b.assigned_to    as kreator,
  b.brand,
  left(b.title, 55) as judul,
  b.deadline       as deadline_skrg,
  l.scheduled_date as tanggal_library
from public.briefs b
join public.script_library l
  on l.brief_id = b.id
where l.scheduled_date is not null
  and coalesce(b.deadline, '') in ('', '—')
order by l.scheduled_date;


-- ---- STEP 2: BACKFILL (AKTIF — ini yang nulis ke database) ----
-- Format output: "22 Oktober 2026" — sama persis isoToDateId() di admin-common.js,
-- jadi fmtDate() di frontend bisa parse (pakai map ID_MONTHS).
begin;

update public.briefs b
set deadline =
      to_char(l.scheduled_date::date, 'FMDD ') ||
      case extract(month from l.scheduled_date::date)
        when 1  then 'Januari'    when 2  then 'Februari'
        when 3  then 'Maret'      when 4  then 'April'
        when 5  then 'Mei'        when 6  then 'Juni'
        when 7  then 'Juli'       when 8  then 'Agustus'
        when 9  then 'September'  when 10 then 'Oktober'
        when 11 then 'November'   when 12 then 'Desember'
      end ||
      ' ' || extract(year from l.scheduled_date::date)::text
from public.script_library l
where l.brief_id = b.id
  and l.scheduled_date is not null
  and coalesce(b.deadline, '') in ('', '—');

commit;


-- ---- STEP 3: VERIFIKASI — cek hasilnya format "D Bulan YYYY" ----
select
  b.assigned_to  as kreator,
  b.brand,
  left(b.title, 45) as judul,
  b.deadline,
  l.scheduled_date as tanggal_library,
  -- flag: TRUE kalau format udah bener
  (b.deadline ~ '^[0-9]{1,2} (Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember) [0-9]{4}$') as format_ok
from public.briefs b
join public.script_library l
  on l.brief_id = b.id
where l.scheduled_date is not null
order by l.scheduled_date;


-- ---- STEP 4: SISA YANG GAGAL KE-BACKFILL (diagnosa kenapa) ----
-- Brief assigned dari library tapi tetep '—'. Causes:
--   (a) script_library.brief_id NULL        → link library↔brief putus
--   (b) scheduled_date NULL                 → emang belum pernah dijadwalkan
--   (c) link-nya nunjuk ke brief yang beda   → data tidak konsisten
-- select b.id, b.assigned_to, b.brand, left(b.title,45) as judul,
--        b.deadline, l.id as library_id, l.status as lib_status,
--        l.scheduled_date,
--        case when l.id is null            then 'brief_id library NULL'
--             when l.scheduled_date is null then 'library belum dijadwalkan'
--             else 'seharusnya ke-backfill — cek lagi filter di atas'
--        end as diagnosis
-- from public.briefs b
-- left join public.script_library l on l.brief_id = b.id
-- where coalesce(b.deadline,'') in ('', '—')
--   and b.assigned_to is not null
-- order by b.brand, b.assigned_to;