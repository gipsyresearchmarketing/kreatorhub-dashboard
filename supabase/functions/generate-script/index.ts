// Edge Function: generate-script
// Memanggil Groq (Llama 3.3 70B) untuk generate script Hook/Body/CTA.
// OpenAI-compatible chat completions API, free tier (30 req/min, no card).
//
// Input  (POST JSON):
//   - brand:        string (required)
//   - usp:          string (required)
//   - funnelStage:  string (optional)
//   - briefText:    string (optional)
//
// Output (JSON):
//   - rows: [{ scene: 'Hook'|'Body'|'CTA', script: string }, ...]  (3 rows)
//
// ENV:
//   - GROQ_API_KEY   (required) — set di Supabase Dashboard → Secrets
//   - GROQ_MODEL     (optional, default: "llama-3.3-70b-versatile")
//                     Alternatif cepet: "llama-3.1-8b-instant"

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
const GROQ_MODEL = Deno.env.get("GROQ_MODEL") ?? "llama-3.1-8b-instant";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// ====== Brand voice guide (inlined biar single-file) ======
const BRAND_VOICES: Record<string, string> = {
  "Gipsy Research": `
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
  "Jamuzen":
    "[Brand voice guide dalam tahap pengembangan — sementara AI generate pake tone default conversational-academic Indonesia yang helpful & approachable.]",
  "Convictio.id":
    "[Brand voice guide dalam tahap pengembangan — sementara AI generate pake tone default conversational-academic Indonesia yang helpful & approachable.]",
  "CalmadeAI":
    "[Brand voice guide dalam tahap pengembangan — sementara AI generate pake tone default conversational-academic Indonesia yang helpful & approachable.]",
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
  if (voice.includes("dalam tahap pengembangan")) return DEFAULT_VOICE;
  return voice;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Kadang model ngebalutin JSON di ```json ... ```, strip.
function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) return fenced[1];
  const innerFence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (innerFence) return innerFence[1];
  return trimmed;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    if (!GROQ_API_KEY) {
      return json(
        { error: "Server belum dikonfigurasi: GROQ_API_KEY belum di-set di Supabase secrets." },
        500,
      );
    }

    const { brand, usp, funnelStage, briefText } = await req.json();
    if (!brand || typeof brand !== "string") return json({ error: "Field 'brand' wajib diisi." }, 400);
    if (!usp || typeof usp !== "string" || !usp.trim()) {
      return json({ error: "Field 'usp' wajib diisi." }, 400);
    }

    const voice = getVoiceFor(brand);

    // System prompt yang strict biar output selalu 3 row valid
    const systemPrompt = `Kamu AI copywriter Indonesia untuk konten video pendek (TikTok/Reels, ~30-45 detik).

OUTPUT FORMAT (WAJIB PATUH):
- Output HARUS JSON valid TANPA teks lain di luar JSON (no intro, no outro, no markdown)
- Struktur: { "rows": [ { "scene": "Hook"|"Body"|"CTA", "script": "..." }, ... ] }
- TEPAT 3 elemen di array "rows" dengan scene persis: "Hook", "Body", "CTA" (case-sensitive, urutan Hook → Body → CTA)

ATURAN PER SCENE:
- Hook: 1 baris, MAKSIMAL 15 kata, punchy, bikin orang berhenti scroll dalam 3 detik pertama
- Body: 2-4 kalimat, total ~50-80 kata, value konkret & actionable (step atau contoh nyata)
- CTA: 1 baris, MAKSIMAL 12 kata, soft, natural, ada value exchange jelas

BAHASA:
- 100% Bahasa Indonesia, pake "kamu" (BUKAN "Anda")
- Hindari emoji (boleh 1 di CTA kalo pas)

BRAND VOICE GUIDE:
${voice}

LARANGAN:
- Output teks lain di luar JSON (jangan ada "Berikut script..." atau "Tentu, ini...")
- Klaim palsu / overpromise
- Bahasa Inggris (kecuali istilah ilmiah umum di Indonesia)
- Bahasa formal kayak buku teks

Kalo USP kurang jelas, tetep generate dengan asumsi terbaik dan kasih Hook yang relate ke audience brand.`;

    const userParts: string[] = [];
    userParts.push(`Brand: ${brand}`);
    if (funnelStage && funnelStage.trim()) userParts.push(`Funnel stage: ${funnelStage.trim()}`);
    userParts.push(`USP: ${usp.trim()}`);
    if (briefText && briefText.trim()) userParts.push(`\nBrief dari admin:\n${briefText.trim()}`);
    userParts.push("\nGenerate script untuk konten video pendek, sesuai format di system prompt.");
    const userPrompt = userParts.join("\n");

    const res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.8,
        max_tokens: 1500,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      const meta = `[model=${GROQ_MODEL}, key=...${GROQ_API_KEY.slice(-4)}]`;
      console.error("Groq error", res.status, meta, errText);
      return json({ error: `Groq ${res.status} ${meta}: ${errText.slice(0, 300)}` }, 502);
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) {
      const reason = data?.choices?.[0]?.finish_reason ?? "unknown";
      return json({ error: `Groq nggak ngasih output (${reason})` }, 502);
    }

    let parsed: { rows?: Array<{ scene?: string; script?: string }> };
    try {
      parsed = JSON.parse(extractJson(text));
    } catch {
      return json({ error: "Output AI bukan JSON valid. Raw: " + text.slice(0, 200) }, 502);
    }

    if (!parsed?.rows || !Array.isArray(parsed.rows)) {
      return json({ error: "Output AI gak ada field 'rows' / bukan array. Raw: " + text.slice(0, 200) }, 502);
    }

    const scenes = parsed.rows.map((r) => (r.scene ?? "").toLowerCase());
    if (!scenes.some((s) => s.includes("hook"))) return json({ error: "Output AI gak ada baris Hook" }, 502);
    if (!scenes.some((s) => s.includes("body"))) return json({ error: "Output AI gak ada baris Body" }, 502);
    if (!scenes.some((s) => s.includes("cta"))) return json({ error: "Output AI gak ada baris CTA" }, 502);

    const safe = parsed.rows.slice(0, 3).map((r) => ({
      scene: (r.scene ?? "").toString(),
      script: (r.script ?? "").toString().trim(),
    }));

    return json({ rows: safe });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(err);
    return json({ error: message }, 500);
  }
});
