-- ============================================================================
-- 1) Tambah status 'superseded' ke public.progress
-- 2) Bersihin data video duplikat (satu brief > 1 video)
--
-- ATURAN: satu brief = satu video. Begitu video-nya di-approve (= dibayar), brief
-- itu selesai dan submission ulang-nya itu duplikat → superseded + payment-nya
-- dibuang (kecuali yang udah dibayar beneran — itu 问题, perlu human review).
--
-- CARA PAKAI: Supabase → SQL Editor → paste → Run
-- ============================================================================


-- ---- 1. Tambah status 'superseded' ----
-- Drop HANYA check constraint yang nyebut 'status' (nama constraint inline CHECK
-- di schema.sql generate itu default, jadi lebih aman cari dulu daripada nebak nama).
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.progress'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.progress drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.progress
  add constraint progress_status_check
  check (status in ('draft','editing','review','revisi','approved','rejected','selesai','superseded'));


-- ---- 2. PREVIEW: video mana yang jadi duplikat per brief ----
-- Untuk tiap (brief_id, kreator): video RESMI = yang payment-nya 'paid'.
-- Kalau nggak ada yg paid, video resmi = yang pertama di-approve (paling lama).
-- Semua row lain di brief itu = duplikat.
with canonical as (
  select distinct on (p.brief_id, p.kreator)
         p.brief_id, p.kreator, p.id, p.title, p.status, p.updated_at,
         coalesce(pay.status, '') as pay_status
  from public.progress p
  left join public.payments pay on pay.id = 'pay-' || p.id
  where p.brief_id is not null and p.status <> 'superseded'
  order by p.brief_id, p.kreator,
           (case when pay.status = 'paid' then 0 else 1 end),
           p.updated_at asc
)
select
  p.brief_id,
  (select b.title from public.briefs b where b.id = p.brief_id) as judul_brief,
  p.kreator,
  p.id            as progress_id,
  p.title,
  p.status        as status_video,
  p.updated_at,
  pay.status      as status_bayar,
  pay.fee,
  case
    when c.id is null                                then 'DUPLIKAT → superseded'
    when pay.status = 'paid' and c.id = p.id        then 'RESMI (sudah dibayar)'
    when c.id = p.id                                 then 'RESMI (pertama di-approve)'
    else 'DUPLIKAT → superseded'
  end as keputusan
from public.progress p
left join public.payments pay on pay.id = 'pay-' || p.id
left join canonical c on c.brief_id = p.brief_id and c.kreator = p.kreator
where p.brief_id is not null and p.status <> 'superseded'
order by p.brief_id, p.updated_at desc;


-- ---- 3. JALANIN: tandai duplikat sebagai 'superseded' ----
begin;

-- 3a. Tandai SEMUA row yang bukan video resmi untuk brief+kreator-nya.
with canonical as (
  select distinct on (p.brief_id, p.kreator) p.brief_id, p.kreator, p.id
  from public.progress p
  left join public.payments pay on pay.id = 'pay-' || p.id
  where p.brief_id is not null and p.status <> 'superseded'
  order by p.brief_id, p.kreator,
           (case when pay.status = 'paid' then 0 else 1 end),
           p.updated_at asc
)
update public.progress p
set status = 'superseded'
where p.brief_id is not null
  and p.status <> 'superseded'
  and not exists (
    select 1 from canonical c
    where c.brief_id = p.brief_id and c.kreator = p.kreator and c.id = p.id
  );

-- 3b. Buang payment dari video duplikat — HANYA yang masih 'pending'.
--     Yang 'paid' dibiarin (duit udah keluar) tapi ditandai di note biar
--     finance tau ini dobel.
update public.payments pay
set note = trim(coalesce(note, '') || ' [DUPLIKAT — video digantikan, video ini tidak dibayar]')
where pay.status <> 'paid'
  and exists (
    select 1 from public.progress p
    where pay.id = 'pay-' || p.id and p.status = 'superseded'
  );

delete from public.payments pay
using public.progress p
where pay.id = 'pay-' || p.id
  and p.status = 'superseded'
  and pay.status <> 'paid';

commit;


-- ---- 4. VERIFIKASI ----
-- Sisa video per brief (harus 1 per brief, kecuali yang masih 2 karena paid):
-- select p.brief_id, p.kreator, p.title, p.status, p.updated_at,
--        pay.id as payment_id, pay.status as pay_status, pay.note
-- from public.progress p
-- left join public.payments pay on pay.id = 'pay-' || p.id
-- where p.kreator ilike '%clarissa%'
-- order by p.brief_id, p.updated_at desc;
--
-- Payment yg ruined (duplikat) — biasanya 0:
-- select count(*) from public.payments pay
-- join public.progress p on pay.id = 'pay-' || p.id
-- where p.status = 'superseded' and pay.status <> 'paid';