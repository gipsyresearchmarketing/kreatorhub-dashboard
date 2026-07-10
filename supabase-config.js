/* Supabase client config — loaded by every page that needs DB access.
   anon key is public-by-design; data is protected by Row Level Security (RLS).
   Untuk override lokal (misal staging project), bikin supabase-config.local.js
   yang mendefinisikan ulang `window.SUPABASE_URL` & `window.SUPABASE_ANON_KEY`. */

window.SUPABASE_URL = 'https://bbzminpiwjnlubwvgmgk.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJiem1pbnBpd2pubHVid3ZnbWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2NjgzNTIsImV4cCI6MjA5OTI0NDM1Mn0.gc5TS19U2CsD_fxvRDqv7N6L6fYsQl_olU016aClxfo';

// sb (Supabase client) diinisialisasi oleh supabase-client.js setelah SDK CDN load.
window.sb = null;