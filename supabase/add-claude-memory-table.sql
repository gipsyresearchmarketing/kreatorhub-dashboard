-- Migration: claude_memory table untuk sync memory antar device/Claude Code session.
-- Pakai service_role key buat read/write (sync script — bukan anon).
-- RLS enable + deny-all default — bypass via service_role only.
--
-- CARA SETUP:
-- 1. Run SQL ini di Supabase → SQL Editor
-- 2. Ambil service_role key dari Supabase → Settings → API → service_role
-- 3. Taruh di env var: export SUPABASE_SERVICE_ROLE_KEY="eyJ...service_role..."
-- 4. Sync memory: node tools/claude-memory-sync.js push / pull
--
-- Kenapa service_role, bukan anon? Karena anon key di-commit ke repo (supabase-config.js).
-- Kalo RLS allow anon, semua orang bisa baca memory project lo. Memory bisa jadiin
-- attack surface (泄漏 info struktur project, deadman switch, dll).
-- Service_role key di-env var lokal doang, jadi aman.

create table if not exists public.claude_memory (
  name        text primary key,            -- e.g. 'reset-password-self-service'
  description text,                         -- dari frontmatter description
  body        text not null,                -- markdown content (no frontmatter)
  metadata    jsonb not null default '{}'::jsonb,  -- sisa frontmatter (type, dll)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Index buat lookup by updated_at (kalau nanti butuh "sync recent changes only")
create index if not exists claude_memory_updated_at_idx
  on public.claude_memory (updated_at desc);

-- Auto-update updated_at pas row di-update
create or replace function public.claude_memory_touch_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists claude_memory_touch on public.claude_memory;
create trigger claude_memory_touch
  before update on public.claude_memory
  for each row execute function public.claude_memory_touch_updated_at();

-- RLS: deny all by default. Sync script bypass via service_role (Postgres role
-- 'supabase_admin' / 'service_role' yang ngebypass RLS secara default di Supabase).
alter table public.claude_memory enable row level security;

drop policy if exists "claude_memory deny all" on public.claude_memory;
create policy "claude_memory deny all" on public.claude_memory
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- Verifikasi: should return 1 row (the table itself)
select 'claude_memory created' as status, count(*) as rows from public.claude_memory;