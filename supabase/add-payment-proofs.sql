-- ============================================================================
-- Payment proofs (idempotent — semua blok DROP dulu biar aman run berulang)
-- Jalanin SATU BLOK PER KALI di Supabase → SQL Editor → New query → Run
-- ============================================================================

-- ============================================================================
-- BLOK 1: Storage bucket (jalankan ini dulu)
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 10485760,
        array['image/png','image/jpeg','image/webp','image/heic','application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Verifikasi bucket (harusnya muncul 1 baris payment-proofs)
select id, name, public, file_size_limit from storage.buckets;

-- ============================================================================
-- BLOK 2: Tabel payment_proofs (jalankan SETELAH blok 1 sukses)
-- ============================================================================
create table if not exists public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  payment_id text not null references public.payments(id) on delete cascade,
  file_path  text not null,
  file_name  text not null,
  mime_type  text,
  file_size  bigint,
  note       text,
  uploaded_by text not null references public.profiles(username) on delete set null,
  created_at timestamptz default now()
);
create index if not exists payment_proofs_payment_idx on public.payment_proofs(payment_id);

-- ============================================================================
-- BLOK 3: RLS tabel payment_proofs (drop dulu biar idempotent)
-- ============================================================================
alter table public.payment_proofs enable row level security;

drop policy if exists "payment_proofs admin all" on public.payment_proofs;
create policy "payment_proofs admin all" on public.payment_proofs
  for all using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  )
  with check (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

drop policy if exists "payment_proofs kreator self read" on public.payment_proofs;
create policy "payment_proofs kreator self read" on public.payment_proofs
  for select using (
    payment_id in (
      select id from public.payments where kreator =
        (select username from public.profiles where id = auth.uid())
    )
  );

-- Verifikasi tabel + RLS
select schemaname, tablename, policyname, cmd from pg_policies where tablename = 'payment_proofs';

-- ============================================================================
-- BLOK 4: Storage RLS (drop dulu biar idempotent) — JALANKAN BLOK INI TERAKHIR
-- ============================================================================
drop policy if exists "payment_proofs admin upload" on storage.objects;
create policy "payment_proofs admin upload" on storage.objects
  for insert with check (
    bucket_id = 'payment-proofs'
    and (select role from public.profiles where id = auth.uid()) = 'admin'
  );

drop policy if exists "payment_proofs admin update" on storage.objects;
create policy "payment_proofs admin update" on storage.objects
  for update using (
    bucket_id = 'payment-proofs'
    and (select role from public.profiles where id = auth.uid()) = 'admin'
  );

drop policy if exists "payment_proofs admin delete" on storage.objects;
create policy "payment_proofs admin delete" on storage.objects
  for delete using (
    bucket_id = 'payment-proofs'
    and (select role from public.profiles where id = auth.uid()) = 'admin'
  );

drop policy if exists "payment_proofs kreator self read storage" on storage.objects;
create policy "payment_proofs kreator self read storage" on storage.objects
  for select using (
    bucket_id = 'payment-proofs'
    and (split_part(name, '/', 1)) in (
      select id from public.payments where kreator =
        (select username from public.profiles where id = auth.uid())
    )
  );

-- ============================================================================
-- BLOK 5: Realtime (opsional, biar kreator liat bukti baru realtime)
-- ============================================================================
alter publication supabase_realtime add table public.payment_proofs;

-- Verifikasi akhir: harusnya 4 policy storage.payment-proofs + 2 policy payment_proofs + 1 bucket
select 'bucket' as type, id as name from storage.buckets where id = 'payment-proofs'
union all
select 'policy_table' as type, policyname as name from pg_policies where tablename = 'payment_proofs'
union all
select 'policy_storage' as type, policyname || ' (' || cmd || ')' as name
  from pg_policies where tablename = 'objects' and policyname like 'payment_proofs%';