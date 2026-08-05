# Claude Memory Sync — setup & usage

Memory Claude Code sekarang bisa di-sync ke **Supabase** (table `claude_memory`) supaya ga cuma nyangkut di local disk satu mesin. Bisa di-pull dari mesin lain, atau jadi single source of truth yang di-share.

## Arsitektur

```
┌─────────────────────────────────────┐         ┌─────────────────────┐
│ Local:                               │         │ Supabase:           │
│ ~/.claude/projects/.../memory/*.md   │ ◄────►  │ public.claude_memory │
│                                       │  sync   │ (name, body, meta) │
└─────────────────────────────────────┘         └─────────────────────┘
        ↑                                                  ↑
        │ loaded ke context tiap session                   │
        │ (Claude Code baca MEMORY.md otomatis)            │
```

## Setup satu kali

### 1. Run SQL migration

Di **Supabase → SQL Editor**, paste & run:

```bash
# File: supabase/add-claude-memory-table.sql
```

Output: table `public.claude_memory` + RLS deny-all (semua akses via service_role).

### 2. Ambil service_role key

**Supabase → Settings → API → service_role** → klik "reveal" → copy.

⚠️ **JANGAN PERNAH commit key ini.** Service_role bypass semua RLS.

### 3. Set env var di shell

Tambahin ke `~/.zshrc` (atau shell rc lo):

```bash
export SUPABASE_SERVICE_ROLE_KEY="eyJhbG...service_role..."
```

Reload:
```bash
source ~/.zshrc
```

Verifikasi:
```bash
echo $SUPABASE_SERVICE_ROLE_KEY | head -c 30
# Expected: eyJhbGciOiJIUzI1NiIsInR5cCI6...
```

## Pakai tiap hari

### Push (local → Supabase)

```bash
cd "/Users/bagas/Documents/Website content creator"
node tools/claude-memory-sync.js push
```

Output: daftar semua file `.md` di memory folder, upload ke table `claude_memory` (upsert by name).

### Pull (Supabase → local)

Di mesin baru, atau kalau local memory ilang:

```bash
node tools/claude-memory-sync.js pull
```

Output: fetch semua rows dari Supabase → tulis file `.md` ke memory folder.

### Status (diff)

```bash
node tools/claude-memory-sync.js status
```

Output:
- Files local-only (perlu push)
- Files remote-only (perlu pull)
- Files di kedua sisi

## Workflow yang disarankan

### Tiap kali nambah/update memory file lokal:

```bash
# 1. Edit/buat memory file (Claude otomatis)
# 2. Push ke Supabase
node tools/claude-memory-sync.js push
```

### Pas pindah mesin / install Claude Code baru:

```bash
# 1. Clone repo (atau manual setup)
# 2. Set SUPABASE_SERVICE_ROLE_KEY di shell
# 3. Pull semua memory dari Supabase
node tools/claude-memory-sync.js pull
# 4. Memory langsung ke-load di session berikutnya
```

## File yang di-skip

- `MEMORY.md` — itu index, bukan memory entry. Gak di-sync (generate ulang manual dari MEMORY.md setelah pull kalau perlu).
- File non-`.md` — di-skip.
- Folder kosong — di-skip.

## Format memory file

File memory pake frontmatter YAML:

```markdown
---
name: nama-slug
description: one-liner summary
metadata:
  type: project
  custom_key: value
---

Body markdown di sini...
```

Script otomatis parse frontmatter → simpan ke kolom `description` (string) + `metadata` (jsonb) + `body` (text).

## Schema Supabase

```sql
create table public.claude_memory (
  name        text primary key,                       -- e.g. 'reset-password-self-service'
  description text,                                   -- dari frontmatter
  body        text not null,                          -- markdown content (no frontmatter)
  metadata    jsonb not null default '{}'::jsonb,    -- sisa frontmatter
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

Trigger `claude_memory_touch` auto-update `updated_at` on row update.

RLS: deny-all untuk `anon` + `authenticated`. Service_role bypass RLS.

## Troubleshooting

### "SUPABASE_SERVICE_ROLE_KEY env var ga di-set"

→ `export SUPABASE_SERVICE_ROLE_KEY="..."` di shell lo, lalu `source ~/.zshrc`.

### "HTTP 401: Invalid API key"

→ Service_role key salah. Re-copy dari Supabase Dashboard.

### "HTTP 404: claude_memory not found"

→ SQL migration belum dijalankan. Run `supabase/add-claude-memory-table.sql` di SQL Editor.

### "permission denied for table claude_memory"

→ Jangan pakai anon key. Service_role WAJIB.

### File ke-sync tapi content kosong

→ File local korup / frontmatter malformed. Cek format YAML di file.

## Next steps (future)

- Auto-push via git post-commit hook
- File watcher (`fs.watch`) untuk real-time push
- Multi-project support (tambah kolom `project_id`)
- Conflict resolution (3-way merge)

Saat ini MVP: manual push/pull. Real-time watcher bisa ditambah kalau perlu.