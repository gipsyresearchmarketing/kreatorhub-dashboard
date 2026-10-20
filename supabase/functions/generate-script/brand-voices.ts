// Brand voice guide per brand. Dipakai sama Edge Function generate-script sebagai
// bagian dari system prompt. Kalo brand belum ada voice guide definitif, pakai default.
//
// Cara update: tambah key baru di BRAND_VOICES dengan value string berisi tone/aturan brand.
// Bisa diubah tanpa re-deploy Edge Function karena dipisah di file ini (tapi untuk sekarang
// masih satu file; kalo nanti dipisah-baris per brand, gampang di-maintain).

export const BRAND_VOICES: Record<string, string> = {
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

CONTOH USP YAK KERASASA PAS:
- "Peta Riset Sistematis dari Nol sampai Sidang"
- "Pilih Metode Penelitian yang Cocok"
- "Standar Skripsi yang Jelas"
- "Ngak Sendirian — Ada Mentor dan Komunitas"

JANGAN:
- Pakai kata "Anda" (selalu "kamu")
- Bahasa Inggris campur (boleh istilah riset umum: framework, metodologi)
- Emoji berlebihan di body
- Klaim palsu atau overpromise
`,

  'Jamuzen': `
[Brand voice guide dalam tahap pengembangan — sementara AI generate pake tone default conversational-academic Indonesia yang helpful & approachable. Akan di-update kalo tone guide definitif udah ready.]
`,

  'Convictio.id': `
[Brand voice guide dalam tahap pengembangan — sementara AI generate pake tone default conversational-academic Indonesia yang helpful & approachable. Akan di-update kalo tone guide definitif udah ready.]
`,

  'CalmadeAI': `
[Brand voice guide dalam tahap pengembangan — sementara AI generate pake tone default conversational-academic Indonesia yang helpful & approachable. Akan di-update kalo tone guide definitif udah ready.]
`,
};

// Default tone kalo brand gak ada di BRAND_VOICES atau value-nya masih placeholder.
export const DEFAULT_VOICE = `
TONE DEFAULT (kalo brand voice guide belum ready):
- Bahasa Indonesia conversational, helpful & approachable
- Bahasa "kamu" bukan "Anda"
- Hook: pertanyaan reflektif atau pernyataan yang bikin orang berhenti scroll
- Body: actionable & concrete, kasih step atau contoh nyata
- CTA: soft, value exchange jelas
- Cocok untuk konten TikTok/Reels pendek (~30-60 detik)
`;

export function getVoiceFor(brand: string): string {
  const voice = BRAND_VOICES[brand];
  if (!voice) return DEFAULT_VOICE;
  // Kalo voice masih placeholder "dalam tahap pengembangan", pakai default
  if (voice.includes('dalam tahap pengembangan')) return DEFAULT_VOICE;
  return voice;
}