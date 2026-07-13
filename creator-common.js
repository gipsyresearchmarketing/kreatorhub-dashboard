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

  // ---- session: single source of truth = Supabase Auth (sb.auth) ----
  // Tidak pakai localStorage mirror lagi. Supabase manage session persistence di sb.auth.
  // Kita cuma butuh: userId (sb.auth.user.id), username/role/displayName (dari profiles table).

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
  if (authErr || !user) {
    console.warn('[creator-common] Supabase session invalid/expired → logout');
    window.location.replace('screens-login.html');
    return;
  }

  // Lookup profile kreator dari Supabase (single source of truth)
  const { data: profile, error: profErr } = await sb.from('profiles')
    .select('id, username, role, display_name, avatar, phone, email, bank_name, bank_account')
    .eq('id', user.id)
    .single();
  if (profErr || !profile) {
    console.warn('[creator-common] profile tidak ditemukan → logout');
    window.location.replace('screens-login.html');
    return;
  }
  // Build session object dari Supabase (ganti sumber dari localStorage)
  const session = {
    userId: user.id,
    username: profile.username,
    role: profile.role,
    displayName: profile.display_name || profile.username,
    avatar: profile.avatar || null,
    userEmail: user.email,
    phone: profile.phone || '',
    email: profile.email || user.email || '',
    bankName: profile.bank_name || '',
    bankAccount: profile.bank_account || ''
  };

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
    'aulia.t':    { greeting: 'Hai, Aulia, welcome back!',   lead: 'Berikut ringkasan kerjaan kamu. Cek detail di menu sebelah kiri.' },
    'pipit':      { greeting: 'Hai, Pipit, welcome back!',   lead: 'Berikut ringkasan kerjaan kamu. Cek detail di menu sebelah kiri.' },
    'cherly':     { greeting: 'Hai, Cherly, welcome back!',  lead: 'Berikut ringkasan kerjaan kamu. Cek detail di menu sebelah kiri.' }
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
    const [briefsRes, progressRes, historyRes, paymentsRes, scriptsRes, proofsRes] = await Promise.all([
      sb.from('briefs').select('*').order('created_at', { ascending: false }),
      sb.from('progress').select('*').eq('kreator', me).order('updated_at', { ascending: false }),
      sb.from('history').select('*').eq('kreator', me).order('reviewed_at', { ascending: false }),
      sb.from('payments').select('*').eq('kreator', me).order('submitted_at', { ascending: false }),
      sb.from('brief_scripts').select('*').eq('kreator', me),
      sb.from('payment_proofs').select('*').order('created_at', { ascending: false })
    ]);
    if (briefsRes.error)   console.error('[refresh] briefs', briefsRes.error);
    if (progressRes.error) console.error('[refresh] progress', progressRes.error);
    if (historyRes.error)  console.error('[refresh] history', historyRes.error);
    if (paymentsRes.error) console.error('[refresh] payments', paymentsRes.error);
    if (scriptsRes.error)  console.error('[refresh] scripts', scriptsRes.error);
    if (proofsRes.error)   console.error('[refresh] payment_proofs', proofsRes.error);
    data.briefs       = briefsRes.data       || [];
    data.progress     = progressRes.data     || [];
    data.history      = historyRes.data      || [];
    data.payments     = paymentsRes.data     || [];
    data.scripts      = scriptsRes.data      || [];
    data.paymentProofs = proofsRes.data      || [];
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
    // Supabase Auth auto-clear session token; ga perlu localStorage lagi
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

  // ---- upload helpers (dipakai oleh brief-detail + legacy screens-upload) ----
  // Upload file ke Supabase Storage dengan path "{username}/{timestamp}-{filename}"
  // supaya RLS kreator self-upload jalan (policy baca folder pertama = username).
  async function uploadFile(file, bucket) {
    if (!file) return null;
    const me = session.username;
    const ts = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${me}/${ts}-${safeName}`;
    const { error } = await sb.storage.from(bucket).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined
    });
    if (error) throw new Error('Upload ' + bucket + ' gagal: ' + error.message);
    return path;
  }

  // Submit progress row baru. Payload: { title, brand, status, video_url?, video_storage_path?, thumbnail_path?, brief_id?, meta? }
  async function submitProgress(payload) {
    if (!session || !session.username) throw new Error('Session kreator tidak ditemukan');
    const newId = 'p-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const insertRes = await sb.from('progress').insert(Object.assign({
      id: newId,
      kreator: session.username,
      updated_at: new Date().toISOString()
    }, payload));
    if (insertRes.error) throw new Error('Gagal simpan progress: ' + insertRes.error.message);
    await refresh();
    return newId;
  }

  // ---- save profile (display_name, phone, email, bank_name, bank_account) ----
  // Single source of truth = Supabase profiles table.
  async function saveProfile(fields) {
    if (!session || !session.userId) throw new Error('Session tidak ditemukan');
    // Whitelist kolom yang boleh di-update dari kreator side
    const allowed = {};
    if (typeof fields.displayName === 'string') allowed.display_name = fields.displayName;
    if (typeof fields.phone === 'string') allowed.phone = fields.phone;
    if (typeof fields.email === 'string') allowed.email = fields.email;
    if (typeof fields.bankName === 'string') allowed.bank_name = fields.bankName;
    if (typeof fields.bankAccount === 'string') allowed.bank_account = fields.bankAccount;
    if (typeof fields.avatar === 'string' || fields.avatar === null) allowed.avatar = fields.avatar;
    if (Object.keys(allowed).length === 0) return;
    const updRes = await sb.from('profiles').update(allowed).eq('id', session.userId);
    if (updRes.error) throw new Error('Simpan profil gagal: ' + updRes.error.message);
    // Update local session mirror
    if (allowed.display_name != null) session.displayName = allowed.display_name;
    if (allowed.phone != null) session.phone = allowed.phone;
    if (allowed.email != null) session.email = allowed.email;
    if (allowed.bank_name != null) session.bankName = allowed.bank_name;
    if (allowed.bank_account != null) session.bankAccount = allowed.bank_account;
    if (allowed.avatar !== undefined) session.avatar = allowed.avatar;
    await refresh();
  }

  // ---- expose API ----
  const A = {
    sb,
    session,
    userBrands: ALL_BRANDS,
    data,
    refresh,
    setStatusOverride,
    loadScript,
    saveScript,
    uploadFile,
    submitProgress,
    saveProfile,
    getProofs: (paymentId) => (data.paymentProofs || []).filter(p => p.payment_id === paymentId),
    getProofDownloadUrl: async (filePath, expiresIn) => {
      const opts = expiresIn || 3600;
      const res = await sb.storage.from('payment-proofs').createSignedUrl(filePath, opts);
      if (res.error) throw new Error('Buat link download gagal: ' + res.error.message);
      return res.signedUrl;
    },
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

  // ---- realtime subscription: brief_scripts ----
  console.log('[realtime] setting up brief_scripts subscription for kreator:', session.username);
  try {
    const channel = sb.channel('brief_scripts_' + session.username)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'brief_scripts',
          filter: 'kreator=eq.' + session.username
        },
        async (payload) => {
          console.log('[realtime] script change received:', payload.eventType, payload.new || payload.old);
          // Update local cache
          if (!Array.isArray(data.scripts)) data.scripts = [];
          if (payload.eventType === 'DELETE') {
            const idx = data.scripts.findIndex(s => s.brief_id === payload.old.brief_id);
            if (idx >= 0) data.scripts.splice(idx, 1);
          } else {
            // INSERT or UPDATE
            const row = payload.new;
            const idx = data.scripts.findIndex(s => s.brief_id === row.brief_id);
            if (idx >= 0) data.scripts[idx] = row;
            else data.scripts.push(row);
          }
          // Dispatch event supaya halaman re-render
          document.dispatchEvent(new CustomEvent('creatorapp:data-changed', {
            detail: { type: 'script', briefId: (payload.new || payload.old).brief_id, source: 'realtime' }
          }));
        }
      )
      .subscribe((status, err) => {
        console.log('[realtime] brief_scripts status:', status, err ? 'err=' + JSON.stringify(err) : '');
      });
    // Cleanup saat page unload
    window.addEventListener('beforeunload', () => {
      try { sb.removeChannel(channel); } catch (_) {}
    });
  } catch (e) {
    console.error('[realtime] brief_scripts subscription error:', e);
  }

  // ---- realtime subscription: payment_proofs (kreator lihat bukti transfer baru) ----
  try {
    const proofsChannel = sb.channel('payment_proofs_kreator_' + session.username)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payment_proofs' },
        async (payload) => {
          console.log('[realtime] payment_proof change:', payload.eventType);
          await refresh();
          const ev = payload.new || payload.old;
          if (ev) {
            document.dispatchEvent(new CustomEvent('creatorapp:data-changed', {
              detail: { type: payload.eventType === 'DELETE' ? 'proof-delete' : 'proof-upload', paymentId: ev.payment_id, source: 'realtime' }
            }));
          }
        }
      )
      .subscribe((status) => {
        console.log('[realtime] payment_proofs status:', status);
      });
    window.addEventListener('beforeunload', () => {
      try { sb.removeChannel(proofsChannel); } catch (_) {}
    });
  } catch (e) {
    console.error('[realtime] payment_proofs subscription error:', e);
  }

  // Beri tahu halaman: data sudah siap
  document.dispatchEvent(new CustomEvent('creatorapp:ready', { detail: { data } }));
})();