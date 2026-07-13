-- ============================================================================
-- Tabel APPROVALS: multi-admin approval dengan quorum 3/5
-- Track vote setiap admin untuk script / video.
-- Status final berubah jadi approved/rejected hanya kalau quorum (3/5) tercapai.
-- Bisa ganti vote real-time (admin replace row dengan UPDATE).
-- ============================================================================

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('script', 'video')),
  target_id   text not null,                 -- brief_id (script) atau progress_id (video)
  admin_username text not null references public.profiles(username) on delete cascade,
  decision     text not null check (decision in ('approve', 'reject')),
  comment      text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique(target_type, target_id, admin_username)
);

create index if not exists approvals_target_idx on public.approvals(target_type, target_id);
create index if not exists approvals_admin_idx on public.approvals(admin_username);

-- trigger auto-update updated_at
create or replace function public.touch_approvals_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists approvals_touch on public.approvals;
create trigger approvals_touch
  before update on public.approvals
  for each row execute function public.touch_approvals_updated_at();

-- ---- RLS ----
alter table public.approvals enable row level security;

-- Admin: read all
drop policy if exists "approvals admin read" on public.approvals;
create policy "approvals admin read" on public.approvals
  for select using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

-- Admin: insert/update/delete baris sendiri (vote-nya)
drop policy if exists "approvals self write" on public.approvals;
create policy "approvals self write" on public.approvals
  for insert with check (
    admin_username = (select username from public.profiles where id = auth.uid())
  );

drop policy if exists "approvals self update" on public.approvals;
create policy "approvals self update" on public.approvals
  for update using (
    admin_username = (select username from public.profiles where id = auth.uid())
  );

drop policy if exists "approvals self delete" on public.approvals;
create policy "approvals self delete" on public.approvals
  for delete using (
    admin_username = (select username from public.profiles where id = auth.uid())
  );

-- Realtime broadcast untuk counter live
alter publication supabase_realtime add table public.approvals;
