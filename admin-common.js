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
  const DEFAULT_FEE = 300000;   // nominal fee default per video di-approve (editable di fee panel)
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
    profiles: [],
    approvals: [],
    paymentProofs: []
  };

  async function refresh() {
    const [briefsRes, progressRes, historyRes, paymentsRes, profilesRes, scriptsRes, approvalsRes, proofsRes] = await Promise.all([
      sb.from('briefs').select('*').order('created_at', { ascending: false }),
      sb.from('progress').select('*').order('updated_at', { ascending: false }),
      sb.from('history').select('*').order('reviewed_at', { ascending: false }),
      sb.from('payments').select('*').order('submitted_at', { ascending: false }),
      sb.from('profiles').select('*').order('username'),
      sb.from('brief_scripts').select('*'),
      sb.from('approvals').select('*'),
      sb.from('payment_proofs').select('*').order('created_at', { ascending: false })
    ]);
    if (briefsRes.error)   console.error('[refresh] briefs', briefsRes.error);
    if (progressRes.error) console.error('[refresh] progress', progressRes.error);
    if (historyRes.error)  console.error('[refresh] history', historyRes.error);
    if (paymentsRes.error) console.error('[refresh] payments', paymentsRes.error);
    if (profilesRes.error) console.error('[refresh] profiles', profilesRes.error);
    if (scriptsRes.error)  console.error('[refresh] scripts', scriptsRes.error);
    if (approvalsRes.error) console.error('[refresh] approvals', approvalsRes.error);
    if (proofsRes.error)   console.error('[refresh] payment_proofs', proofsRes.error);
    data.briefs       = briefsRes.data       || [];
    data.progress     = progressRes.data     || [];
    data.history      = historyRes.data      || [];
    data.payments     = paymentsRes.data     || [];
    data.profiles     = profilesRes.data     || [];
    data.scripts      = scriptsRes.data      || [];
    data.approvals    = approvalsRes.data    || [];
    data.paymentProofs = proofsRes.data      || [];
    console.log('[admin-common] progress rows fetched:', data.progress.length, data.progress);
    return data;
  }

  // ---- approvals (multi-admin quorum 3/5) ----
  // Quorum untuk script & video: 3/5 admin harus vote approve (atau reject) untuk status final berubah.
  // Fee: single-admin (tidak pakai quorum), tetap pakai updatePayment.
  const APPROVAL_QUORUM = 3;
  const TOTAL_ADMINS = 5;

  function voteCounts(targetType, targetId) {
    const rows = (data.approvals || []).filter(a => a.target_type === targetType && a.target_id === targetId);
    const counts = { approve: 0, reject: 0, voters: [] };
    rows.forEach(r => {
      if (r.decision === 'approve') counts.approve++;
      else if (r.decision === 'reject') counts.reject++;
      counts.voters.push(r.admin_username);
    });
    return counts;
  }
  function myVote(targetType, targetId) {
    if (!session || !session.username) return null;
    const row = (data.approvals || []).find(a =>
      a.target_type === targetType && a.target_id === targetId && a.admin_username === session.username
    );
    return row ? row.decision : null;
  }
  async function castVote(targetType, targetId, decision, comment) {
    if (!session || !session.username) throw new Error('Session admin tidak ditemukan');
    const payload = {
      target_type: targetType,
      target_id: targetId,
      admin_username: session.username,
      decision,
      comment: comment || null
    };
    const res = await sb.from('approvals').upsert(payload, { onConflict: 'target_type,target_id,admin_username' }).select();
    if (res.error) throw new Error('Vote gagal: ' + res.error.message);
    await refresh();
    document.dispatchEvent(new CustomEvent('adminapp:data-changed', {
      detail: { type: 'vote', targetType, targetId }
    }));
    return res.data[0];
  }
  function quorumReached(counts) {
    return counts.approve >= APPROVAL_QUORUM || counts.reject >= APPROVAL_QUORUM;
  }
  function finalDecision(counts) {
    if (counts.approve >= APPROVAL_QUORUM) return 'approved';
    if (counts.reject >= APPROVAL_QUORUM) return 'rejected';
    return null;
  }

  // ---- payment proofs (upload bukti transfer) ----
  // Path convention: "{payment_id}/{uuid}.{ext}"
  function getProofs(paymentId) {
    return (data.paymentProofs || []).filter(p => p.payment_id === paymentId);
  }
  async function uploadPaymentProof(paymentId, file, note) {
    if (!session || !session.username) throw new Error('Session admin tidak ditemukan');
    if (!file) throw new Error('File wajib diisi');
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
    const filePath = `${paymentId}/${crypto.randomUUID()}.${ext}`;
    // Upload ke Storage
    const upRes = await sb.storage.from('payment-proofs').upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream'
    });
    if (upRes.error) throw new Error('Upload gagal: ' + upRes.error.message);
    // Insert metadata row
    const ins = await sb.from('payment_proofs').insert({
      payment_id: paymentId,
      file_path: filePath,
      file_name: file.name,
      mime_type: file.type || null,
      file_size: file.size || null,
      note: note || null,
      uploaded_by: session.username
    }).select();
    if (ins.error) {
      // Rollback file upload
      try { await sb.storage.from('payment-proofs').remove([filePath]); } catch (_) {}
      throw new Error('Simpan metadata gagal: ' + ins.error.message);
    }
    await refresh();
    document.dispatchEvent(new CustomEvent('adminapp:data-changed', { detail: { type: 'proof-upload', paymentId } }));
    return ins.data[0];
  }
  async function deletePaymentProof(proofId) {
    const proof = (data.paymentProofs || []).find(p => p.id === proofId);
    if (!proof) return;
    const remRes = await sb.storage.from('payment-proofs').remove([proof.file_path]);
    if (remRes.error) throw new Error('Hapus file gagal: ' + remRes.error.message);
    const delRes = await sb.from('payment_proofs').delete().eq('id', proofId);
    if (delRes.error) throw new Error('Hapus metadata gagal: ' + delRes.error.message);
    await refresh();
    document.dispatchEvent(new CustomEvent('adminapp:data-changed', { detail: { type: 'proof-delete', paymentId: proof.payment_id } }));
  }
  // Get signed download URL (valid 1 jam)
  async function getProofDownloadUrl(filePath, expiresIn) {
    const opts = expiresIn ? { expiresIn } : { expiresIn: 3600 };
    const res = await sb.storage.from('payment-proofs').createSignedUrl(filePath, opts.expiresIn);
    if (res.error) throw new Error('Buat link download gagal: ' + res.error.message);
    return res.signedUrl;
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

    // 3) Approve → auto-create baris fee (status pending, nominal default).
    //    id deterministik + ignoreDuplicates → aman kalau video di-approve ulang
    //    setelah revisi (fee yang udah dikoreksi admin nggak ke-reset).
    if (decision === 'approve') {
      const payRes = await sb.from('payments').upsert({
        id: 'pay-' + progressId,
        kreator: item.kreator,
        video_title: item.title,
        brand: item.brand,
        fee: DEFAULT_FEE,
        status: 'pending',
        submitted_at: new Date().toISOString(),
        note: ''
      }, { onConflict: 'id', ignoreDuplicates: true });
      if (payRes.error) {
        console.warn('[recordDecision] payment upsert gagal', payRes.error);
        // Lanjut, status utama sudah terupdate
      }
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
  async function createBrief({ brand, title, meta, deadline, fee, assignedTo }) {
    const id = 'brief-' + brand.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now().toString(36);
    const insRes = await sb.from('briefs').insert({
      id, brand, title, meta: meta || '', deadline: deadline || '—',
      fee: (fee === '' || fee == null) ? null : (Number(fee) || 0),
      assigned_to: assignedTo || null
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
  async function updateScript(briefId, kreator, fields) {
    // brief_scripts: unique(brief_id, kreator) — update by composite key
    const updRes = await sb.from('brief_scripts').update(fields)
      .eq('brief_id', briefId).eq('kreator', kreator);
    if (updRes.error) throw new Error('Update script status gagal: ' + updRes.error.message);
    await refresh();
    document.dispatchEvent(new CustomEvent('adminapp:data-changed', {
      detail: { type: 'script-update', briefId, kreator, fields }
    }));
  }
  async function updateBrief(id, fields) {
    const updRes = await sb.from('briefs').update(fields).eq('id', id);
    if (updRes.error) throw new Error('Update brief gagal: ' + updRes.error.message);
    await refresh();
    document.dispatchEvent(new CustomEvent('adminapp:data-changed', {
      detail: { type: 'brief-update', id, fields }
    }));
    return updRes.data;
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
    updateScript,
    updateBrief,
    updatePayment,
    castVote,
    voteCounts,
    myVote,
    quorumReached,
    finalDecision,
    APPROVAL_QUORUM,
    TOTAL_ADMINS,
    getProofs,
    uploadPaymentProof,
    deletePaymentProof,
    getProofDownloadUrl,
    showToast,
    handleSignOut
  };
  window.AdminApp = A;

  // ---- first refresh ----
  try {
    await refresh();
    console.log('[admin-common] refresh ok:', {
      briefs: data.briefs.length,
      progress: data.progress.length,
      history: data.history.length,
      payments: data.payments.length,
      profiles: data.profiles.length,
      approvals: data.approvals.length
    });
  } catch (e) {
    console.error('[admin-common] refresh gagal', e);
    showToast('Gagal memuat data. Refresh halaman untuk coba lagi.', 'error');
  }

  // ---- realtime subscription: approvals ----
  // Semua admin di-broadcast perubahan approvals (insert/update/delete).
  // Trigger re-fetch + dispatch event supaya UI counter update live.
  try {
    const channel = sb.channel('approvals_admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'approvals' },
        async (payload) => {
          console.log('[admin-realtime] approval change:', payload.eventType, payload.new || payload.old);
          await refresh();
          const ev = payload.new || payload.old;
          document.dispatchEvent(new CustomEvent('adminapp:data-changed', {
            detail: { type: 'vote', targetType: ev.target_type, targetId: ev.target_id, source: 'realtime' }
          }));
        }
      )
      .subscribe((status) => {
        console.log('[admin-realtime] approvals status:', status);
      });
    window.addEventListener('beforeunload', () => {
      try { sb.removeChannel(channel); } catch (_) {}
    });
  } catch (e) {
    console.error('[admin-realtime] approvals subscription error:', e);
  }

  // ---- realtime subscription: payment_proofs ----
  try {
    const proofsChannel = sb.channel('payment_proofs_admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payment_proofs' },
        async (payload) => {
          console.log('[admin-realtime] proof change:', payload.eventType, payload.new || payload.old);
          await refresh();
          const ev = payload.new || payload.old;
          if (ev) {
            document.dispatchEvent(new CustomEvent('adminapp:data-changed', {
              detail: { type: payload.eventType === 'DELETE' ? 'proof-delete' : 'proof-upload', paymentId: ev.payment_id, source: 'realtime' }
            }));
          }
        }
      )
      .subscribe((status) => {
        console.log('[admin-realtime] payment_proofs status:', status);
      });
    window.addEventListener('beforeunload', () => {
      try { sb.removeChannel(proofsChannel); } catch (_) {}
    });
  } catch (e) {
    console.error('[admin-realtime] payment_proofs subscription error:', e);
  }

  document.dispatchEvent(new CustomEvent('adminapp:ready', { detail: { data } }));
})();