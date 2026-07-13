-- ============================================================================
-- Payment proofs: admin upload bukti transfer, kreator bisa download
-- Storage bucket: payment-proofs (private, signed URL untuk download)
-- ============================================================================

-- 1. Storage bucket (private)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,  -- private
  10485760,  -- 10 MB
  array['image/png','image/jpeg','image/webp','image/heic','application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2. Tabel payment_proofs
create table if not exists public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  payment_id text not null references public.payments(id) on delete cascade,
  file_path  text not null,                 -- path di storage bucket (mis. "payment-id/uuid.png")
  file_name  text not null,                 -- nama asli file
  mime_type  text,
  file_size  bigint,
  note       text,                          -- catatan dari admin (opsional)
  uploaded_by text not null references public.profiles(username) on delete set null,
  created_at timestamptz default now()
);

create index if not exists payment_proofs_payment_idx on public.payment_proofs(payment_id);
create index if not exists payment_proofs_uploaded_by_idx on public.payment_proofs(uploaded_by);

-- 3. RLS
alter table public.payment_proofs enable row level security;

-- Admin: full access
drop policy if exists "payment_proofs admin all" on public.payment_proofs;
create policy "payment_proofs admin all" on public.payment_proofs
  for all using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  )
  with check (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

-- Kreator: read baris untuk payment yang dia punya
drop policy if exists "payment_proofs kreator self read" on public.payment_proofs;
create policy "payment_proofs kreator self read" on public.payment_proofs
  for select using (
    payment_id in (
      select id from public.payments where kreator =
        (select username from public.profiles where id = auth.uid())
    )
  );

-- 4. Storage RLS: admin upload, kreator download file untuk payment sendiri
-- Admin: full CRUD di bucket
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

-- Kreator: download (select) file yang path-nya match payment_id mereka
-- Path convention: "{payment_id}/{uuid}.{ext}"
drop policy if exists "payment_proofs kreator self read storage" on storage.objects;
create policy "payment_proofs kreator self read storage" on storage.objects
  for select using (
    bucket_id = 'payment-proofs'
    and (split_part(name, '/', 1)) in (
      select id from public.payments where kreator =
        (select username from public.profiles where id = auth.uid())
    )
  );

-- 5. Realtime
alter publication supabase_realtime add table public.payment_proofs;
