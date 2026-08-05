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
-- ============================================================================
-- ⚠️ SQL Editor Supabase punya bug: function body multi-line dengan $$ atau
-- $body$ delimiter kadang gagal parse ("unterminated dollar-quoted string").
-- WORKAROUND: pake versi SINGLE-LINE di bawah. Copy-paste persis (jangan
-- tambah enter/whitespace).
-- ============================================================================

-- 1) Enable pgcrypto (untuk crypt() + gen_salt())
create extension if not exists pgcrypto;

-- 2) Drop function lama (kalo ada — biar idempotent)
drop function if exists public.reset_password_direct(text, text);

-- 3) Create function (SINGLE-LINE workaround SQL Editor bug)
create function public.reset_password_direct(p_email text, p_new_password text) returns jsonb language plpgsql security definer set search_path = public, auth, extensions as $func$ declare v_user_id uuid; begin if length(trim(coalesce(p_email, ''))) < 3 or position('@' in p_email) < 2 then return jsonb_build_object('success', false, 'error', 'Email tidak valid'); end if; if length(coalesce(p_new_password, '')) < 8 then return jsonb_build_object('success', false, 'error', 'Password minimal 8 karakter'); end if; select id into v_user_id from auth.users where email = lower(trim(p_email)) limit 1; if v_user_id is null then return jsonb_build_object('success', false, 'error', 'Email tidak terdaftar'); end if; update auth.users set encrypted_password = crypt(p_new_password, gen_salt('bf')) where id = v_user_id; return jsonb_build_object('success', true, 'message', 'Password berhasil diperbarui'); end; $func$;

-- 4) Grant akses
grant execute on function public.reset_password_direct(text, text) to anon, authenticated;

-- 5) Verifikasi
select
  proname,
  prosecdef as security_definer,
  pg_get_function_identity_arguments(oid) as args
from pg_proc
where proname = 'reset_password_direct';

select extname, extversion from pg_extension where extname = 'pgcrypto';

-- Expected:
--   proname: reset_password_direct, security_definer: true, args: (text, text)
--   extname: pgcrypto, extversion: <version>