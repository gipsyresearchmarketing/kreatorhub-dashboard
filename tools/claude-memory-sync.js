#!/usr/bin/env node
/**
 * Sync Claude Code memory ↔ Supabase claude_memory table.
 *
 * Usage:
 *   node tools/claude-memory-sync.js push          # local → Supabase
 *   node tools/claude-memory-sync.js pull          # Supabase → local
 *   node tools/claude-memory-sync.js status        # show diff (local vs Supabase)
 *
 * Env (required):
 *   SUPABASE_URL                — defaults to read from supabase-config.js
 *   SUPABASE_SERVICE_ROLE_KEY   — WAJIB di-set, jangan pernah di-commit
 *
 * Lokasi memory lokal:
 *   $HOME/.claude/projects/<project-hash>/memory/
 *   (default hash folder untuk project ini = -Users-bagas-Documents-Website-content-creator)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const https = require('https');

// ---------- helpers ----------
function readSupabaseUrl() {
  // Coba env dulu
  if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL;
  // Fallback: parse dari supabase-config.js
  const cfgPath = path.join(__dirname, '..', 'supabase-config.js');
  if (!fs.existsSync(cfgPath)) {
    throw new Error('supabase-config.js not found — set SUPABASE_URL env var');
  }
  const src = fs.readFileSync(cfgPath, 'utf8');
  const m = src.match(/window\.SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/);
  if (!m) throw new Error('SUPABASE_URL not found in supabase-config.js');
  return m[1];
}

function getServiceRoleKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error([
      'SUPABASE_SERVICE_ROLE_KEY env var ga di-set.',
      '',
      'Cara setup:',
      '  1. Buka Supabase → Settings → API → service_role (reveal)',
      '  2. export SUPABASE_SERVICE_ROLE_KEY="eyJ...service_role..."',
      '  3. (Recommended) taruh di ~/.zshrc atau shell rc biar persistent',
      '',
      'JANGAN pernah commit key ini ke git.',
    ].join('\n'));
  }
  return key;
}

// Memory folder path
function getMemoryDir() {
  const explicit = process.env.CLAUDE_MEMORY_DIR;
  if (explicit) return explicit;
  // Default: ~/.claude/projects/-Users-bagas-Documents-Website-content-creator/memory/
  const home = process.env.HOME || require('os').homedir();
  const project = '-Users-bagas-Documents-Website-content-creator';
  return path.join(home, '.claude', 'projects', project, 'memory');
}

function parseFrontmatter(text) {
  // Frontmatter = `---\n...\n---\n` di awal file
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: text, description: '' };

  const yaml = m[1];
  const body = m[2];

  // Simple YAML parser (cuma handle key: value, no nesting)
  const meta = {};
  yaml.split(/\r?\n/).forEach(line => {
    const km = line.match(/^([\w-]+):\s*(.*)$/);
    if (km) meta[km[1]] = km[2].trim();
  });

  return {
    meta,
    body,
    description: meta.description || '',
  };
}

function serializeFrontmatter(name, description, meta, body) {
  let yaml = `name: ${name}\n`;
  if (description) yaml += `description: ${description}\n`;
  // Append remaining meta keys
  Object.entries(meta).forEach(([k, v]) => {
    if (k === 'name' || k === 'description') return;
    yaml += `${k}: ${v}\n`;
  });
  return `---\n${yaml}---\n${body}`;
}

// ---------- Supabase REST API ----------
function supabaseRequest(method, tablePath, body, url, key) {
  return new Promise((resolve, reject) => {
    const fullUrl = `${url}/rest/v1/${tablePath}`;
    const urlObj = new URL(fullUrl);
    const data = body ? JSON.stringify(body) : null;
    const headers = {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' || method === 'PATCH' ? 'resolution=merge-duplicates' : '',
    };
    const req = https.request({
      method,
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers,
    }, (res) => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(text ? JSON.parse(text) : []);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${text}`));
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ---------- ops ----------

async function pushAll() {
  const url = readSupabaseUrl();
  const key = getServiceRoleKey();
  const dir = getMemoryDir();

  if (!fs.existsSync(dir)) {
    throw new Error(`Memory dir not found: ${dir}`);
  }

  // Kumpulkan semua .md file (skip MEMORY.md — itu index, bukan entry)
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'MEMORY.md');
  console.log(`📁 Found ${files.length} memory files in ${dir}\n`);

  let pushed = 0;
  let skipped = 0;

  for (const file of files) {
    const name = path.basename(file, '.md');
    const full = path.join(dir, file);
    const text = fs.readFileSync(full, 'utf8');
    const { meta, body, description } = parseFrontmatter(text);

    const row = {
      name,
      description,
      body,
      metadata: meta,
    };

    // Upsert via PATCH with on_conflict
    try {
      await supabaseRequest(
        'POST',
        'claude_memory?on_conflict=name',
        row,
        url,
        key
      );
      console.log(`  ✓ ${name}`);
      pushed++;
    } catch (err) {
      console.log(`  ✗ ${name}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`\n✅ Pushed ${pushed}/${files.length} (${skipped} failed)`);
}

async function pullAll() {
  const url = readSupabaseUrl();
  const key = getServiceRoleKey();
  const dir = getMemoryDir();

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  console.log(`📥 Fetching from Supabase → ${dir}\n`);

  const rows = await supabaseRequest('GET', 'claude_memory?select=name,description,body,metadata,updated_at', null, url, key);
  console.log(`Found ${rows.length} rows\n`);

  for (const row of rows) {
    const filename = path.join(dir, `${row.name}.md`);
    const content = serializeFrontmatter(row.name, row.description, row.metadata || {}, row.body || '');
    fs.writeFileSync(filename, content, 'utf8');
    console.log(`  ✓ ${row.name}`);
  }

  console.log(`\n✅ Pulled ${rows.length} files`);
}

async function status() {
  const url = readSupabaseUrl();
  const key = getServiceRoleKey();
  const dir = getMemoryDir();

  // Local
  const localFiles = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'MEMORY.md').map(f => path.basename(f, '.md'))
    : [];
  const localSet = new Set(localFiles);

  // Remote
  const rows = await supabaseRequest('GET', 'claude_memory?select=name,updated_at', null, url, key);
  const remoteMap = new Map(rows.map(r => [r.name, r.updated_at]));

  console.log('Local files:', localFiles.length);
  console.log('Remote rows:', rows.length);
  console.log();

  // Local-only
  const localOnly = [...localSet].filter(n => !remoteMap.has(n));
  if (localOnly.length) {
    console.log('📤 Local only (need push):');
    localOnly.forEach(n => console.log(`  - ${n}`));
    console.log();
  }

  // Remote-only
  const remoteOnly = [...remoteMap.keys()].filter(n => !localSet.has(n));
  if (remoteOnly.length) {
    console.log('📥 Remote only (need pull):');
    remoteOnly.forEach(n => console.log(`  - ${n}`));
    console.log();
  }

  // In both (need compare updated_at)
  const inBoth = [...localSet].filter(n => remoteMap.has(n));
  console.log(`🔄 In both: ${inBoth.length}`);
}

const cmd = process.argv[2];
(async () => {
  try {
    switch (cmd) {
      case 'push':   await pushAll();   break;
      case 'pull':   await pullAll();   break;
      case 'status': await status();    break;
      default:
        console.log('Usage: node tools/claude-memory-sync.js [push|pull|status]');
        process.exit(1);
    }
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  }
})();