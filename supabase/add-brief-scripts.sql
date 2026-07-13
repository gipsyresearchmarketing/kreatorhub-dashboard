-- ============================================================================
-- Tabel BRIEF_SCRIPTS: script per-kreator per-brief, sync antar device
-- Kreator nulis script → row tercipta dengan composite unique (brief_id, kreator).
-- Admin tidak perlu tulis di sini — admin cuma read all untuk ditampilkan di brief detail.
-- ============================================================================

create table if not exists public.brief_scripts (
  id uuid primary key default gen_random_uuid(),
  brief_id  text not null references public.briefs(id) on delete cascade,
  kreator   text not null references public.profiles(username) on delete cascade,
  script    text default '',
  status    text not null check (status in ('draft','editing','review','revisi','approved','rejected','selesai')) default 'draft',
  updated_at timestamptz default now(),
  unique(brief_id, kreator)
);

create index if not exists brief_scripts_brief_idx on public.brief_scripts(brief_id);
create index if not exists brief_scripts_kreator_idx on public.brief_scripts(kreator);

-- Trigger: auto-update updated_at saat row berubah
create or replace function public.touch_brief_scripts_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists brief_scripts_touch on public.brief_scripts;
create trigger brief_scripts_touch
  before update on public.brief_scripts
  for each row execute function public.touch_brief_scripts_updated_at();

-- ---- RLS ----
alter table public.brief_scripts enable row level security;

-- Kreator: read & write baris sendiri
drop policy if exists "brief_scripts self read" on public.brief_scripts;
create policy "brief_scripts self read" on public.brief_scripts
  for select using (
    kreator = (select username from public.profiles where id = auth.uid())
  );

drop policy if exists "brief_scripts self upsert" on public.brief_scripts;
create policy "brief_scripts self upsert" on public.brief_scripts
  for insert with check (
    kreator = (select username from public.profiles where id = auth.uid())
  );

drop policy if exists "brief_scripts self update" on public.brief_scripts;
create policy "brief_scripts self update" on public.brief_scripts
  for update using (
    kreator = (select username from public.profiles where id = auth.uid())
  );

drop policy if exists "brief_scripts self delete" on public.brief_scripts;
create policy "brief_scripts self delete" on public.brief_scripts
  for delete using (
    kreator = (select username from public.profiles where id = auth.uid())
  );

-- Admin: read all
drop policy if exists "brief_scripts admin read all" on public.brief_scripts;
create policy "brief_scripts admin read all" on public.brief_scripts
  for select using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );
