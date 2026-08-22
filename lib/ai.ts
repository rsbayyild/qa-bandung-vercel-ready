export interface AiItem { id?: number; type: "denah" | "order" | "progress"; src: string; label: string; }
export type AiProvider = "openai" | "glm" | "deepseek";
export interface AiRequestOptions { provider?: string; model?: string; }

export const AI_PROVIDER_MODELS: Record<AiProvider, string[]> = {
  openai: ["gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.6-sol"],
  glm: ["glm-4.6v", "glm-4.6v-flash"],
  deepseek: ["deepseek-v4-pro", "deepseek-v4-flash"],
};
const DEFAULTS: Record<AiProvider, string> = { openai: "gpt-5.6-terra", glm: "glm-4.6v-flash", deepseek: "deepseek-v4-flash" };
const KEY_ENV: Record<AiProvider, string> = { openai: "OPENAI_API_KEY", glm: "GLM_API_KEY", deepseek: "DEEPSEEK_API_KEY" };
const MODEL_ENV: Record<AiProvider, string> = { openai: "OPENAI_MODEL", glm: "GLM_MODEL", deepseek: "DEEPSEEK_MODEL" };

const clean = (v?: string) => v?.trim() || undefined;
const providerOf = (v?: string): AiProvider => v === "glm" || v === "deepseek" ? v : "openai";
export function resolveAiSelection(o: AiRequestOptions = {}) {
  const provider = providerOf(o.provider || clean(process.env.AI_PROVIDER));
  const model = clean(o.model) || clean(process.env[MODEL_ENV[provider]]) || DEFAULTS[provider];
  if (!AI_PROVIDER_MODELS[provider].includes(model)) throw new Error(`Model ${model} tidak didukung untuk ${provider}.`);
  return { provider, model };
}
function keyFor(p: AiProvider) {
  const key = clean(process.env[KEY_ENV[p]]);
  if (!key || /YOUR_.*API_KEY|MY_.*API_KEY/i.test(key)) throw new Error(`${KEY_ENV[p]} belum dikonfigurasi di Vercel.`);
  return key;
}
export function getAiRuntimeStatus() {
  return { configured: { openai: !!clean(process.env.OPENAI_API_KEY), glm: !!clean(process.env.GLM_API_KEY), deepseek: !!clean(process.env.DEEPSEEK_API_KEY) }, models: AI_PROVIDER_MODELS, defaults: DEFAULTS };
}

const dataUrl = (s: string) => s.startsWith("data:") || /^https?:\/\//i.test(s) ? s : `data:image/jpeg;base64,${s}`;
const glmImage = (s: string) => s.startsWith("data:") ? s.slice(s.indexOf(",") + 1) : s;
function parseJson(text: string) {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) try { return JSON.parse(t.slice(a, b + 1)); } catch {}
  throw new Error("Respons AI bukan JSON valid.");
}
function apiError(p: AiProvider, status: number, x: any) { return new Error(`${p.toUpperCase()} API ${status}: ${x?.error?.message || x?.message || x?.error || "Unknown error"}`); }

async function callProvider(a: { provider: AiProvider; model: string; prompt: string; images?: string[]; system?: string; json?: boolean; max?: number }) {
  const images = a.images || [];
  if (a.provider === "deepseek" && images.length) throw new Error("DeepSeek API resmi saat ini text-only. Gunakan OpenAI atau GLM untuk OCR/gambar/ringkasan visual.");
  let url = "", body: any, key = keyFor(a.provider);
  if (a.provider === "openai") {
    url = "https://api.openai.com/v1/responses";
    body = { model: a.model, store: false, max_output_tokens: a.max, instructions: a.system, input: [{ role: "user", content: [{ type: "input_text", text: a.prompt }, ...images.map(image => ({ type: "input_image", image_url: dataUrl(image), detail: "high" }))] }] };
  } else if (a.provider === "glm") {
    url = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
    const content: any = images.length ? [...images.map(image => ({ type: "image_url", image_url: { url: glmImage(image) } })), { type: "text", text: a.prompt }] : a.prompt;
    body = { model: a.model, stream: false, thinking: { type: "enabled" }, max_tokens: a.max, messages: [...(a.system ? [{ role: "system", content: a.system }] : []), { role: "user", content }] };
  } else {
    url = "https://api.deepseek.com/chat/completions";
    body = { model: a.model, stream: false, thinking: { type: "enabled" }, max_tokens: a.max, response_format: a.json ? { type: "json_object" } : undefined, messages: [...(a.system ? [{ role: "system", content: a.system }] : []), { role: "user", content: a.prompt }] };
  }
  const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const raw = await r.text(); let x: any; try { x = raw ? JSON.parse(raw) : {}; } catch { x = { message: raw }; }
  if (!r.ok) throw apiError(a.provider, r.status, x);
  let text = "";
  if (a.provider === "openai") {
    text = x.output_text || (x.output || []).flatMap((o: any) => o.content || []).filter((c: any) => c.type === "output_text").map((c: any) => c.text).join("\n");
  } else text = x?.choices?.[0]?.message?.content || "";
  if (!text.trim()) throw new Error(`${a.provider.toUpperCase()} mengembalikan respons kosong.`);
  return a.json ? parseJson(text) : text.trim();
}

const OCR = `Kamu asisten ahli arsitektur Jepang untuk tim Indonesia. Lakukan OCR sangat teliti pada crop gambar. Baca seluruh Kanji/Kana/angka/singkatan/simbol teknis, terjemahkan, dan jangan mengarang teks yang tidak terlihat.`;
const ORDER = `Baca crop order sheet Jepang secara lengkap: instruksi, kuantitas, ukuran, material, pekerjaan, dan catatan. Pertahankan detail teknis dan jangan mengarang.`;
const OCR_JSON = `\nKeluarkan HANYA JSON valid: {"jp":"","romaji":"","id":"","en":"","summary":"","desc":""}`;
const ORDER_JSON = `\nKeluarkan HANYA JSON valid: {"summary":"","detail":"","category":"Material|Furnitur|Pekerjaan|Mood|Dimensi|Catatan"}`;
export async function analyzeImage(imageB64: string, type: "denah" | "order", o: AiRequestOptions = {}) {
  const s = resolveAiSelection(o);
  return callProvider({ ...s, prompt: (type === "order" ? ORDER + ORDER_JSON : OCR + OCR_JSON), images: [imageB64], json: true, max: type === "order" ? 5000 : 4000 });
}

const SUMMARY = `Analisis semua gambar dokumen renovasi Jepang secara multimodal dan grounded. Ekstrak ringkasan, highlight kritis, mood, warna lantai/dinding/furniture, kitchen, kusen jendela/pintu, finishing pintu, CH, catatan khusus, dan tulisan tangan. sources wajib nama file. box memakai persen 0-100; bila tidak yakin gunakan source kosong dan x/y/w/h=0. Jangan mengarang data yang tidak terlihat.`;
const SUMMARY_JSON = `Keluarkan HANYA JSON valid dengan struktur tepat ini:
{"projectSummary":{"text":"","sources":[],"box":{"source":"","x":0,"y":0,"w":0,"h":0}},"highlights":[],"design":{"mood":{"text":"","sources":[],"box":{"source":"","x":0,"y":0,"w":0,"h":0}},"floorColor":{"text":"","sources":[],"box":{"source":"","x":0,"y":0,"w":0,"h":0}},"wallColor":{"text":"","sources":[],"box":{"source":"","x":0,"y":0,"w":0,"h":0}},"furnitureColor":{"text":"","sources":[],"box":{"source":"","x":0,"y":0,"w":0,"h":0}},"kitchenDetail":{"text":"","sources":[],"box":{"source":"","x":0,"y":0,"w":0,"h":0}},"windowFrames":{"text":"","sources":[],"box":{"source":"","x":0,"y":0,"w":0,"h":0}},"doorFrames":{"text":"","sources":[],"box":{"source":"","x":0,"y":0,"w":0,"h":0}},"doorFinishing":{"text":"","sources":[],"box":{"source":"","x":0,"y":0,"w":0,"h":0}},"ceilingHeight":{"text":"","sources":[],"box":{"source":"","x":0,"y":0,"w":0,"h":0}}},"specialNotes":[],"handwrittenNotes":[{"originalText":"","translation":"","meaning":"","source":"","box":{"source":"","x":0,"y":0,"w":0,"h":0}}]}`;
export async function summarizeItems(items: AiItem[], o: AiRequestOptions = {}) {
  if (!items?.length) throw new Error("Tidak ada dokumen untuk dirangkum.");
  const s = resolveAiSelection(o), labels = items.map((x, i) => `#${i+1} ${x.label} (${x.type})`).join("\n");
  return callProvider({ ...s, prompt: `${SUMMARY}\n\nUrutan gambar:\n${labels}\n\n${SUMMARY_JSON}`, images: items.map(x => x.src), json: true, max: 12000 });
}

const CHAT_SYSTEM = `Kamu Madorai Assist, asisten kontraktor/arsitek Indonesia untuk dokumen konstruksi Jepang. Jawab profesional, teknis, grounded pada dokumen. Jika data tidak ada, katakan tidak ditemukan. Jangan mengarang.`;
export async function chatWithItems(items: AiItem[] = [], messages: Array<{role:string;content:string}>, o: AiRequestOptions = {}) {
  const s = resolveAiSelection(o), labels = items.map((x,i)=>`#${i+1} ${x.label} (${x.type})`).join("\n"), history = messages.map(m=>`${m.role === "assistant" ? "ASISTEN" : "PENGGUNA"}: ${m.content}`).join("\n\n");
  const reply = await callProvider({ ...s, system: CHAT_SYSTEM, prompt: `${labels ? `DOKUMEN:\n${labels}\n\n` : ""}RIWAYAT:\n${history}\n\nJawab permintaan terakhir.`, images: items.map(x=>x.src), max: 5000 });
  return { reply };
}
export async function testAiProvider(o: AiRequestOptions = {}) { const s = resolveAiSelection(o); return { ...s, reply: await callProvider({ ...s, prompt: "Balas tepat: OK", max: 32 }) }; }
