// Madorai AI Gateway
// Visual workflow (SCAN + RINGKASAN) is pinned by route handlers to Gemini.
// Chat can choose a provider/model at runtime. All provider secrets stay server-side.
export const AI_GATEWAY_VERSION = "2.1.0";

export const AI_PROVIDER_MODELS = {
  openai: ["gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.6-sol"],
  gemini: ["gemini-3.7-flash", "gemini-3.6-flash"],
  glm: ["glm-4.6v", "glm-4.6v-flash"],
  deepseek: ["deepseek-v4-pro", "deepseek-v4-flash"],
};

const DEFAULTS = {
  openai: "gpt-5.6-terra",
  gemini: "gemini-3.6-flash",
  glm: "glm-4.6v-flash",
  deepseek: "deepseek-v4-flash",
};

const KEY_ENV = {
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  glm: "GLM_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
};

const MODEL_ENV = {
  openai: "OPENAI_MODEL",
  gemini: "GEMINI_MODEL",
  glm: "GLM_MODEL",
  deepseek: "DEEPSEEK_MODEL",
};

const clean = (v) => typeof v === "string" && v.trim() ? v.trim() : undefined;
const providerOf = (v) => v === "gemini" || v === "glm" || v === "deepseek" ? v : "openai";

export function resolveAiSelection(options = {}) {
  const provider = providerOf(options.provider || clean(process.env.AI_PROVIDER));
  const model = clean(options.model) || clean(process.env[MODEL_ENV[provider]]) || DEFAULTS[provider];
  if (!AI_PROVIDER_MODELS[provider].includes(model)) {
    throw new Error(`Model ${model} tidak didukung untuk ${provider}.`);
  }
  return { provider, model };
}

function keyFor(provider) {
  const key = clean(process.env[KEY_ENV[provider]]);
  if (!key || /YOUR_.*API_KEY|MY_.*API_KEY/i.test(key)) {
    throw new Error(`${KEY_ENV[provider]} belum dikonfigurasi di Vercel.`);
  }
  return key;
}

export function getAiRuntimeStatus() {
  return {
    gatewayVersion: AI_GATEWAY_VERSION,
    visualPipeline: { provider: "gemini", model: "gemini-3.6-flash" },
    configured: {
      openai: !!clean(process.env.OPENAI_API_KEY),
      gemini: !!clean(process.env.GEMINI_API_KEY),
      glm: !!clean(process.env.GLM_API_KEY),
      deepseek: !!clean(process.env.DEEPSEEK_API_KEY),
    },
    models: AI_PROVIDER_MODELS,
    defaults: DEFAULTS,
  };
}

const dataUrl = (s) => s.startsWith("data:") || /^https?:\/\//i.test(s) ? s : `data:image/jpeg;base64,${s}`;
const glmImage = (s) => s.startsWith("data:") ? s.slice(s.indexOf(",") + 1) : s;

function geminiImage(s) {
  if (s.startsWith("data:")) {
    const match = s.match(/^data:([^;,]+);base64,(.*)$/s);
    if (match) return { mimeType: match[1], data: match[2] };
  }
  if (/^https?:\/\//i.test(s)) throw new Error("Gemini pada app ini membutuhkan image base64/data URL.");
  return { mimeType: "image/jpeg", data: s };
}

function parseJson(text) {
  const t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try { return JSON.parse(t.slice(a, b + 1)); } catch {}
  }
  throw new Error("Respons AI bukan JSON valid.");
}

function apiError(provider, status, value) {
  return new Error(`${provider.toUpperCase()} API ${status}: ${value?.error?.message || value?.message || value?.error || "Unknown error"}`);
}

async function callProvider({ provider, model, prompt, images = [], system, json = false, max }) {
  if (provider === "deepseek" && images.length) {
    throw new Error("DeepSeek API saat ini text-only. Gunakan OpenAI, Gemini, atau GLM untuk gambar.");
  }

  const key = keyFor(provider);
  let url = "";
  let body;
  const headers = { "Content-Type": "application/json" };

  if (provider === "openai") {
    url = "https://api.openai.com/v1/responses";
    headers.Authorization = `Bearer ${key}`;
    body = {
      model,
      store: false,
      max_output_tokens: max,
      ...(system ? { instructions: system } : {}),
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          ...images.map((image) => ({ type: "input_image", image_url: dataUrl(image), detail: "high" })),
        ],
      }],
    };
  } else if (provider === "gemini") {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    headers["x-goog-api-key"] = key;
    body = {
      contents: [{
        role: "user",
        parts: [
          { text: prompt },
          ...images.map((image) => {
            const parsed = geminiImage(image);
            return { inlineData: { mimeType: parsed.mimeType, data: parsed.data } };
          }),
        ],
      }],
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: {
        ...(max ? { maxOutputTokens: max } : {}),
        ...(json ? { responseMimeType: "application/json" } : {}),
      },
    };
  } else if (provider === "glm") {
    url = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
    headers.Authorization = `Bearer ${key}`;
    const content = images.length
      ? [...images.map((image) => ({ type: "image_url", image_url: { url: glmImage(image) } })), { type: "text", text: prompt }]
      : prompt;
    body = {
      model,
      stream: false,
      max_tokens: max,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content },
      ],
    };
  } else {
    url = "https://api.deepseek.com/chat/completions";
    headers.Authorization = `Bearer ${key}`;
    body = {
      model,
      stream: false,
      max_tokens: max,
      ...(json ? { response_format: { type: "json_object" } } : {}),
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt },
      ],
    };
  }

  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const raw = await response.text();
  let value;
  try { value = raw ? JSON.parse(raw) : {}; } catch { value = { message: raw }; }
  if (!response.ok) throw apiError(provider, response.status, value);

  let text = "";
  if (provider === "openai") {
    text = value.output_text || (value.output || []).flatMap((o) => o.content || []).filter((c) => c.type === "output_text").map((c) => c.text).join("\n");
  } else if (provider === "gemini") {
    text = (value?.candidates?.[0]?.content?.parts || []).map((p) => typeof p?.text === "string" ? p.text : "").filter(Boolean).join("\n");
  } else {
    text = value?.choices?.[0]?.message?.content || "";
  }

  if (!String(text).trim()) throw new Error(`${provider.toUpperCase()} mengembalikan respons kosong.`);
  return json ? parseJson(text) : String(text).trim();
}

// Keep the original app behavior: denah OCR returns original Japanese + ID/EN translation,
// while order-sheet crops are explained for an Indonesian architecture team.
const OCR = `Kamu adalah asisten ahli arsitektur Jepang untuk tim kontraktor/arsitek Indonesia.
Pengguna memberikan crop gambar dari denah arsitektur Jepang.
Baca semua teks/simbol dengan teliti. Jangan mengarang teks yang tidak terlihat.`;
const ORDER = `Kamu adalah asisten untuk tim kontraktor/arsitek Indonesia mengerjakan proyek renovasi Jepang.
Pengguna memberikan crop dari order sheet / brief klien Jepang.
Baca dan jelaskan apa yang tertulis. Pertahankan material, spesifikasi, instruksi, kode, dan catatan klien secara akurat.`;
const OCR_JSON = `\nBalas HANYA JSON valid tanpa markdown: {"jp":"teks asli","romaji":"romanisasi","id":"terjemahan ID","en":"terjemahan EN","summary":"kesimpulan teknis 1 kalimat + dimensi jika ada","desc":"deskripsi konteks 2-3 kalimat Bahasa Indonesia"}`;
const ORDER_JSON = `\nBalas HANYA JSON valid tanpa markdown: {"summary":"kesimpulan 1 kalimat apa yang diminta di area ini","detail":"penjelasan lengkap 2-4 kalimat Bahasa Indonesia: material, spesifikasi, instruksi, atau catatan klien","category":"Material|Furnitur|Pekerjaan|Mood|Dimensi|Catatan"}`;

export async function analyzeImage(imageB64, type, options = {}) {
  const selected = resolveAiSelection(options);
  return callProvider({
    ...selected,
    prompt: type === "order" ? ORDER + ORDER_JSON : OCR + OCR_JSON,
    images: [imageB64],
    json: true,
    max: type === "order" ? 5000 : 4000,
  });
}

// SUMMARY parity contract.
// This restores the intent of the original QA workflow: not merely describing documents,
// but preparing actionable information for RA/QA before modeling and rendering.
const SUMMARY = `Kamu adalah asisten QA arsitektur/interior untuk tim Render Assistant (RA) Indonesia yang mengerjakan proyek renovasi Jepang.

Analisis SEMUA gambar dokumen sebagai satu paket proyek. Dokumen dapat berupa order sheet, denah, spesifikasi, referensi material, catatan klien, dan tulisan tangan. Tujuanmu adalah menghasilkan ringkasan kerja yang langsung berguna untuk modeling dan rendering, bukan sekadar OCR atau terjemahan umum.

PRINSIP UTAMA:
1. Baca seluruh dokumen silang-sumber. Gabungkan informasi yang saling melengkapi dan perhatikan bila spesifikasi berbeda per ruang.
2. Bedakan dengan jelas kondisi EXISTING / dipertahankan dengan NEW / diganti / dipindah / ditambahkan.
3. Jangan mengarang. Jika tidak ada data, gunakan teks kosong atau array kosong sesuai field.
4. Pertahankan nama brand, seri produk, nama warna/material resmi, kode model, kode wallpaper, kode pintu/jendela, angka, dimensi, dan singkatan teknis persis seperti yang terbaca.
5. Semua narasi hasil WAJIB Bahasa Indonesia yang natural dan profesional. Teks Jepang panjang jangan menjadi output utama; terjemahkan maknanya. Nama produk Jepang boleh dipertahankan bila penting untuk identifikasi.

1. DETAIL UTAMA RENOVASI — projectSummary
Tulis 2-4 kalimat Bahasa Indonesia yang menjelaskan inti proyek: jenis proyek/ruang, permintaan klien, scope pekerjaan atau gambar yang harus dibuat, ruang yang menjadi fokus, serta informasi utama yang menjelaskan tujuan renovasi. Jangan isi dengan deskripsi generik.

2. POIN KRITIS PELAKSANA LAPANGAN — highlights
Ini adalah bagian PALING OPERASIONAL untuk RA/QA. Buat poin terpisah hanya bila ada evidence. Prioritaskan:
- elemen EXISTING yang harus dipertahankan atau digunakan kembali;
- elemen yang harus dibongkar, diganti, ditambahkan, dipindahkan, atau direlokasi;
- perbedaan spesifikasi antar ruang yang berisiko tertukar;
- furniture existing yang tetap dipakai atau dipindahkan;
- custom furniture / custom fabrication / item khusus;
- instruksi posisi, dimensi, CH, bukaan, atau batasan lapangan yang penting;
- pengecualian: hanya satu ruang baru sementara ruang lain existing, satu sisi diganti sementara sisi lain dicat, dan kondisi sejenis;
- catatan yang bila terlewat dapat menyebabkan kesalahan modeling, materialisasi, atau rendering.
Jangan mengulang semua atribut desain sebagai highlight. Highlights harus menjelaskan APA YANG HARUS DIPERHATIKAN SAAT EKSEKUSI. Jika memang tidak ada poin kritis, gunakan [].

3. ATRIBUT DESAIN & WARNA — design
- mood: konsep desain, ambience, style, palette, kombinasi warna/material utama.
- floorColor: spesifikasi lantai per ruang. Sebutkan existing/new, brand, series, pattern/color, dan kode bila tersedia.
- wallColor: spesifikasi dinding/wallpaper/paint per ruang, termasuk kode produk. Bila plafon memakai material terkait dan penting, jelaskan.
- furnitureColor: warna/material/finish furniture; bedakan existing dan custom; pertahankan brand/seri/kode.
- kitchenDetail: status existing/reuse/new, brand, series, tipe/layout, warna/finish, ukuran atau spesifikasi yang terbaca. Jika dokumen hanya menyatakan existing kitchen, tulis itu secara jelas dan jangan mengarang seri.
- windowFrames: warna/material/tipe sash atau kusen jendela, existing/new bila diketahui.
- doorFrames: warna/material/tipe kusen/frame pintu, existing/new bila diketahui.
- doorFinishing: tipe daun pintu, brand/series/design code, warna/material/finish dan kondisi existing/new bila diketahui.
- ceilingHeight: CH/ketinggian plafon per ruang bila tersedia; jangan membuat nilai standar bila dokumen tidak menyebutkannya.
Untuk semua field design, jelaskan perbedaan per ruang dan jangan menyatukan spesifikasi yang berbeda menjadi satu nilai generik.

4. CATATAN KHUSUS — specialNotes
Isi instruksi klien atau kondisi penting yang tidak tepat dimasukkan ke highlights/design, misalnya kebutuhan penggunaan ruang, permintaan output, furniture/peralatan khusus, atau catatan koordinasi. Jika tidak ada, gunakan [].

5. TULISAN TANGAN — handwrittenNotes
Berikan perhatian ekstra pada tulisan tangan/koreksi manual karena sering memuat instruksi renovasi penting. originalText mempertahankan teks Jepang asli; translation adalah terjemahan Bahasa Indonesia; meaning menjelaskan arti praktisnya untuk RA/QA. Jika tidak ada tulisan tangan yang terbaca, gunakan [].

ATURAN GROUNDING:
- sources harus berisi label/nama file dari daftar gambar yang benar-benar mendukung informasi tersebut.
- Jangan mencantumkan source yang tidak relevan hanya untuk mengisi field.
- box memakai persen 0-100. Jika lokasi tidak dapat ditentukan dengan yakin, gunakan {"source":"","x":0,"y":0,"w":0,"h":0}.
- Jika ada konflik antar dokumen, jangan memilih diam-diam. Jelaskan konflik tersebut pada highlights atau specialNotes.
- Jangan membuat asumsi standar arsitektur sebagai fakta dokumen.`;

const SUMMARY_JSON = `Keluarkan HANYA JSON valid tanpa markdown dengan struktur tepat ini:
{
  "projectSummary": {
    "text": "",
    "sources": [],
    "box": {"source":"","x":0,"y":0,"w":0,"h":0}
  },
  "highlights": [
    {
      "text": "",
      "sources": [],
      "box": {"source":"","x":0,"y":0,"w":0,"h":0}
    }
  ],
  "design": {
    "mood": {"text":"","sources":[],"box":{"source":"","x":0,"y":0,"w":0,"h":0}},
    "floorColor": {"text":"","sources":[],"box":{"source":"","x":0,"y":0,"w":0,"h":0}},
    "wallColor": {"text":"","sources":[],"box":{"source":"","x":0,"y":0,"w":0,"h":0}},
    "furnitureColor": {"text":"","sources":[],"box":{"source":"","x":0,"y":0,"w":0,"h":0}},
    "kitchenDetail": {"text":"","sources":[],"box":{"source":"","x":0,"y":0,"w":0,"h":0}},
    "windowFrames": {"text":"","sources":[],"box":{"source":"","x":0,"y":0,"w":0,"h":0}},
    "doorFrames": {"text":"","sources":[],"box":{"source":"","x":0,"y":0,"w":0,"h":0}},
    "doorFinishing": {"text":"","sources":[],"box":{"source":"","x":0,"y":0,"w":0,"h":0}},
    "ceilingHeight": {"text":"","sources":[],"box":{"source":"","x":0,"y":0,"w":0,"h":0}}
  },
  "specialNotes": [
    {
      "text": "",
      "sources": [],
      "box": {"source":"","x":0,"y":0,"w":0,"h":0}
    }
  ],
  "handwrittenNotes": [
    {
      "originalText":"",
      "translation":"",
      "meaning":"",
      "source":"",
      "box":{"source":"","x":0,"y":0,"w":0,"h":0}
    }
  ]
}
Jika highlights, specialNotes, atau handwrittenNotes tidak memiliki data nyata, keluarkan array kosong [] untuk field tersebut. Jangan keluarkan object kosong palsu.`;

export async function summarizeItems(items, options = {}) {
  if (!items?.length) throw new Error("Tidak ada dokumen untuk dirangkum.");
  const selected = resolveAiSelection(options);
  const labels = items.map((item, i) => `#${i + 1} ${item.label} (${item.type})`).join("\n");
  return callProvider({
    ...selected,
    prompt: `${SUMMARY}\n\nDAFTAR GAMBAR/SOURCE:\n${labels}\n\n${SUMMARY_JSON}`,
    images: items.map((item) => item.src),
    json: true,
    max: 12000,
  });
}

const CHAT_SYSTEM = `Kamu Madorai Assist, asisten kontraktor/arsitek Indonesia untuk dokumen konstruksi Jepang. Jawab profesional, teknis, grounded pada dokumen. Jika data tidak ada, katakan tidak ditemukan. Jangan mengarang.`;

export async function chatWithItems(items = [], messages = [], options = {}) {
  const selected = resolveAiSelection(options);
  const labels = items.map((item, i) => `#${i + 1} ${item.label} (${item.type})`).join("\n");
  const history = messages.map((m) => `${m.role === "assistant" ? "ASISTEN" : "PENGGUNA"}: ${m.content}`).join("\n\n");
  const reply = await callProvider({
    ...selected,
    system: CHAT_SYSTEM,
    prompt: `${labels ? `DOKUMEN:\n${labels}\n\n` : ""}RIWAYAT:\n${history}\n\nJawab permintaan terakhir.`,
    images: items.map((item) => item.src),
    max: 5000,
  });
  return { reply };
}
