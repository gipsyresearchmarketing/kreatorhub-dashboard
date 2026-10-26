-- ============================================================================
-- Diagnosa: kenapa video/payment title-nya berulang (mis. "Clarissa",
-- "Clarissa 2", "Clarissa 3") dan kenapa 1 brief keliatan nunjukin video
-- dari brief lain.
--
-- Jalankan di Supabase SQL Editor. Ganti 'clarissa' dengan keyword kreator
-- yang mau dicek (case-insensitive).
-- ============================================================================

-- ---- 1. BRIEFS milik kreator itu ----
select
  b.id,
  b.title,
  b.brand,
  b.assigned_to,
  b.deadline,
  b.fee,
  b.created_at
from public.briefs b
where b.assigned_to ilike '%clarissa%'
   or b.title ilike '%clarissa%'
order by b.created_at;


-- ---- 2. PROGRESS (video) kreator itu — inti dari duplikasi ----
-- Lihat: brief_id-nya bener atau engga, title sama atau engga, status apa.
select
  p.id                as progress_id,
  p.kreator,
  p.brief_id,
  p.title,
  p.status,
  p.video_url,
  p.updated_at,
  -- flag: brief_id-nya nunjuk ke brief yang bener nggak?
  (select b.title from public.briefs b where b.id = p.brief_id) as judul_brief_terkait
from public.progress p
where p.kreator ilike '%clarissa%'
   or p.title ilike '%clarissa%'
order by p.updated_at desc;


-- ---- 3. PAYMENTS (baris di fee panel) ----
select
  pay.id,
  pay.kreator,
  pay.video_title,
  pay.brand,
  pay.fee,
  pay.status,
  pay.submitted_at,
  -- progress id yg di-pay (dari id payment)
  replace(pay.id, 'pay-', '') as progress_id_dari_payment
from public.payments pay
where pay.kreator ilike '%clarissa%'
   or pay.video_title ilike '%clarissa%'
order by pay.submitted_at desc;


-- ---- 4. RINGKASAN: progress vs payment per title ----
-- Kalau jumlah payment > jumlah progress unik → ada duplikat beneran.
select
  p.title,
  count(distinct p.id)   as jumlah_progress,
  count(distinct pay.id) as jumlah_payment,
  string_agg(distinct p.brief_id, ', ') as brief_ids,
  string_agg(distinct p.status, ', ')  as statuses
from public.progress p
left join public.payments pay on pay.id = 'pay-' || p.id
where p.kreator ilike '%clarissa%' or p.title ilike '%clarissa%'
group by p.title
order by p.title;


-- ---- 5. CEK: progress yg title-nya mirip tapi brief_id beda ----
-- Ini yang bikin "video pertama ngikut" — progress dari brief lain yg
-- title-nya mengandung 2 kata pertama brief ini.
select
  'POTENSI LEAK' as marker,
  p.id            as progress_id,
  p.brief_id,
  p.title,
  p.status,
  (select b.title from public.briefs b where b.id = p.brief_id) as judul_brief
from public.progress p
where p.kreator ilike '%clarissa%'
order by p.updated_at desc;


-- ---- 6. BRIEF_SCRIPTS: cek script-nya udah di-approve atau belum ----
-- Ini_answer "brief & script masih 0/0" — kalau script status-nya masih draft,
-- brief_scripts-nya belum ada/approved, jadi vote counter 0.
select
  bs.brief_id,
  bs.kreator,
  bs.status,
  bs.updated_at,
  (select b.title from public.briefs b where b.id = bs.brief_id) as judul_brief
from public.brief_scripts bs
where bs.kreator ilike '%clarissa%'
   or bs.brief_id in (select id from public.briefs where assigned_to ilike '%clarissa%')
order by bs.updated_at desc;


-- ---- 7. APPROVALS (vote) — cek target_id-nya bener atau engga ----
select
  a.target_type,
  a.target_id,
  a.admin_username,
  a.decision,
  a.created_at,
  case
    when a.target_type = 'script' then (select b.title from public.briefs b where b.id = a.target_id)
    else (select p.title from public.progress p where p.id = a.target_id)
  end as judul_target
from public.approvals a
where a.target_id in (
  select id from public.briefs where assigned_to ilike '%clarissa%'
  union
  select id from public.progress where kreator ilike '%clarissa%'
)
order by a.created_at desc;