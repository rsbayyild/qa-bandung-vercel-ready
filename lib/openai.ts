export interface AiItem {
  id?: number;
  type: "denah" | "order" | "progress";
  src: string;
  label: string;
}

type JsonSchema = Record<string, any>;

const MODEL = process.env.OPENAI_MODEL || "gpt-5.6-terra";
const OPENAI_URL = "https://api.openai.com/v1/responses";

function getApiKey() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === "YOUR_OPENAI_API_KEY") {
    throw new Error(
      "OPENAI_API_KEY belum dikonfigurasi. Tambahkan Environment Variable OPENAI_API_KEY di Vercel lalu redeploy."
    );
  }
  return apiKey;
}

function toDataUrl(src: string, fallbackMime = "image/jpeg") {
  if (src.startsWith("data:")) return src;
  return `data:${fallbackMime};base64,${src}`;
}

function extractOutputText(payload: any): string {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const texts: string[] = [];
  for (const output of payload?.output || []) {
    for (const content of output?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        texts.push(content.text);
      }
    }
  }
  return texts.join("\n").trim();
}

function openAIErrorMessage(payload: any, status: number) {
  const detail =
    payload?.error?.message ||
    payload?.message ||
    (typeof payload === "string" ? payload : "Unknown OpenAI API error");
  return `OpenAI API ${status}: ${detail}`;
}

async function createResponse(args: {
  input: any;
  instructions?: string;
  schema?: JsonSchema;
  schemaName?: string;
  maxOutputTokens?: number;
}) {
  const body: Record<string, any> = {
    model: MODEL,
    store: false,
    input: args.input,
  };

  if (args.instructions) body.instructions = args.instructions;
  if (args.maxOutputTokens) body.max_output_tokens = args.maxOutputTokens;

  if (args.schema) {
    body.text = {
      format: {
        type: "json_schema",
        name: args.schemaName || "response",
        schema: args.schema,
        strict: true,
      },
    };
  }

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  let payload: any;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = raw;
  }

  if (!response.ok) {
    throw new Error(openAIErrorMessage(payload, response.status));
  }

  if (payload?.status === "incomplete") {
    const reason = payload?.incomplete_details?.reason || "unknown";
    throw new Error(`OpenAI response tidak lengkap (${reason}).`);
  }

  const text = extractOutputText(payload);
  if (!text) throw new Error("OpenAI mengembalikan respons kosong.");

  if (!args.schema) return text;

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Structured Output OpenAI tidak dapat diparse sebagai JSON.");
  }
}

const ANNOTATE_PROMPT = `Kamu adalah asisten ahli arsitektur Jepang untuk tim kontraktor/arsitek Indonesia.
TUGAS UTAMA: Lakukan OCR yang sangat teliti dan rinci. Baca, terjemahkan, dan analisis SELURUH teks Jepang (Kanji, Hiragana, Katakana, angka, singkatan, simbol teknis) yang terlihat dalam crop gambar tanpa melewatkan kata atau baris penting.
Jika ada beberapa kata, label, atau kalimat terpisah, gabungkan semuanya untuk diulas lengkap. Jangan mengarang teks yang tidak terlihat.`;

const ORDER_PROMPT = `Kamu adalah asisten ahli proyek renovasi untuk tim kontraktor/arsitek Indonesia.
Baca, terjemahkan, dan jabarkan SELURUH instruksi, kuantitas, ukuran, material, dan catatan spesifikasi kerja yang terlihat pada crop order sheet/brief Jepang. Pertahankan detail teknis dan jangan menyimpulkan data yang tidak terlihat.`;

const orderSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    detail: { type: "string" },
    category: {
      type: "string",
      enum: ["Material", "Furnitur", "Pekerjaan", "Mood", "Dimensi", "Catatan"],
    },
  },
  required: ["summary", "detail", "category"],
};

const annotateSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    jp: { type: "string" },
    romaji: { type: "string" },
    id: { type: "string" },
    en: { type: "string" },
    summary: { type: "string" },
    desc: { type: "string" },
  },
  required: ["jp", "romaji", "id", "en", "summary", "desc"],
};

export async function analyzeImage(imageB64: string, type: "denah" | "order") {
  if (!imageB64) throw new Error("Crop gambar base64 tidak ditemukan.");

  return createResponse({
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: type === "order" ? ORDER_PROMPT : ANNOTATE_PROMPT },
          {
            type: "input_image",
            image_url: toDataUrl(imageB64),
            detail: "high",
          },
        ],
      },
    ],
    schema: type === "order" ? orderSchema : annotateSchema,
    schemaName: type === "order" ? "order_analysis" : "blueprint_ocr",
    maxOutputTokens: type === "order" ? 5000 : 4000,
  });
}

const SUMMARIZE_PROMPT = `Kamu adalah AI analis proyek arsitektur/renovasi Jepang untuk tim Indonesia.
Analisis SEMUA gambar dokumen yang diberikan secara multimodal dan hasilkan ringkasan proyek yang grounded pada bukti visual.

WAJIB:
- Bedakan fakta yang benar-benar terlihat dari inferensi.
- Bila informasi tidak ditemukan, katakan tidak ditemukan; jangan mengarang.
- sources harus memakai nama file yang diberikan.
- Untuk fakta visual yang spesifik, berikan box dalam persen 0-100 relatif terhadap gambar asal: x,y adalah kiri-atas, w,h adalah ukuran.
- Jika posisi tidak dapat ditentukan dengan cukup yakin, gunakan source kosong dan x/y/w/h = 0.
- Baca tulisan tangan Jepang jika terlihat dan pertahankan teks aslinya.

Ekstrak: rangkuman proyek, highlight kritis, mood, warna lantai/dinding/furniture, detail kitchen, kusen jendela/pintu, finishing pintu, CH/ceiling height, catatan khusus, dan tulisan tangan.`;

const boxSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    source: { type: "string" },
    x: { type: "number" },
    y: { type: "number" },
    w: { type: "number" },
    h: { type: "number" },
  },
  required: ["source", "x", "y", "w", "h"],
};

const groundedTextSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: { type: "string" },
    sources: { type: "array", items: { type: "string" } },
    box: boxSchema,
  },
  required: ["text", "sources", "box"],
};

const summarySchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    projectSummary: groundedTextSchema,
    highlights: { type: "array", items: groundedTextSchema },
    design: {
      type: "object",
      additionalProperties: false,
      properties: {
        mood: groundedTextSchema,
        floorColor: groundedTextSchema,
        wallColor: groundedTextSchema,
        furnitureColor: groundedTextSchema,
        kitchenDetail: groundedTextSchema,
        windowFrames: groundedTextSchema,
        doorFrames: groundedTextSchema,
        doorFinishing: groundedTextSchema,
        ceilingHeight: groundedTextSchema,
      },
      required: [
        "mood",
        "floorColor",
        "wallColor",
        "furnitureColor",
        "kitchenDetail",
        "windowFrames",
        "doorFrames",
        "doorFinishing",
        "ceilingHeight"
      ],
    },
    specialNotes: { type: "array", items: groundedTextSchema },
    handwrittenNotes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          originalText: { type: "string" },
          translation: { type: "string" },
          meaning: { type: "string" },
          source: { type: "string" },
          box: boxSchema,
        },
        required: ["originalText", "translation", "meaning", "source", "box"],
      },
    },
  },
  required: ["projectSummary", "highlights", "design", "specialNotes", "handwrittenNotes"],
};

export async function summarizeItems(items: AiItem[]) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Tidak ada dokumen atau denah yang diunggah untuk dirangkum.");
  }

  const content: any[] = [{ type: "input_text", text: SUMMARIZE_PROMPT }];

  items.forEach((item, index) => {
    content.push({
      type: "input_text",
      text: `FILE #${index + 1} | nama: ${item.label} | kategori: ${item.type}`,
    });
    content.push({
      type: "input_image",
      image_url: toDataUrl(item.src),
      detail: "high",
    });
  });

  return createResponse({
    input: [{ role: "user", content }],
    schema: summarySchema,
    schemaName: "project_summary",
    maxOutputTokens: 12000,
  });
}

const CHAT_SYSTEM_INSTRUCTION = `Kamu adalah "Madorai Assist", asisten spesialis kontraktor dan arsitek Indonesia untuk membaca dan menganalisis dokumen konstruksi Jepang (Madori/Floorplan dan Order Sheet/Brief).
Jawab dalam Bahasa Indonesia profesional, ringkas tetapi teknis. Grounding jawaban pada dokumen yang diberikan. Sebut detail spesifik bila memang terlihat. Jika informasi tidak ada atau tidak dapat diamati, katakan tidak ditemukan dan jangan mengarang. Untuk teks Jepang atau tulisan tangan, bantu bacakan dan jelaskan makna teknisnya.`;

export async function chatWithItems(
  items: AiItem[] = [],
  messages: Array<{ role: string; content: string }>
) {
  if (!Array.isArray(messages)) throw new Error("Kolom 'messages' wajib diisi.");

  const content: any[] = [];
  if (Array.isArray(items)) {
    items.forEach((item, index) => {
      content.push({
        type: "input_text",
        text: `DOKUMEN #${index + 1} | nama: ${item.label} | kategori: ${item.type}`,
      });
      content.push({
        type: "input_image",
        image_url: toDataUrl(item.src),
        detail: "high",
      });
    });
  }

  const history = messages
    .map((message) => `${message.role === "assistant" ? "ASISTEN" : "PENGGUNA"}: ${message.content}`)
    .join("\n\n");

  content.push({
    type: "input_text",
    text: `RIWAYAT PERCAKAPAN:\n${history}\n\nJawab permintaan pengguna terakhir berdasarkan dokumen dan riwayat di atas.`,
  });

  const reply = await createResponse({
    instructions: CHAT_SYSTEM_INSTRUCTION,
    input: [{ role: "user", content }],
    maxOutputTokens: 5000,
  });

  return { reply };
}
