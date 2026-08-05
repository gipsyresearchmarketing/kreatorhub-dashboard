-- ============================================================================
-- Reset password DIRECT (tanpa email verification).
-- User input email + password baru → function update encrypted_password langsung.
--
-- PENTING — security tradeoff:
-- Function ini SECURITY DEFINER + executable oleh anon. Artinya siapa saja
-- yang tahu email seseorang + akses ke URL function ini bisa reset password
-- orang itu. Untuk internal tool dengan user terbatas (kreator/admin yang
-- diundang Bagas), ini acceptable. Kalo exposed ke publik, butuh tambahan
-- captcha / rate limit / OTP WhatsApp.
--
-- Cara setup:
-- 1. Run SQL ini di Supabase → SQL Editor → New query → Run
-- 2. Verify: select proname from pg_proc where proname = 'reset_password_direct';
--    Expected: 1 row
-- 3. Test di app: klik "Lupa sandi?" di login → input email + password baru → submit
-- ============================================================================

-- pgcrypto wajib enable untuk crypt() + gen_salt()
create extension if not exists pgcrypto;

create or replace function public.reset_password_direct(
  p_email        text,
  p_new_password text
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id  uuid;
  v_min_pw   int := 8;
begin
  -- Validasi input
  if p_email is null or length(trim(p_email)) < 3 or position('@' in p_email) < 2 then
    return jsonb_build_object('success', false, 'error', 'Email tidak valid');
  end if;
  if p_new_password is null or length(p_new_password) < v_min_pw then
    return jsonb_build_object('success', false, 'error', 'Password minimal ' || v_min_pw || ' karakter');
  end if;

  -- Lookup user by email di auth.users
  select id into v_user_id
  from auth.users
  where email = lower(trim(p_email))
  limit 1;

  if v_user_id is null then
    -- Return generic error (jangan bocorin apakah email exist — privacy)
    return jsonb_build_object('success', false, 'error', 'Email tidak terdaftar atau password gagal diperbarui');
  end if;

  -- Update password (bcrypt hash, salt baru) via pgcrypto
  update auth.users
  set encrypted_password = crypt(p_new_password, gen_salt('bf'))
  where id = v_user_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Gagal memperbarui password');
  end if;

  return jsonb_build_object(
    'success', true,
    'message', 'Password berhasil diperbarui'
  );
end;
$$;

-- Grant akses ke anon (login page bisa panggil tanpa login)
grant execute on function public.reset_password_direct(text, text) to anon, authenticated;

-- Verifikasi
select
  proname,
  prosecdef as security_definer,
  pg_get_function_identity_arguments(oid) as args
from pg_proc
where proname = 'reset_password_direct';

-- Expected: 1 row, security_definer = true, args = (text, text)

-- Bonus verifikasi pgcrypto enable
select extname, extversion from pg_extension where extname = 'pgcrypto';
-- Expected: 1 row (pgcrypto enabled)