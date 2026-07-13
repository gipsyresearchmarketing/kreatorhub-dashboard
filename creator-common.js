/* Shared logic for all creator pages (ringkasan, brief, upload, progres, riwayat, akun)
   VERSI 2: Supabase-backed (vs localStorage-only di versi sebelumnya).

   Setiap halaman yang memuat file ini akan memiliki global window.CreatorApp:
     - session       (object session kreator: { userId, username, role, displayName, avatar })
     - userBrands    (array brand — saat ini semua kreator punya akses ke semua brand)
     - data          ({ briefs, progress, history, payments })  ← populated by refresh()
     - refresh()     (async — fetch ulang dari Supabase)
     - showToast(msg)
     - handleSignOut()
     - setStatusOverride(id, status)  ← write ke Supabase + refresh cache

   SETUP halaman:
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
     <script src="supabase-config.js"></script>
     <script src="supabase-client.js"></script>
     <script src="creator-common.js"></script>

   Halaman render content di dalam event listener 'creatorapp:ready' (data siap).
*/

(async function () {
  'use strict';

  // ---- session ----
  const SESSION_KEY = 'kreatorhub.session';
  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  }
  const session = getSession();
  if (!session || !session.userId || !session.username) {
    // Tidak ada session yang valid → balik ke login
    try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
    window.location.replace('screens-login.html');
    return;
  }

  // Tunggu Supabase client siap
  function waitForSb() {
    return new Promise((resolve, reject) => {
      let tries = 0;
      (function tick() {
        if (window.sb) return resolve(window.sb);
        if (++tries > 50) return reject(new Error('Supabase client tidak tersedia'));
        setTimeout(tick, 60);
      })();
    });
  }

  let sb;
  try {
    sb = await waitForSb();
  } catch (e) {
    console.error('[creator-common] ' + e.message);
    alert('Gagal memuat Supabase. Cek koneksi internet lalu refresh halaman.');
    return;
  }

  // Verifikasi session Supabase valid (token belum expired)
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user || user.id !== session.userId) {
    console.warn('[creator-common] Supabase session invalid/expired → logout');
    try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
    window.location.replace('screens-login.html');
    return;
  }

  // ---- brand list (semua kreator punya akses ke semua brand) ----
  const ALL_BRANDS = ['Jamuzen', 'CalmadeAI', 'Conventio', 'Gipsy Research'];

  // ---- greeting/lead fallback per username (kalau belum ada di profile) ----
  const DATA = {
    'kreator':    { greeting: 'Hai, Kreator, welcome back!', lead: 'Berikut ringkasan kerjaan kamu. Cek detail di menu sebelah kiri.' },
    'testing123': { greeting: 'Hai, Tester. Welcome back!',  lead: 'Anda login sebagai akun testing. Coba-coba semua fitur.' },
    'sasa.id':    { greeting: 'Hai, Sasa, welcome back!',    lead: 'Berikut ringkasan kerjaan kamu. Cek detail di menu sebelah kiri.' },
    'dimas.h':    { greeting: 'Hai, Dimas, welcome back!',   lead: 'Berikut ringkasan kerjaan kamu. Cek detail di menu sebelah kiri.' },
    'rangga.p':   { greeting: 'Hai, Rangga, welcome back!',  lead: 'Berikut ringkasan kerjaan kamu. Cek detail di menu sebelah kiri.' },
    'maya.n':     { greeting: 'Hai, Maya, welcome back!',    lead: 'Berikut ringkasan kerjaan kamu. Cek detail di menu sebelah kiri.' },
    'aulia.t':    { greeting: 'Hai, Aulia, welcome back!',   lead: 'Berikut ringkasan kerjaan kamu. Cek detail di menu sebelah kiri.' }
  };

  // ---- data cache (di-populate oleh refresh()) ----
  const data = {
    greeting: (DATA[session.username] || DATA['kreator']).greeting,
    lead:     (DATA[session.username] || DATA['kreator']).lead,
    briefs:   [],
    progress: [],
    history:  [],
    payments: []
  };

  // ---- refresh: fetch semua data kreator dari Supabase ----
  async function refresh() {
    const me = session.username;
    const [briefsRes, progressRes, historyRes, paymentsRes, scriptsRes] = await Promise.all([
      sb.from('briefs').select('*').order('created_at', { ascending: false }),
      sb.from('progress').select('*').eq('kreator', me).order('updated_at', { ascending: false }),
      sb.from('history').select('*').eq('kreator', me).order('reviewed_at', { ascending: false }),
      sb.from('payments').select('*').eq('kreator', me).order('submitted_at', { ascending: false }),
      sb.from('brief_scripts').select('*').eq('kreator', me)
    ]);
    if (briefsRes.error)   console.error('[refresh] briefs', briefsRes.error);
    if (progressRes.error) console.error('[refresh] progress', progressRes.error);
    if (historyRes.error)  console.error('[refresh] history', historyRes.error);
    if (paymentsRes.error) console.error('[refresh] payments', paymentsRes.error);
    if (scriptsRes.error)  console.error('[refresh] scripts', scriptsRes.error);
    data.briefs   = briefsRes.data   || [];
    data.progress = progressRes.data || [];
    data.history  = historyRes.data  || [];
    data.payments = paymentsRes.data || [];
    data.scripts  = scriptsRes.data  || [];
    return data;
  }

  // ---- script per-kreator per-brief (Supabase) ----
  // Tabel public.brief_scripts: unique(brief_id, kreator) — upsert by composite key.
  // localStorage tetap jadi fallback kalau Supabase error/offline, tapi primary adalah Supabase.
  async function loadScript(briefId) {
    if (!data.scripts) await refresh();
    const row = (data.scripts || []).find(s => s.brief_id === briefId);
    return row ? { script: row.script || '', status: row.status || 'draft' } : { script: '', status: 'draft' };
  }

  async function saveScript(briefId, fields) {
    const me = session.username;
    const payload = {
      brief_id: briefId,
      kreator: me,
      script: fields.script || '',
      status: fields.status || 'draft'
    };
    const res = await sb.from('brief_scripts').upsert(payload, { onConflict: 'brief_id,kreator' }).select();
    if (res.error) {
      console.error('[saveScript]', res.error);
      throw new Error('Simpan script gagal: ' + res.error.message);
    }
    // Update local cache supaya subsequent loadScript ga perlu refetch
    if (!Array.isArray(data.scripts)) data.scripts = [];
    const idx = data.scripts.findIndex(s => s.brief_id === briefId);
    if (idx >= 0) data.scripts[idx] = res.data[0];
    else data.scripts.push(res.data[0]);
    document.dispatchEvent(new CustomEvent('creatorapp:data-changed', { detail: { type: 'script', briefId } }));
    return res.data[0];
  }

  // ---- mutators ----
  async function setStatusOverride(id, status) {
    const { error } = await sb.from('progress')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      console.error('[setStatusOverride]', error);
      showToast('Gagal update status: ' + error.message, 'error');
      return false;
    }
    await refresh();
    document.dispatchEvent(new CustomEvent('creatorapp:data-changed', { detail: { type: 'status', id, status } }));
    return true;
  }

  // ---- topbar render ----
  function renderTopbar() {
    const sessAvatar = document.getElementById('session-avatar');
    const sessName   = document.getElementById('session-name');
    const sessMeta   = document.getElementById('session-meta');
    if (sessAvatar) {
      if (session.photo) {
        sessAvatar.innerHTML = '';
        const img = document.createElement('img');
        img.src = session.photo;
        img.alt = session.displayName || session.username || 'avatar';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '50%';
        sessAvatar.appendChild(img);
      } else {
        sessAvatar.textContent = session.avatar || (session.username || '?').substring(0, 2).toUpperCase();
      }
    }
    if (sessName)   sessName.textContent   = session.displayName || session.username;
    if (sessMeta)   sessMeta.textContent   = 'Cek profil →';
  }

  // ---- topbar user-info clickable ----
  function wireUserInfoClick() {
    const userInfo = document.getElementById('user-info');
    if (userInfo) {
      userInfo.addEventListener('click', function () {
        window.location.href = 'screens-akun.html';
      });
    }
  }

  // ---- sign out ----
  async function handleSignOut(e) {
    if (e) e.preventDefault();
    try { await sb.auth.signOut(); } catch (_) {}
    try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
    window.location.href = 'screens-login.html';
  }
  function wireSignOut() {
    const btnSignOut = document.getElementById('btn-signout');
    const signoutLink = document.getElementById('signout-link');
    if (btnSignOut) btnSignOut.addEventListener('click', handleSignOut);
    if (signoutLink) signoutLink.addEventListener('click', handleSignOut);
  }

  // ---- toast ----
  let toastEl = null;
  function showToast(msg, kind) {
    if (!toastEl) toastEl = document.getElementById('toast');
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  // ---- expose API ----
  const A = {
    SESSION_KEY,
    sb,
    session,
    userBrands: ALL_BRANDS,
    data,
    refresh,
    setStatusOverride,
    loadScript,
    saveScript,
    renderTopbar,
    wireSignOut,
    handleSignOut,
    showToast
  };
  window.CreatorApp = A;

  // ---- auto-init: refresh data dulu, baru kasih tau halaman ----
  try {
    await refresh();
  } catch (e) {
    console.error('[creator-common] refresh gagal', e);
    showToast('Gagal memuat data. Cek koneksi lalu refresh.', 'error');
  }

  renderTopbar();
  wireSignOut();
  wireUserInfoClick();

  // Beri tahu halaman: data sudah siap
  document.dispatchEvent(new CustomEvent('creatorapp:ready', { detail: { data } }));
})();