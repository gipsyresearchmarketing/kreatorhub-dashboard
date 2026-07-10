# Admin dashboard — status & lanjutan kerja

> Snapshot per akhir sesi Jul 2026. File ini dibuat biar bisa langsung lanjut sesi berikutnya tanpa kehilangan konteks.

## File-file yang berubah / dibuat di sesi ini

| File | Status | Catatan |
|------|--------|---------|
| `screens-admin1.html` | Heavy iteration | Main admin panel, fee panel jadi reactive, stat cards clickable |
| `screens-admin-settings.html` | **Baru** | Pengaturan admin (profil, kelola kreator, notifikasi, keamanan) |
| `screens-reports.html` | **Baru** | Halaman laporan detail dengan 12 section (satu per stat card) |
| `screens-admin-brief-detail.html` | **Baru** | Detail brief + workflow aksi admin (setujui/revisi/tolak) |

## Yang udah selesai ✓

### Fee panel (di `screens-admin1.html`)
- Toolbar: search | status filter | period filter | toggle `[Semua | Per Brand | Per Kreator]` | dropdown | CSV
- 4 stat cards (Total fee, Sudah dibayar, Menunggu approval, Rata-rata) — semua clickable → navigate ke reports page
- Tabel detail sync dengan top toggle (filter by brand/creator sesuai scope)
- Indikator di atas tabel: "Menampilkan N entri · Brand: X / Kreator: Y"
- Chart di bawah tabel udah dihapus total

### Profile dropdown (topnav)
- Avatar MR di kanan atas → dropdown dengan 5 menu items
- Akses: Reset password kreator, Nonaktifkan kreator, Tambah kreator baru, Pengaturan notifikasi, Profil admin, Keluar
- Logout confirmation modal (dengan "Ingat device ini" checkbox)

### Stat cards → halaman dedicated
- 12 stat card di seluruh admin1 (queue + reports + fee) clickable
- Klik → navigate ke `screens-reports.html#<stat-name>` (triple-layered: inline onclick + JS click + JS mousedown + keyboard)
- Halaman reports punya 12 section lengkap dengan metric + item list

### Brief detail page
- Judul brief di admin1 jadi `<a class="brief-title-link">` 
- Klik → `screens-admin-brief-detail.html?id=b-1` (dst)
- Halaman detail: brief info, script (dari localStorage), video list, action buttons, timeline
- Action buttons: Setujui / Minta revisi / Tolak / Tandai selesai (berubah sesuai status)
- Action confirm → modal dengan note textarea + channel Email/WhatsApp toggle
- Status di-save ke localStorage biar kreator bisa liat di mode kreator

### Yang dihapus
- FILTER BRAND card (chip "Semua brand / Gipsy Research / dst") di queue panel
- Tombol "Reset sandi" + "Nonaktifkan" di tabel kreator (dipindah ke profile menu)
- Link "Keluar" di sidebar (dipindah ke profile menu)
- Chart "Fee per brand" + "Fee per kreator" (udah dari awal ga relevan)

## Yang mungkin perlu dilanjutin nanti

1. **Stat detail verification** — Bagas bilang "masi belum bisa menuju ke page masing-masing", udah difix dengan 3 lapis handler tapi perlu dicek lagi
2. **Brief detail page** — masih baru, mungkin perlu:
   - Lebih banyak mock data video
   - History timeline yang lebih lengkap
   - Visual feedback saat status berubah
3. **Settings page** — notifikasi & keamanan section masih visual only
4. **Tambah kreator modal** — di settings page vs di admin1 perlu disatukan style-nya
5. **Modul "Profil admin"** — di settings page udah ada, bisa diisi form edit yang functional

## Pattern yang dipake di sesi ini (buat konsisten)

### Click handler yang robust (untuk stat cards / brief titles)
```html
<!-- 1. Inline onclick (safety net) -->
<a onclick="window.location.href='...'" role="link" tabindex="0">

<!-- 2. JS click handler -->
card.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); go(); });

<!-- 3. JS mousedown (faster) -->
card.addEventListener('mousedown', (e) => { if (e.button === 0) go(); });

<!-- 4. Keyboard support -->
card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') go(); });
```

### Modal pattern
```html
<div class="modal-backdrop" id="X-modal">
  <div class="modal" style="max-width: 480px;">
    <h3>Title</h3>
    <p class="lead">Subtitle</p>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="X-cancel">Batal</button>
      <button class="btn btn-primary" id="X-confirm">OK</button>
    </div>
  </div>
</div>
```
Open: `modal.classList.add('show')`. Close: remove. Backdrop + Escape juga close.

### Topnav profile dropdown
- Avatar button + dropdown, `position: absolute`, `z-index: 200`
- Topnav z-index: 100 (di atas konten lain)
- Bind click ke button + parent `.profile-menu` (defensive)
- Outside-click + Escape keyboard handler

## LocalStorage keys

| Key | Siapa baca/tulis | Isi |
|-----|------------------|-----|
| `kreatorhub.brief-state.<id>` | admin brief detail + kreator brief detail | `{ status, script, lastAdminUpdate? }` |

## Konvensi Bagas yang kudu dipertahanin

- Bahasa Indonesia untuk semua label UI
- Format duit: `Rp 350 rb` (pendek) atau `Rp 350.000` (lengkap)
- Format waktu: `5 jam lalu`, `kemarin`, `minggu lalu` (relative)
- Incremental polish — chain beberapa refinement dalam satu fitur
- Stat cards / link harus clickable (jangan cuma visual)
- Tombol destructive (Tolak, Keluar) pake `btn-danger` (red)
- Tombol primary (Setujui, Simpan) pake `btn-primary` (accent)
- Tombol secondary (Batal, Reset) pake `btn-secondary` (border-only)
