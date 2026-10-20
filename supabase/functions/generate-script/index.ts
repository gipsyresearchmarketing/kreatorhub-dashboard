// Edge Function: generate-script
// Memanggil Claude 3.5 Haiku untuk generate script Hook/Body/CTA berdasarkan brand + USP.
//
// Input  (POST JSON):
//   - brand:        string (required)  — salah satu dari BRAND_VOICES keys
//   - usp:          string (required)  — Unique Selling Proposition / angle utama
//   - funnelStage:  string (optional)  — TOFU/MOFU/BOFU
//   - briefText:    string (optional)  — instruksi tambahan dari admin
//
// Output (JSON):
//   - rows: [{ scene: 'Hook'|'Body'|'CTA', script: string }, ...]
//
// Deploy:
//   1. supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   2. supabase functions deploy generate-script
// Atau paste manual via Supabase Dashboard → Edge Functions.
//
// Auth: function ini dipanggil dari authenticated admin client (sb.functions.invoke
// kirim JWT otomatis). Cuma admin yang boleh akses — check role di sini.

import { getVoiceFor } from './brand-voices.ts';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-3-5-haiku-20241022';
const MAX_TOKENS = 800;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM_PROMPT = `Lo adalah AI copywriter Indonesia untuk konten video pendek (TikTok/Reels, ~30-60 detik).

ATURAN KERAS (WAJIB DIIKUTI):
- Output HARUS JSON valid dengan struktur: { "rows": [ { "scene": "Hook"|"Body"|"CTA", "script": "..." }, ... ] }
- WAJIB ada tepat 3 baris: Hook, Body, CTA. Jangan lebih, jangan kurang.
- Hook: 1 baris, max 15 kata, punchy, bikin orang berhenti scroll
- Body: 2-4 kalimat (boleh pake newline sebagai pemisah antar kalimat), total ~50-80 kata, value konkret & actionable
- CTA: 1 baris, max 12 kata, soft, natural, value exchange jelas
- Bahasa Indonesia, gunakan "kamu" bukan "Anda"
- Total panjang script cukup untuk ~30-45 detik video

BRAND VOICE GUIDE:
{VOICE}

JANGAN:
- Output teks lain di luar JSON (jangan ada intro/outro/penjelasan)
- Pakai emoji berlebihan (boleh 1-2 di CTA kalo pas, jangan lebih)
- Klaim palsu atau overpromise
- Bahasa Inggris (kecuali istilah riset/scientific yang umum dipake di Indonesia)
- Bahasa formal/kaku kayak buku teks

Kalo USP yang dikasih kurang jelas, tetep generate dengan asumsi terbaik dan kasih Hook yg relate.`;

// Extract JSON dari text response kalo model kebetulan wrap dengan markdown ```json ... ```
function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // Strip markdown code fences kalo ada
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) return JSON.parse(fenced[1]);
  // Strip ```json ... ``` di tengah text
  const innerFence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (innerFence) return JSON.parse(innerFence[1]);
  // Pure JSON
  return JSON.parse(trimmed);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new Error('Server belum dikonfigurasi: ANTHROPIC_API_KEY belum di-set di Supabase secrets.');
    }

    const body = await req.json();
    const { brand, usp, funnelStage, briefText } = body;

    if (!brand || typeof brand !== 'string') {
      throw new Error('Field "brand" wajib diisi.');
    }
    if (!usp || typeof usp !== 'string' || !usp.trim()) {
      throw new Error('Field "usp" wajib diisi.');
    }

    const voice = getVoiceFor(brand);
    const systemPrompt = SYSTEM_PROMPT.replace('{VOICE}', voice);

    const userParts: string[] = [];
    userParts.push(`Brand: ${brand}`);
    if (funnelStage && funnelStage.trim()) userParts.push(`Funnel stage: ${funnelStage.trim()}`);
    userParts.push(`USP: ${usp.trim()}`);
    if (briefText && briefText.trim()) userParts.push(`\nBrief dari admin:\n${briefText.trim()}`);
    userParts.push('\nGenerate script untuk konten video pendek.');
    const userPrompt = userParts.join('\n');

    const anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      throw new Error(`Anthropic API error (${anthropicRes.status}): ${errText.slice(0, 300)}`);
    }

    const result = await anthropicRes.json();
    const text = result?.content?.[0]?.text;
    if (!text) throw new Error('Anthropic response kosong / format salah');

    let parsed: any;
    try {
      parsed = extractJson(text);
    } catch (parseErr) {
      throw new Error('Output AI bukan JSON valid. Raw: ' + text.slice(0, 200));
    }

    if (!parsed?.rows || !Array.isArray(parsed.rows)) {
      throw new Error('Output AI gak ada field "rows" / bukan array. Raw: ' + text.slice(0, 200));
    }

    // Validasi minimal: harus ada scene Hook, Body, CTA
    const scenes = parsed.rows.map((r: any) => (r.scene || '').toLowerCase());
    if (!scenes.some((s: string) => s.includes('hook'))) throw new Error('Output AI gak ada baris Hook');
    if (!scenes.some((s: string) => s.includes('body'))) throw new Error('Output AI gak ada baris Body');
    if (!scenes.some((s: string) => s.includes('cta'))) throw new Error('Output AI gak ada baris CTA');

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});