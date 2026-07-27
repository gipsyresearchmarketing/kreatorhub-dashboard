-- ============================================================================
-- Rename brand 'Conventio' -> 'Convictio.id' di semua data DB
-- Jalanin sekali di Supabase → SQL Editor → New query → Run
-- ============================================================================

-- 1. Update briefs
update public.briefs set brand = 'Convictio.id' where brand = 'Conventio';

-- 2. Update payments
update public.payments set brand = 'Convictio.id' where brand = 'Conventio';

-- 3. Update payment_proofs (skip kalo tabel/kolom belum ada — belum run add-payment-proofs.sql)
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'payment_proofs' and column_name = 'file_path'
  ) then
    update public.payment_proofs
       set file_path = replace(file_path, '/Conventio/', '/Convictio.id/')
     where file_path like '%/Conventio/%';
  end if;
end $$;

-- 4. Update profiles.brand_access untuk admin Conventio (Albert + Sendi)
update public.profiles
   set brand_access = array_replace(brand_access, 'Conventio', 'Convictio.id')
 where 'Conventio' = ANY(brand_access);

-- 5. Verifikasi: harusnya ngga ada lagi baris dengan brand='Conventio'
select 'briefs' as tbl, count(*) as sisa_conventio from public.briefs where brand = 'Conventio'
union all
select 'payments', count(*) from public.payments where brand = 'Conventio'
union all
select 'profiles (brand_access)', count(*) from public.profiles where 'Conventio' = ANY(brand_access);
-- Expected: 3 baris dgn count=0

-- 6. Lihat distribusi brand baru
select brand, count(*) from public.briefs group by brand order by brand;