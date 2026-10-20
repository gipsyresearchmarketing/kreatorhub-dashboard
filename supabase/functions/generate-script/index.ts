// Edge Function: generate-script (single-file version for Dashboard Editor)
// Memanggil Google Gemini 2.0 Flash untuk generate script Hook/Body/CTA.
//
// Input  (POST JSON):
//   - brand:        string (required)
//   - usp:          string (required)
//   - funnelStage:  string (optional)
//   - briefText:    string (optional)
//
// Output (JSON):
//   - rows: [{ scene: 'Hook'|'Body'|'CTA', script: string }, ...]
//
// ENV yang dibutuhin: GEMINI_API_KEY (di-set di Supabase Dashboard → Secrets)

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// ====== Brand voice guide (inlined biar single-file) ======
const BRAND_VOICES: Record<string, string> = {
  'Gipsy Research': `
TONE & PERSONALITI:
- Bicara kayak senior researcher yang helpful, bukan profesor kaku
- Academic tapi relatable — istilah riset boleh dipake asal langsung dikasih contoh/arti
- Optimis tapi jujur ("ini bakal makan waktu, tapi worth it")
- Bahasa casual-academic, pake "kamu" bukan "Anda"

HOOK PATTERN (TOFU):
- Sering buka dengan pertanyaan reflektif ("Kalau kamu...")
- Atau pernyataan data/angka yang kontra-intuitif ("250 juta+ artikel...")
- Atau pattern interrupt yang relate ke frustration umum (bab 1 stuck, dosen revisi, dll)

BODY PATTERN:
- Bukti/kredibilitas: sebut riset spesifik, framework, jurnal, atau step-by-step
- Concrete & actionable — kasih step atau contoh nyata, bukan teori
- Struktur: problem → kenapa orang stuck → framework/solusi → 1 contoh

CTA PATTERN:
- Soft, natural — "komen 'mau' nanti aku kirim worksheetnya"
- Selalu ada value exchange yang jelas
- JANGAN hard-sell atau janji berlebihan

TARGET AUDIENCE:
- Mahasiswa S1/S2/peneliti muda Indonesia
- Stuck di awal riset (cari judul, bab 1) atau overwhelmed (banyak revisi)
- Butuh sistem, bukan motivasi

JANGAN:
- Pakai kata "Anda" (selalu "kamu")
- Bahasa Inggris campur (boleh istilah riset umum: framework, metodologi)
- Emoji berlebihan di body
- Klaim palsu atau overpromise
`,
  'Jamuzen': `[Brand voice guide dalam tahap pengembangan — sementara AI generate pake tone default conversational-academic Indonesia yang helpful & approachable.]`,
  'Convictio.id': `[Brand voice guide dalam tahap pengembangan — sementara AI generate pake tone default conversational-academic Indonesia yang helpful & approachable.]`,
  'CalmadeAI': `[Brand voice guide dalam tahap pengembangan — sementara AI generate pake tone default conversational-academic Indonesia yang helpful & approachable.]`,
};

const DEFAULT_VOICE = `
TONE DEFAULT (kalo brand voice guide belum ready):
- Bahasa Indonesia conversational, helpful & approachable
- Bahasa "kamu" bukan "Anda"
- Hook: pertanyaan reflektif atau pernyataan yang bikin orang berhenti scroll
- Body: actionable & concrete, kasih step atau contoh nyata
- CTA: soft, value exchange jelas
- Cocok untuk konten TikTok/Reels pendek (~30-60 detik)
`;

function getVoiceFor(brand: string): string {
  const voice = BRAND_VOICES[brand];
  if (!voice) return DEFAULT_VOICE;
  if (voice.includes('dalam tahap pengembangan')) return DEFAULT_VOICE;
  return voice;
}

// ====== System prompt ======
const SYSTEM_PROMPT = `Lo adalah AI copywriter Indonesia untuk konten video pendek (TikTok/Reels, ~30-60 detik).

ATURAN KERAS (WAJIB DIIKUTI):
- Output HARUS JSON valid dengan struktur: { "rows": [ { "scene": "Hook"|"Body"|"CTA", "script": "..." }, ... ] }
- WAJIB ada tepat 3 baris: Hook, Body, CTA. Jangan lebih, jangan kurang.
- Hook: 1 baris, max 15 kata, punchy, bikin orang berhenti scroll
- Body: 2-4 kalimat (boleh pake newline sebagai pemisah), total ~50-80 kata, value konkret & actionable
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

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) return JSON.parse(fenced[1]);
  const innerFence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (innerFence) return JSON.parse(innerFence[1]);
  return JSON.parse(trimmed);
}

// ====== Handler ======
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('Server belum dikonfigurasi: GEMINI_API_KEY belum di-set di Supabase secrets.');
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

    const geminiRes = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 800,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Gemini API error (${geminiRes.status}): ${errText.slice(0, 300)}`);
    }

    const result = await geminiRes.json();
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini response kosong / format salah');

    let parsed: any;
    try {
      parsed = extractJson(text);
    } catch (parseErr) {
      throw new Error('Output AI bukan JSON valid. Raw: ' + text.slice(0, 200));
    }

    if (!parsed?.rows || !Array.isArray(parsed.rows)) {
      throw new Error('Output AI gak ada field "rows" / bukan array. Raw: ' + text.slice(0, 200));
    }

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