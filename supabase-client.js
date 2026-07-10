/* Supabase client initializer. Load SETELAH CDN @supabase/supabase-js dan supabase-config.js.
   expose `window.sb` sebagai Supabase client singleton. */

(function () {
  'use strict';
  if (!window.supabase || !window.supabase.createClient) {
    console.error('[supabase-client] @supabase/supabase-js CDN belum dimuat');
    return;
  }
  const url = window.SUPABASE_URL;
  const key = window.SUPABASE_ANON_KEY || (window.SUPABASE_LOCAL && window.SUPABASE_LOCAL.ANON_KEY);
  if (!url || !key) {
    console.error('[supabase-client] SUPABASE_URL / SUPABASE_ANON_KEY belum di-set');
    return;
  }
  window.sb = window.supabase.createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: window.localStorage,
      storageKey: 'kreatorhub.auth'
    }
  });
})();