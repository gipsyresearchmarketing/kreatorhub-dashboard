-- ============================================================================
-- Extend approvals.decision check constraint utk support 4 action types
-- (sebelumnya cuma 'approve'/'reject' — sekarang tambah 'revisi'/'selesai')
--
-- Tiap admin klik tombol action di script strip → castVote dgn decision itu.
-- Quorum = 3/5 admin vote sama → apply final decision.
-- ============================================================================

-- Drop old constraint
alter table public.approvals
  drop constraint if exists approvals_decision_check;

-- Add new constraint with 4 values
alter table public.approvals
  add constraint approvals_decision_check
  check (decision in ('approve', 'revisi', 'reject', 'selesai'));

-- Verify
select con.conname, pg_get_constraintdef(con.oid) as definition
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
 where rel.relname = 'approvals'
   and con.conname = 'approvals_decision_check';
-- Expected: CHECK ((decision = ANY (ARRAY['approve'::text, 'revisi'::text, 'reject'::text, 'selesai'::text])))