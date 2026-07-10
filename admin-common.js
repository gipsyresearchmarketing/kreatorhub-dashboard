/* Shared admin logic — auth guard, data helpers, action handlers.
   VERSI 1: Supabase-backed.

   SETUP halaman:
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
     <script src="supabase-config.js"></script>
     <script src="supabase-client.js"></script>
     <script src="admin-common.js"></script>

   Setiap halaman yang load ini akan punya window.AdminApp:
     - session        (object: { userId, username, role, displayName, avatar })
     - sb             (Supabase client)
     - refresh()      (fetch ulang briefs + progress + history + payments + profiles)
     - data           ({ briefs, progress, history, payments, profiles })
     - showToast(msg, kind?)
     - approveProgress(id, feedback, channel?)
     - rejectProgress(id, feedback, channel?)
     - requestRevision(id, feedback, channel?)
     - createBrief({ brand, title, meta, deadline })
     - updatePayment(id, fields)
     - handleSignOut()

   Halaman render content di dalam event listener 'adminapp:ready'.
*/

(async function () {
  'use strict';

  const SESSION_KEY = 'kreatorhub.session';
  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  }
  const session = getSession();
  if (!session || !session.userId || !session.username) {
    try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
    window.location.replace('screens-login.html');
    return;
  }

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
    console.error('[admin-common] ' + e.message);
    alert('Gagal memuat Supabase. Cek koneksi internet lalu refresh halaman.');
    return;
  }

  // Verifikasi session Supabase valid
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user || user.id !== session.userId) {
    console.warn('[admin-common] Supabase session invalid → logout');
    try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
    window.location.replace('screens-login.html');
    return;
  }

  // Pastikan role admin (cocok dengan profiles.role)
  const { data: profile, error: profErr } = await sb.from('profiles')
    .select('id, username, role, display_name, avatar').eq('id', session.userId).single();
  if (profErr || !profile || profile.role !== 'admin') {
    console.warn('[admin-common] bukan admin, redirect ke login');
    try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
    window.location.replace('screens-login.html');
    return;
  }

  // ---- data cache (populated by refresh()) ----
  const data = {
    briefs:   [],
    progress: [],
    history:  [],
    payments: [],
    profiles: []
  };

  async function refresh() {
    const [briefsRes, progressRes, historyRes, paymentsRes, profilesRes] = await Promise.all([
      sb.from('briefs').select('*').order('created_at', { ascending: false }),
      sb.from('progress').select('*').order('updated_at', { ascending: false }),
      sb.from('history').select('*').order('reviewed_at', { ascending: false }),
      sb.from('payments').select('*').order('submitted_at', { ascending: false }),
      sb.from('profiles').select('*').order('username')
    ]);
    if (briefsRes.error)   console.error('[refresh] briefs', briefsRes.error);
    if (progressRes.error) console.error('[refresh] progress', progressRes.error);
    if (historyRes.error)  console.error('[refresh] history', historyRes.error);
    if (paymentsRes.error) console.error('[refresh] payments', paymentsRes.error);
    if (profilesRes.error) console.error('[refresh] profiles', profilesRes.error);
    data.briefs   = briefsRes.data   || [];
    data.progress = progressRes.data || [];
    data.history  = historyRes.data  || [];
    data.payments = paymentsRes.data || [];
    data.profiles = profilesRes.data || [];
    return data;
  }

  // ---- action: approve / reject / revision ----
  // Update progress.status, insert ke history (snapshot), return ke halaman kreator via notify.
  async function recordDecision(progressId, decision, feedback) {
    const item = data.progress.find(p => p.id === progressId);
    if (!item) throw new Error('Progress ' + progressId + ' tidak ditemukan');

    const statusMap = {
      approve:  'approved',
      revision: 'revisi',
      reject:   'rejected'
    };
    const newStatus = statusMap[decision];
    if (!newStatus) throw new Error('Decision tidak valid: ' + decision);

    // 1) Update progress
    const updRes = await sb.from('progress').update({
      status: newStatus,
      updated_at: new Date().toISOString()
    }).eq('id', progressId);
    if (updRes.error) throw new Error('Update progress gagal: ' + updRes.error.message);

    // 2) Insert history row (snapshot)
    const histId = 'h-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const adminName = profile.display_name || profile.username;
    const insRes = await sb.from('history').insert({
      id: histId,
      progress_id: progressId,
      kreator: item.kreator,
      title: item.title,
      brand: item.brand,
      status: newStatus,
      link: item.video_url || (item.video_storage_path ? '[storage] ' + item.video_storage_path : ''),
      admin: adminName,
      feedback: feedback || '',
      reviewed_at: new Date().toISOString()
    });
    if (insRes.error) {
      console.warn('[recordDecision] history insert gagal', insRes.error);
      // Lanjut, status utama sudah terupdate
    }

    await refresh();
    document.dispatchEvent(new CustomEvent('adminapp:data-changed', {
      detail: { type: 'decision', progressId, decision, newStatus }
    }));
    return true;
  }
  function approveProgress(id, feedback)        { return recordDecision(id, 'approve',  feedback); }
  function rejectProgress(id, feedback)         { return recordDecision(id, 'reject',   feedback); }
  function requestRevision(id, feedback)        { return recordDecision(id, 'revision', feedback); }

  // ---- action: create brief ----
  async function createBrief({ brand, title, meta, deadline }) {
    const id = 'brief-' + brand.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now().toString(36);
    const insRes = await sb.from('briefs').insert({
      id, brand, title, meta: meta || '', deadline: deadline || '—'
    });
    if (insRes.error) throw new Error('Buat brief gagal: ' + insRes.error.message);
    await refresh();
    document.dispatchEvent(new CustomEvent('adminapp:data-changed', {
      detail: { type: 'brief-create', id }
    }));
    return id;
  }
  async function deleteBrief(id) {
    const delRes = await sb.from('briefs').delete().eq('id', id);
    if (delRes.error) throw new Error('Hapus brief gagal: ' + delRes.error.message);
    await refresh();
    document.dispatchEvent(new CustomEvent('adminapp:data-changed', {
      detail: { type: 'brief-delete', id }
    }));
  }

  // ---- action: payment ----
  async function updatePayment(id, fields) {
    const updRes = await sb.from('payments').update(fields).eq('id', id);
    if (updRes.error) throw new Error('Update payment gagal: ' + updRes.error.message);
    await refresh();
    document.dispatchEvent(new CustomEvent('adminapp:data-changed', {
      detail: { type: 'payment', id, fields }
    }));
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

  // ---- sign out ----
  async function handleSignOut(e) {
    if (e) e.preventDefault();
    try { await sb.auth.signOut(); } catch (_) {}
    try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
    window.location.href = 'screens-login.html';
  }

  // ---- expose API ----
  const A = {
    SESSION_KEY,
    sb,
    session: { ...session, role: 'admin', displayName: profile.display_name || session.displayName },
    profile,
    data,
    refresh,
    approveProgress,
    rejectProgress,
    requestRevision,
    createBrief,
    deleteBrief,
    updatePayment,
    showToast,
    handleSignOut
  };
  window.AdminApp = A;

  // ---- first refresh ----
  try {
    await refresh();
  } catch (e) {
    console.error('[admin-common] refresh gagal', e);
    showToast('Gagal memuat data. Refresh halaman untuk coba lagi.', 'error');
  }

  document.dispatchEvent(new CustomEvent('adminapp:ready', { detail: { data } }));
})();