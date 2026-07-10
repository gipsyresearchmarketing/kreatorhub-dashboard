-- ============================================================================
-- KreatorHub — schema + RLS + auth trigger
-- Paste ini ke Supabase → SQL Editor → New query → Run (sekali jalan).
-- ============================================================================

-- ---- 1. PROFILES: mirror auth.users, simpan role + display info -----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  role text not null check (role in ('kreator', 'admin')) default 'kreator',
  display_name text,
  avatar text,
  created_at timestamptz default now()
);

-- Auto-create profile row saat user baru sign up di Supabase Auth.
-- Trigger ini ambil username dari email (sebelum @), display_name dari email.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, role, display_name)
  values (
    new.id,
    split_part(new.email, '@', 1),
    'kreator',  -- default; admin diubah manual setelahnya
    split_part(new.email, '@', 1)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---- 2. BRANDS (referensi, opsional bisa hardcode di frontend) -----------
create table if not exists public.brands (
  id text primary key,
  name text not null,
  created_at timestamptz default now()
);
insert into public.brands (id, name) values
  ('jamuzen', 'Jamuzen'),
  ('calmadeai', 'CalmadeAI'),
  ('conventio', 'Conventio'),
  ('gipsy-research', 'Gipsy Research')
on conflict (id) do nothing;

-- ---- 3. BRIEFS: dibuat admin, dilihat kreator ----------------------------
create table if not exists public.briefs (
  id text primary key,
  brand text not null,
  title text not null,
  meta text,
  deadline text,
  created_at timestamptz default now()
);

-- ---- 4. PROGRESS: kreator upload kerja ----------------------------------
create table if not exists public.progress (
  id text primary key,
  kreator text not null,
  brief_id text references public.briefs(id) on delete set null,
  title text not null,
  brand text not null,
  status text not null check (status in ('draft','editing','review','revisi','approved','rejected','selesai')) default 'draft',
  meta text,
  video_url text,             -- URL YouTube/TikTok/dll (kalau kreator pakai link)
  video_storage_path text,    -- path di bucket 'videos' (kalau upload file)
  thumbnail_path text,        -- path di bucket 'thumbnails'
  updated_at timestamptz default now()
);
create index if not exists progress_kreator_idx on public.progress(kreator);
create index if not exists progress_status_idx on public.progress(status);

-- ---- 5. HISTORY: snapshot setelah admin review ---------------------------
create table if not exists public.history (
  id text primary key,
  progress_id text references public.progress(id) on delete set null,
  kreator text not null,
  title text not null,
  brand text not null,
  status text not null,
  link text,
  admin text,
  feedback text,
  reviewed_at timestamptz default now()
);
create index if not exists history_kreator_idx on public.history(kreator);

-- ---- 6. PAYMENTS: fee per video -----------------------------------------
create table if not exists public.payments (
  id text primary key,
  kreator text not null,
  video_title text not null,
  brand text not null,
  fee numeric,
  ad_spend numeric,
  gross_revenue numeric,
  status text check (status in ('paid','pending')) default 'pending',
  submitted_at timestamptz,
  paid_at timestamptz,
  note text
);
create index if not exists payments_kreator_idx on public.payments(kreator);

-- ---- 7. Helper: cek role caller -----------------------------------------
create or replace function public.current_role()
returns text
language sql
stable
security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- PROFILES: user bisa baca profil sendiri + admin bisa baca semua
alter table public.profiles enable row level security;
create policy "profiles self read" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles self update" on public.profiles
  for update using (auth.uid() = id);
create policy "profiles admin read all" on public.profiles
  for select using (public.is_admin());

-- BRANDS: read-all authenticated, admin write
alter table public.brands enable row level security;
create policy "brands read all auth" on public.brands
  for select to authenticated using (true);
create policy "brands admin write" on public.brands
  for all using (public.is_admin());

-- BRIEFS: read-all authenticated, admin write
alter table public.briefs enable row level security;
create policy "briefs read all auth" on public.briefs
  for select to authenticated using (true);
create policy "briefs admin write" on public.briefs
  for all using (public.is_admin());

-- PROGRESS: kreator CRUD sendiri, admin read+update all
alter table public.progress enable row level security;
create policy "progress own read" on public.progress
  for select using (
    kreator = (select username from public.profiles where id = auth.uid())
    or public.is_admin()
  );
create policy "progress own insert" on public.progress
  for insert with check (
    kreator = (select username from public.profiles where id = auth.uid())
    or public.is_admin()
  );
create policy "progress own update" on public.progress
  for update using (
    kreator = (select username from public.profiles where id = auth.uid())
    or public.is_admin()
  );
create policy "progress admin delete" on public.progress
  for delete using (public.is_admin());

-- HISTORY: kreator read sendiri, admin write
alter table public.history enable row level security;
create policy "history own read" on public.history
  for select using (
    kreator = (select username from public.profiles where id = auth.uid())
    or public.is_admin()
  );
create policy "history admin write" on public.history
  for all using (public.is_admin());

-- PAYMENTS: kreator read sendiri, admin write
alter table public.payments enable row level security;
create policy "payments own read" on public.payments
  for select using (
    kreator = (select username from public.profiles where id = auth.uid())
    or public.is_admin()
  );
create policy "payments admin write" on public.payments
  for all using (public.is_admin());

-- ============================================================================
-- STORAGE POLICIES (untuk buckets 'videos' + 'thumbnails')
-- Bikin bucket dulu via dashboard, lalu jalanin blok ini.
-- ============================================================================

-- videos: private — kreator upload/read sendiri + admin read all
-- (Run setelah bucket 'videos' dibuat)
-- create policy "videos own read" on storage.objects
--   for select using (
--     bucket_id = 'videos' and (
--       (storage.foldername(name))[1] = (select username from public.profiles where id = auth.uid())
--       or public.is_admin()
--     )
--   );
-- create policy "videos own insert" on storage.objects
--   for insert with check (
--     bucket_id = 'videos' and
--     (storage.foldername(name))[1] = (select username from public.profiles where id = auth.uid())
--   );

-- thumbnails: public read, kreator write folder sendiri, admin write all
-- (Run setelah bucket 'thumbnails' dibuat)
-- create policy "thumbnails public read" on storage.objects
--   for select using (bucket_id = 'thumbnails');
-- create policy "thumbnails own write" on storage.objects
--   for insert with check (
--     bucket_id = 'thumbnails' and (
--       (storage.foldername(name))[1] = (select username from public.profiles where id = auth.uid())
--       or public.is_admin()
--     )
--   );

-- ============================================================================
-- SELESAI. Cek hasil dengan:
--   select tablename, rowsecurity from pg_tables where schemaname = 'public';
-- Harus menunjukkan rowsecurity = true di semua tabel kecuali brands (opsional).
-- ============================================================================