/* Shared logic for all creator pages (ringkasan, brief, upload, progres, riwayat, akun)
   Setiap halaman yang memuat file ini akan memiliki global:
     - window.CreatorApp.session       (object session kreator)
     - window.CreatorApp.userBrands   (array brand yg diizinkan)
     - window.CreatorApp.data         ({greeting, lead, briefs, progress, history})
     - window.CreatorApp.showToast(msg)  (helper toast)
     - window.CreatorApp.handleSignOut() (handler keluar)
*/

(function () {
  'use strict';

  // ---- session ----
  const SESSION_KEY = 'kreatorhub.session';
  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  }
  let session = getSession();
  if (!session || session.role !== 'kreator') {
    // Tidak ada session kreator yang valid → balik ke login.
    // File ini di-load oleh 10 halaman kreator (creator, brief, brief-detail, upload,
    // progres, progres-detail, script, riwayat, bayaran, akun).
    try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
    window.location.replace('screens-login.html');
    return; // hentikan eksekusi IIFE; browser yang handle redirect
  }

  // ---- brand list (semua kreator punya akses ke semua brand) ----
  const ALL_BRANDS = ['Jamuzen', 'CalmadeAI', 'Conventio', 'Gipsy Research'];

  // ---- per-kreator data ----
  const BRANDS = {
    'sasa.id':    [...ALL_BRANDS],
    'dimas.h':    [...ALL_BRANDS],
    'rangga.p':   [...ALL_BRANDS],
    'maya.n':     [...ALL_BRANDS],
    'aulia.t':    [...ALL_BRANDS],
    'testing123': [...ALL_BRANDS]
  };

  // ---- data bersama ----
  const SHARED_BRIEFS = [
    { id: 'brief-sasa-1',  brand: 'Jamuzen',        title: 'Video unboxing kopi sachet — 30 detik', meta: 'Target 18–25 · Tone kasual · Deadline 3 hari lagi', deadline: '15 Jul' },
    { id: 'brief-sasa-2',  brand: 'CalmadeAI',      title: 'Tutorial AI: bikin thumbnail 5 menit',   meta: 'Format landscape · 1080p · Voice-over Indonesia · 5 hari lagi', deadline: '17 Jul' },
    { id: 'brief-dimas-1', brand: 'CalmadeAI',      title: 'Tutorial AI — series 3 episode',          meta: 'Voice-over Indonesia · 1080p · 5 hari lagi', deadline: '20 Jul' },
    { id: 'brief-rangga-1',brand: 'Conventio',      title: 'Teaser event "Creative Day" — 15 detik', meta: '3 variasi hook · Musik bebas · Mulai kapan saja', deadline: '—' },
    { id: 'brief-maya-1',  brand: 'Gipsy Research', title: 'Riset audiens Gen Z — 3 take wawancara', meta: 'Sample 5 orang · Tanpa lighting studio', deadline: '22 Jul' },
    { id: 'brief-aulia-1', brand: 'Jamuzen',        title: 'Mini-series kopi sachet eps 1-3',         meta: 'Voice-over · 30 detik/eps · 7 hari lagi', deadline: '13 Jul' },
    { id: 'brief-aulia-2', brand: 'Jamuzen',        title: 'Behind the barista',                      meta: 'Longform · 3 menit', deadline: '20 Jul' },
    { id: 'brief-test-1',  brand: 'Jamuzen',        title: 'Sample brief — video unboxing 30 detik', meta: 'Tone kasual · Target audiens 18–25 · Coba submit link YouTube publik', deadline: '—' }
  ];

  const SHARED_PROGRESS = [
    { id: 'p1',  title: 'Unboxing Kopi Sachet — V2',         brand: 'Jamuzen',        status: 'review',   meta: 'Diupload 2 jam lalu' },
    { id: 'p2',  title: 'Tutorial AI Thumbnail — Take 1',     brand: 'CalmadeAI',      status: 'approved', meta: 'Diupload kemarin' },
    { id: 'p3',  title: 'Teaser Creative Day — variasi A',    brand: 'Conventio',      status: 'draft',    meta: 'Disimpan 3 jam lalu' },
    { id: 'p4',  title: 'Tutorial AI Thumbnail — Take 2',     brand: 'CalmadeAI',      status: 'review',   meta: 'Dikirim 5 jam lalu' },
    { id: 'p5',  title: 'Teaser Creative Day — Variasi B',    brand: 'Conventio',      status: 'review',   meta: 'Dikirim 1 hari lalu' },
    { id: 'p6',  title: 'Riset audiens — draft 1',            brand: 'Gipsy Research', status: 'draft',    meta: 'Disimpan kemarin' },
    { id: 'p7',  title: 'Cuplikan event bulan lalu',          brand: 'Jamuzen',        status: 'review',   meta: 'Dikirim 2 hari lalu' },
    { id: 'p8',  title: 'Mini-series eps 1',                  brand: 'Jamuzen',        status: 'review',   meta: 'Dikirim kemarin' },
    { id: 'p9',  title: 'Mini-series eps 2',                  brand: 'Jamuzen',        status: 'draft',    meta: 'Disimpan 1 jam lalu' },
    { id: 'p10', title: 'Behind the barista — Take 1',        brand: 'Jamuzen',        status: 'draft',    meta: 'Disimpan 3 hari lalu' },
    { id: 'p11', title: 'Test video 1',                       brand: 'Jamuzen',        status: 'draft',    meta: 'Buat video pertama Anda untuk eksplorasi' },
    { id: 'p12', title: 'Test video 2',                       brand: 'Jamuzen',        status: 'review',   meta: 'Sedang direview admin · lihat notifikasi di WA' }
  ];

  const SHARED_HISTORY = [
    { id: 'h1', title: 'POV Pagi Barista',                  brand: 'Jamuzen',        status: 'approved', link: 'drive.google/…/pagi',     admin: 'Mira (Admin)',  feedback: 'Cut opening 5 detik, pacing lebih oke. Pakai take ini untuk tayang.', when: '3 hari lalu' },
    { id: 'h2', title: 'Unboxing Kopi Sachet — V2',         brand: 'Jamuzen',        status: 'review',   link: 'drive.google/…/v2',      admin: '',              feedback: '', when: '2 jam lalu' },
    { id: 'h3', title: 'Behind The Scene Lipat Kertas',     brand: 'Conventio',      status: 'approved', link: 'vimeo.com/…/kertas',     admin: 'Mira (Admin)',  feedback: 'Sip, tayang minggu depan.', when: 'minggu lalu' },
    { id: 'h4', title: 'Voice-over Tutorial Batch 1',       brand: 'CalmadeAI',      status: 'approved', link: 'youtu.be/…/batch1',     admin: 'Dimas',         feedback: 'Audio jernih.', when: 'minggu lalu' },
    { id: 'h5', title: 'Behind The Scene Lipat Kertas (R)', brand: 'Conventio',      status: 'approved', link: 'vimeo.com/…/kertas-r',  admin: 'Mira (Admin)',  feedback: 'Sip, tayang minggu depan.', when: '2 minggu lalu' },
    { id: 'h6', title: 'Eksperimen Kopi Dingin (take awal)',brand: 'Gipsy Research', status: 'rejected', link: 'drive.google/…/dingin',  admin: 'Dimas (Admin)', feedback: 'Brief minta angle lain — ini terlalu umum. Submit ulang dengan angle rasa.', when: '2 minggu lalu' },
    { id: 'h7', title: 'POV Pagi Barista (Aulia)',          brand: 'Jamuzen',        status: 'approved', link: 'drive.google/…/pagi-a',  admin: 'Mira (Admin)',  feedback: 'Kualitas bagus. Tambah 1 lagi seperti ini.', when: 'minggu lalu' },
    { id: 'h8', title: 'Eksperimen Boba',                   brand: 'Jamuzen',        status: 'approved', link: 'drive.google/…/boba',    admin: 'Mira (Admin)',  feedback: 'Setuju tayang.', when: '2 minggu lalu' },
    { id: 'h9', title: 'Riwayat kosong',                    brand: 'Jamuzen',        status: 'approved', link: '—',                     admin: '',              feedback: '', when: 'baru' }
  ];

  // ---- data fee per video (status bayaran iklan) ----
  // adSpend: total brand ad spend untuk campaign video ini
  // grossRevenue: total revenue campaign (dipakai untuk hitung ROAS + komisi %)
  // status: 'paid' (sudah ditransfer) atau 'pending' (menunggu approval / batch berikutnya)
  const SHARED_PAYMENTS = [
    { id: 'pay-1',  videoTitle: 'POV Pagi Barista',                brand: 'Jamuzen',        fee: 150000, adSpend: 500000,  grossRevenue: 1800000, status: 'paid',    submittedAt: '5 hari lalu',     paidAt: '3 hari lalu',   note: '' },
    { id: 'pay-2',  videoTitle: 'Behind The Scene Lipat Kertas',   brand: 'Conventio',      fee: 200000, adSpend: 800000,  grossRevenue: 2800000, status: 'paid',    submittedAt: '2 minggu lalu',   paidAt: 'minggu lalu',   note: '' },
    { id: 'pay-3',  videoTitle: 'Voice-over Tutorial Batch 1',     brand: 'CalmadeAI',      fee: 175000, adSpend: 600000,  grossRevenue: 2200000, status: 'paid',    submittedAt: '2 minggu lalu',   paidAt: 'minggu lalu',   note: '' },
    { id: 'pay-4',  videoTitle: 'POV Pagi Barista (Aulia)',        brand: 'Jamuzen',        fee: 150000, adSpend: 500000,  grossRevenue: 1800000, status: 'paid',    submittedAt: 'minggu lalu',     paidAt: '5 hari lalu',   note: '' },
    { id: 'pay-5',  videoTitle: 'Eksperimen Boba',                 brand: 'Jamuzen',        fee: 175000, adSpend: 700000,  grossRevenue: 2400000, status: 'paid',    submittedAt: '2 minggu lalu',   paidAt: '2 minggu lalu', note: '' },
    { id: 'pay-6',  videoTitle: 'Unboxing Kopi Sachet — V2',       brand: 'Jamuzen',        fee: 150000, adSpend: 600000,  grossRevenue: 1800000, status: 'pending', submittedAt: '2 hari lalu',     paidAt: null,           note: 'Menunggu approval admin' },
    { id: 'pay-7',  videoTitle: 'Tutorial AI Thumbnail — Take 2',  brand: 'CalmadeAI',      fee: 175000, adSpend: 800000,  grossRevenue: 2700000, status: 'pending', submittedAt: '5 jam lalu',      paidAt: null,           note: 'Antrian batch berikutnya' },
    { id: 'pay-8',  videoTitle: 'Teaser Creative Day — Variasi B', brand: 'Conventio',      fee: 200000, adSpend: 1000000, grossRevenue: 3200000, status: 'pending', submittedAt: '1 hari lalu',     paidAt: null,           note: 'Menunggu approval admin' },
    { id: 'pay-9',  videoTitle: 'Cuplikan event bulan lalu',      brand: 'Jamuzen',        fee: 150000, adSpend: 650000,  grossRevenue: 2100000, status: 'pending', submittedAt: '2 hari lalu',     paidAt: null,           note: 'Antrian batch berikutnya' },
    { id: 'pay-10', videoTitle: 'Mini-series eps 1',               brand: 'Jamuzen',        fee: 150000, adSpend: 650000,  grossRevenue: 2200000, status: 'pending', submittedAt: 'kemarin',         paidAt: null,           note: 'Menunggu approval admin' }
  ];

  // greeting + lead tetap personal, data briefs/progress/history dishare
  const DATA = {
    'testing123': { greeting: 'Hai, Tester. Welcome back!', lead: 'Anda login sebagai akun testing. Coba-coba semua fitur — hapus/edit tidak akan tersimpan permanen.' },
    'sasa.id':    { greeting: 'Hai, Sasa, welcome back!',   lead: 'Berikut ringkasan kerjaan kamu. Cek detail di menu sebelah kiri.' },
    'dimas.h':    { greeting: 'Hai, Dimas, welcome back!',  lead: 'Berikut ringkasan kerjaan kamu. Cek detail di menu sebelah kiri.' },
    'rangga.p':   { greeting: 'Hai, Rangga, welcome back!', lead: 'Berikut ringkasan kerjaan kamu. Cek detail di menu sebelah kiri.' },
    'maya.n':     { greeting: 'Hai, Maya, welcome back!',   lead: 'Berikut ringkasan kerjaan kamu. Cek detail di menu sebelah kiri.' },
    'aulia.t':    { greeting: 'Hai, Aulia, welcome back!',  lead: 'Berikut ringkasan kerjaan kamu. Cek detail di menu sebelah kiri.' }
  };

  // ---- status overrides (diubah dari halaman script, persist via localStorage) ----
  const STATUS_OVERRIDE_KEY = 'kreatorhub.status-overrides';
  function getStatusOverrides() {
    try { return JSON.parse(localStorage.getItem(STATUS_OVERRIDE_KEY) || '{}'); } catch (_) { return {}; }
  }
  function setStatusOverride(id, status) {
    const m = getStatusOverrides();
    m[id] = status;
    try { localStorage.setItem(STATUS_OVERRIDE_KEY, JSON.stringify(m)); } catch (_) {}
  }
  function clearStatusOverrides() {
    try { localStorage.removeItem(STATUS_OVERRIDE_KEY); } catch (_) {}
  }

  function applyStatusOverrides(progressArr) {
    const overrides = getStatusOverrides();
    return progressArr.map(p => overrides[p.id] ? Object.assign({}, p, { status: overrides[p.id] }) : p);
  }

  function getKreatorData(username) {
    const meta = DATA[username] || DATA['sasa.id'];
    return {
      ...meta,
      briefs: SHARED_BRIEFS,
      progress: applyStatusOverrides(SHARED_PROGRESS),
      history: SHARED_HISTORY,
      payments: SHARED_PAYMENTS
    };
  }

  const userBrands = BRANDS[session.username] || (session.brands || []);
  const data = getKreatorData(session.username);

  // ---- render topbar session info ----
  function renderTopbar() {
    const sessAvatar = document.getElementById('session-avatar');
    const sessName   = document.getElementById('session-name');
    const sessMeta   = document.getElementById('session-meta');
    if (sessAvatar) {
      // kalau ada foto di session, pakai img, kalau tidak pakai initials
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
        sessAvatar.textContent = session.avatar || '?';
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
  function handleSignOut(e) {
    if (e) e.preventDefault();
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
  function showToast(msg) {
    if (!toastEl) toastEl = document.getElementById('toast');
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  // ---- expose global API ----
  window.CreatorApp = {
    SESSION_KEY,
    session,
    userBrands,
    data,
    ALL_BRANDS,
    BRANDS,
    SHARED_BRIEFS,
    SHARED_PROGRESS,
    SHARED_HISTORY,
    SHARED_PAYMENTS,
    DATA,
    getKreatorData,
    setStatusOverride,
    clearStatusOverrides,
    renderTopbar,
    wireSignOut,
    handleSignOut,
    showToast
  };

  // auto-init topbar + signout on load
  document.addEventListener('DOMContentLoaded', function () {
    renderTopbar();
    wireSignOut();
    wireUserInfoClick();
  });
})();
