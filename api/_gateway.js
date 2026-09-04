// Madorai AI Gateway
// Visual workflow (SCAN + RINGKASAN) is pinned by route handlers to Gemini.
// Chat can choose a provider/model at runtime. All provider secrets stay server-side.
export const AI_GATEWAY_VERSION = "2.0.1";

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

const OCR = `Kamu asisten ahli arsitektur Jepang untuk tim Indonesia. Lakukan OCR sangat teliti pada crop gambar. Baca seluruh Kanji/Kana/angka/singkatan/simbol teknis, terjemahkan, dan jangan mengarang teks yang tidak terlihat.`;
const ORDER = `Baca crop order sheet Jepang secara lengkap: instruksi, kuantitas, ukuran, material, pekerjaan, dan catatan. Pertahankan detail teknis dan jangan mengarang.`;
const OCR_JSON = `\nKeluarkan HANYA JSON valid: {"jp":"","romaji":"","id":"","en":"","summary":"","desc":""}`;
const ORDER_JSON = `\nKeluarkan HANYA JSON valid: {"summary":"","detail":"","category":"Material|Furnitur|Pekerjaan|Mood|Dimensi|Catatan"}`;

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

const SUMMARY = `Analisis semua gambar dokumen renovasi Jepang secara multimodal dan grounded. Ekstrak ringkasan, highlight kritis, mood, warna lantai/dinding/furniture, kitchen, kusen jendela/pintu, finishing pintu, CH, catatan khusus, dan tulisan tangan.

ATURAN BAHASA OUTPUT (WAJIB):
- Semua isi naratif untuk projectSummary.text, highlights, seluruh design.*.text, specialNotes, dan handwrittenNotes.meaning WAJIB ditulis dalam Bahasa Indonesia yang natural, ringkas, dan profesional.
- Terjemahkan instruksi, kalimat, dan catatan berbahasa Jepang ke Bahasa Indonesia. Jangan menyalin kalimat Jepang panjang sebagai hasil utama.
- Nama brand, nama produk/seri resmi, kode model, kode warna, kode material, dimensi, singkatan teknis, dan kode alfanumerik harus dipertahankan persis bila terbaca. Jangan menerjemahkan atau mengarang nama produk.
- Bila nama produk Jepang penting untuk identifikasi, boleh pertahankan teks Jepang aslinya bersama nama/penjelasan Indonesia, tetapi narasi penjelasannya tetap Bahasa Indonesia.
- Khusus handwrittenNotes: originalText harus mempertahankan teks asli Jepang; translation dan meaning harus Bahasa Indonesia.
- Jika suatu informasi tidak terbaca atau tidak ada, nyatakan tidak ditemukan/tidak terbaca; jangan mengarang.

GROUNDING:
- sources wajib menggunakan nama file sumber yang relevan.
- box memakai persen 0-100; bila tidak yakin gunakan source kosong dan x/y/w/h=0.
- Bedakan fakta yang benar-benar tertulis dari interpretasi. Jangan mengarang data yang tidak terlihat.`;
const SUMMARY_JSON = `Keluarkan HANYA JSON valid dengan struktur tepat ini:\n{"projectSummary":{"text":"","sources":[],"box":{"source":"","x":0,"y":0,"w":0,"h":0}},"highlights":[],"design":{"mood":{"text":"","sources":[],"box":{"source":"","x":0,"y":0,"w":0,"h":0}},"floorColor":{"text":"","sources":[],"box":{"source":"","x":0,"y":0,"w":0,"h":0}},"wallColor":{"text":"","sources":[],"box":{"source":"","x":0,"y":0,"w":0,"h":0}},"furnitureColor":{"text":"","sources":[],"box":{"source":"","x":0,"y":0,"w":0,"h":0}},"kitchenDetail":{"text":"","sources":[],"box":{"source":"","x":0,"y":0,"w":0,"h":0}},"windowFrames":{"text":"","sources":[],"box":{"source":"","x":0,"y":0,"w":0,"h":0}},"doorFrames":{"text":"","sources":[],"box":{"source":"","x":0,"y":0,"w":0,"h":0}},"doorFinishing":{"text":"","sources":[],"box":{"source":"","x":0,"y":0,"w":0,"h":0}},"ceilingHeight":{"text":"","sources":[],"box":{"source":"","x":0,"y":0,"w":0,"h":0}}},"specialNotes":[],"handwrittenNotes":[{"originalText":"","translation":"","meaning":"","source":"","box":{"source":"","x":0,"y":0,"w":0,"h":0}}]}`;

export async function summarizeItems(items, options = {}) {
  if (!items?.length) throw new Error("Tidak ada dokumen untuk dirangkum.");
  const selected = resolveAiSelection(options);
  const labels = items.map((item, i) => `#${i + 1} ${item.label} (${item.type})`).join("\n");
  return callProvider({
    ...selected,
    prompt: `${SUMMARY}\n\nUrutan gambar:\n${labels}\n\n${SUMMARY_JSON}`,
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
