#!/usr/bin/env bash
# Sync Claude Code memory ↔ Supabase claude_memory table.
#
# Usage:
#   ./tools/claude-memory-sync.sh push
#   ./tools/claude-memory-sync.sh pull
#   ./tools/claude-memory-sync.sh status
#
# Required env:
#   SUPABASE_SERVICE_ROLE_KEY  — WAJIB, jangan commit
#
# Optional env:
#   SUPABASE_URL               — override; default baca dari supabase-config.js
#   CLAUDE_MEMORY_DIR          — override; default ~/.claude/projects/.../memory

set -euo pipefail

# ---------- helpers ----------
get_supabase_url() {
  if [[ -n "${SUPABASE_URL:-}" ]]; then
    echo "$SUPABASE_URL"
    return
  fi
  local cfg="${SCRIPT_DIR}/../supabase-config.js"
  if [[ ! -f "$cfg" ]]; then
    echo "❌ supabase-config.js ga ketemu + SUPABASE_URL env ga di-set" >&2
    exit 1
  fi
  grep -oE "window\.SUPABASE_URL\s*=\s*['\"][^'\"]+['\"]" "$cfg" \
    | head -1 \
    | sed -E "s/.*['\"]([^'\"]+)['\"].*/\1/"
}

get_service_role_key() {
  if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
    echo "❌ SUPABASE_SERVICE_ROLE_KEY env var ga di-set." >&2
    echo "" >&2
    echo "Setup:" >&2
    echo "  1. Supabase → Settings → API → service_role (reveal) → copy" >&2
    echo "  2. Tambahin ke ~/.zshrc:" >&2
    echo "       export SUPABASE_SERVICE_ROLE_KEY=\"eyJ...service_role...\"" >&2
    echo "  3. source ~/.zshrc" >&2
    echo "" >&2
    echo "JANGAN pernah commit key ini." >&2
    exit 1
  fi
}

get_memory_dir() {
  if [[ -n "${CLAUDE_MEMORY_DIR:-}" ]]; then
    echo "$CLAUDE_MEMORY_DIR"
    return
  fi
  local home="${HOME:-}"
  if [[ -z "$home" ]]; then home="$(getent passwd "$(id -u)" | cut -d: -f6)"; fi
  echo "$home/.claude/projects/-Users-bagas-Documents-Website-content-creator/memory"
}

# Parse frontmatter YAML → emit "description|metadata_json|body"
# body = everything after second "---"
parse_frontmatter() {
  local file="$1"
  python3 - "$file" <<'PYEOF'
import sys, re, json
text = open(sys.argv[1]).read()
m = re.match(r'^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$', text)
if not m:
    print(f"||{text}")
    sys.exit(0)
yaml_body = m.group(1)
body = m.group(2)
meta = {}
for line in yaml_body.splitlines():
    km = re.match(r'^([\w-]+):\s*(.*)$', line)
    if km:
        meta[km.group(1)] = km.group(2).strip()
desc = meta.pop('description', '')
name = meta.pop('name', '')
print(f"{desc}|{json.dumps(meta)}|{body}")
PYEOF
}

# ---------- Supabase REST API ----------
# $1 = method  $2 = table+query  $3 = JSON body (or empty)
supabase_request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local url="$SUPABASE_URL"
  local key="$SERVICE_KEY"

  local args=(
    -sS
    -X "$method"
    -H "apikey: $key"
    -H "Authorization: Bearer $key"
    -H "Content-Type: application/json"
  )
  if [[ "$method" == "POST" || "$method" == "PATCH" ]]; then
    args+=(-H "Prefer: resolution=merge-duplicates")
  fi
  if [[ -n "$body" ]]; then
    args+=(--data "$body")
  fi

  curl "${args[@]}" "${url}/rest/v1/${path}"
}

# ---------- ops ----------

cmd_push() {
  local dir="$MEMORY_DIR"
  if [[ ! -d "$dir" ]]; then
    echo "❌ Memory dir ga ada: $dir" >&2
    exit 1
  fi

  # Kumpulkan .md files (skip MEMORY.md — itu index)
  local files=()
  while IFS= read -r f; do
    files+=("$f")
  done < <(find "$dir" -maxdepth 1 -type f -name '*.md' ! -name 'MEMORY.md' | sort)

  echo "📁 Found ${#files[@]} memory files in $dir"
  echo ""

  local pushed=0
  local failed=0

  for file in "${files[@]}"; do
    local name
    name="$(basename "$file" .md)"

    local parsed desc metadata body
    parsed="$(parse_frontmatter "$file")"
    desc="$(echo "$parsed" | cut -d'|' -f1)"
    metadata="$(echo "$parsed" | cut -d'|' -f2)"
    body="$(echo "$parsed" | cut -d'|' -f3-)"

    # Build JSON payload (jq required for safe escaping)
    local payload
    payload="$(jq -n \
      --arg name "$name" \
      --arg desc "$desc" \
      --arg body "$body" \
      --argjson meta "$metadata" \
      '{name: $name, description: $desc, body: $body, metadata: $meta}')"

    if supabase_request POST "claude_memory?on_conflict=name" "$payload" >/dev/null; then
      echo "  ✓ $name"
      pushed=$((pushed + 1))
    else
      echo "  ✗ $name: $(supabase_request POST "claude_memory?on_conflict=name" "$payload" 2>&1 | head -1)"
      failed=$((failed + 1))
    fi
  done

  echo ""
  echo "✅ Pushed $pushed/${#files[@]} ($failed failed)"
}

cmd_pull() {
  local dir="$MEMORY_DIR"
  mkdir -p "$dir"

  echo "📥 Fetching from Supabase → $dir"
  echo ""

  local rows
  rows="$(supabase_request GET 'claude_memory?select=name,description,body,metadata')"

  local count
  count="$(echo "$rows" | jq 'length')"
  echo "Found $count rows"
  echo ""

  # Tulis tiap row ke file .md
  echo "$rows" | jq -c '.[]' | while IFS= read -r row; do
    local name desc body meta
    name="$(echo "$row" | jq -r '.name')"
    desc="$(echo "$row" | jq -r '.description // ""')"
    body="$(echo "$row" | jq -r '.body // ""')"
    meta="$(echo "$row" | jq -c '.metadata // {}')"

    # Reconstruct frontmatter
    local yaml="name: $name"
    [[ -n "$desc" && "$desc" != "null" ]] && yaml+=$'\n'"description: $desc"
    # Append remaining metadata (skip name/description yang udah di-handle)
    local extra
    extra="$(echo "$meta" | jq -r 'to_entries | .[] | select(.key != "name" and .key != "description") | "\(.key): \(.value)"' | paste -sd ' ' -)"
    # Note: simpler approach — just put metadata as JSON comment
    # Actually, let's write a clean YAML representation
    local yaml_full="name: $name"
    [[ -n "$desc" && "$desc" != "null" ]] && yaml_full+=$'\n'"description: $desc"
    # Append other metadata as YAML key: value (assume scalar)
    local other_keys
    other_keys="$(echo "$meta" | jq -r 'keys[] | select(. != "name" and . != "description")')"
    while IFS= read -r key; do
      [[ -z "$key" ]] && continue
      local val
      val="$(echo "$meta" | jq -r --arg k "$key" '.[$k]')"
      yaml_full+=$'\n'"$key: $val"
    done <<< "$other_keys"

    local file="$dir/$name.md"
    {
      printf -- "---\n"
      printf "%b\n" "$yaml_full"
      printf -- "---\n"
      printf "%s" "$body"
    } > "$file"
    echo "  ✓ $name"
  done

  echo ""
  echo "✅ Pulled $count files"
}

cmd_status() {
  local dir="$MEMORY_DIR"
  local local_names=()
  if [[ -d "$dir" ]]; then
    while IFS= read -r f; do
      local_names+=("$(basename "$f" .md)")
    done < <(find "$dir" -maxdepth 1 -type f -name '*.md' ! -name 'MEMORY.md')
  fi

  local rows
  rows="$(supabase_request GET 'claude_memory?select=name')"
  local remote_names
  remote_names="$(echo "$rows" | jq -r '.[].name')"

  echo "Local files: ${#local_names[@]}"
  echo "Remote rows: $(echo "$rows" | jq 'length')"
  echo ""

  # Local-only
  local local_only=()
  for n in "${local_names[@]}"; do
    if ! echo "$remote_names" | grep -qx "$n"; then
      local_only+=("$n")
    fi
  done
  if [[ ${#local_only[@]} -gt 0 ]]; then
    echo "📤 Local only (perlu push):"
    printf '  - %s\n' "${local_only[@]}"
    echo ""
  fi

  # Remote-only
  local remote_only=()
  while IFS= read -r n; do
    local found=0
    for ln in "${local_names[@]}"; do
      [[ "$ln" == "$n" ]] && { found=1; break; }
    done
    [[ $found -eq 0 ]] && remote_only+=("$n")
  done <<< "$remote_names"
  if [[ ${#remote_only[@]} -gt 0 ]]; then
    echo "📥 Remote only (perlu pull):"
    printf '  - %s\n' "${remote_only[@]}"
    echo ""
  fi

  echo "🔄 In both: $((${#local_names[@]} - ${#local_only[@]}))"
}

# ---------- main ----------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SUPABASE_URL="$(get_supabase_url)"
SERVICE_KEY="$(get_service_role_key)"
MEMORY_DIR="$(get_memory_dir)"

cmd="${1:-}"
case "$cmd" in
  push)   cmd_push ;;
  pull)   cmd_pull ;;
  status) cmd_status ;;
  *)
    echo "Usage: $0 [push|pull|status]"
    exit 1
    ;;
esac