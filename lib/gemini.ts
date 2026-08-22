import { GoogleGenAI, Type } from "@google/genai";

export interface AiItem {
  id?: number;
  type: "denah" | "order" | "progress";
  src: string;
  label: string;
}

let aiClient: GoogleGenAI | null = null;
let lastApiKey: string | undefined;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error(
      "GEMINI_API_KEY belum dikonfigurasi. Tambahkan Environment Variable GEMINI_API_KEY di Vercel."
    );
  }

  if (!aiClient || lastApiKey !== apiKey) {
    aiClient = new GoogleGenAI({ apiKey });
    lastApiKey = apiKey;
  }

  return aiClient;
}

const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

const ANNOTATE_PROMPT = `Kamu adalah asisten ahli arsitektur Jepang untuk tim kontraktor/arsitek Indonesia.
TUGAS UTAMA: Lakukan OCR (Optical Character Recognition) yang sangat teliti dan rinci. Kamu HARUS membaca, menerjemahkan, dan menganalisis SELURUH teks Jepang (Kanji, Hiragana, Katakana, Angka, Singkatan, Simbol Teknis) yang terlihat dalam kotak gambar yang dicrop ini tanpa melewatkan satupun kata atau baris.

Jika ada beberapa kata, label, atau kalimat terpisah dalam gambar, gabungkan semuanya untuk diulas secara lengkap. Jangan hanya mengambil satu istilah saja jika terdapat beberapa baris teks!`;

const ORDER_PROMPT = `Kamu adalah asisten ahli proyek renovasi untuk tim kontraktor/arsitek Indonesia.
TUGAS UTAMA: Baca, terjemahkan, dan jabarkan SELURUH instruksi, kuantitas, ukuran, ataupun catatan spesifikasi kerja teknis yang tertulis pada lembar order sheet/brief klien Jepang ini secara komprehensif. Jangan dirangkum terlalu pendek; pastikan setiap detail spesifikasi material, dimensi, cara pengerjaan, dan catatan khusus yang terlihat dalam crop gambar dijabarkan secara jelas dan lengkap demi keandalan konstruksi lapangan.`;

function imagePartFromDataUrl(src: string) {
  const match = src.match(/^data:([^;]+);base64,/);
  const mimeType = match ? match[1] : "image/jpeg";
  const data = src.includes(",") ? src.split(",", 2)[1] : src;
  return {
    inlineData: {
      mimeType,
      data,
    },
  };
}

export async function analyzeImage(imageB64: string, type: "denah" | "order") {
  if (!imageB64) throw new Error("Crop gambar base64 tidak ditemukan.");

  const ai = getGeminiClient();
  const imagePart = {
    inlineData: {
      mimeType: "image/jpeg",
      data: imageB64,
    },
  };

  if (type === "order") {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [imagePart, { text: ORDER_PROMPT }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description:
                "Kesimpulan padat dari seluruh instruksi/teks yang terdeteksi di gambar crop (Bahasa Indonesia).",
            },
            detail: {
              type: Type.STRING,
              description:
                "Penjelasan teknis yang sangat komprehensif dan rinci dalam Bahasa Indonesia mencakup seluruh isi instruksi, spesifikasi material, ukuran, pengerjaan, dan catatan khusus dari klien Jepang yang terdeteksi pada gambar tanpa ada bagian penting yang terlewat.",
            },
            category: {
              type: Type.STRING,
              description: "Kategori utama dari instruksi ini.",
              enum: ["Material", "Furnitur", "Pekerjaan", "Mood", "Dimensi", "Catatan"],
            },
          },
          required: ["summary", "detail", "category"],
        },
      },
    });

    if (!response.text) throw new Error("Gemini mengembalikan respon kosong.");
    return JSON.parse(response.text.trim());
  }

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [imagePart, { text: ANNOTATE_PROMPT }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          jp: {
            type: Type.STRING,
            description:
              "Seluruh teks Jepang asli (Kanji, Hiragana, Katakana) dan simbol teknis yang terdeteksi di gambar crop secara lengkap tanpa ada yang terlewat. Jika ada banyak label/kata, gabungkan semuanya (pisahkan dengan koma atau tanda /).",
          },
          romaji: {
            type: Type.STRING,
            description:
              "Romanisasi atau cara pengucapan dari seluruh teks Jepang asli yang terdeteksi di atas secara berurutan.",
          },
          id: {
            type: Type.STRING,
            description:
              "Terjemahan lengkap dari seluruh kata/teks yang dibaca ke dalam istilah arsitektur/desain Bahasa Indonesia yang mudah dipahami.",
          },
          en: {
            type: Type.STRING,
            description:
              "Terjemahan istilah Jepang tersebut dalam Bahasa Inggris arsitektur profesional komprehensif.",
          },
          summary: {
            type: Type.STRING,
            description:
              "Ringkasan teknis pendek (1 kalimat) tentang fungsi keseluruhan ruangan, material, posisi, atau simbol yang terdeteksi.",
          },
          desc: {
            type: Type.STRING,
            description:
              "Deskripsi arsitektural lengkap dan mendalam dalam Bahasa Indonesia (berisi 3-5 kalimat rinci) menjelaskan fungsi teknis ruangan/elemen tersebut di konstruksi Jepang, kebiasaan hunian/budaya, atau tips renovasi spesifik yang relevan berdasarkan semua teks yang dibaca.",
          },
        },
        required: ["jp", "romaji", "id", "en", "summary", "desc"],
      },
    },
  });

  if (!response.text) throw new Error("Gemini mengembalikan respon kosong.");
  return JSON.parse(response.text.trim());
}

const SUMMARIZE_PROMPT = `
TUGAS UTAMA:
Analisis semua berkas gambar/PDF denah arsitektur dan spesifikasi (order sheet) yang diunggah berikut secara multimodal.
Lakukan ekstraksi dan analisis mendalam, lalu berikan sebuah dokumen ringkasan pengerjaan proyek arsitektur/renovasi yang terstruktur dan ter-grounding (terikat bukti nyata dari lembar file) persis dengan cara kerja asisten AI di Google NotebookLM.

Kamu wajib menyediakan data sesuai skema JSON yang ditentukan, di mana setiap kesimpulan wajib menyertakan label referensi file asalnya di bagian "sources" (contoh: ["nama_file_denah_1.png"]).

INFORMASI HARAP DIGROUNDING SECARA VISUAL (BACA DENGAN TELITI):
Setiap kali kamu mengekstrak sebuah fakta penting (misalnya warna lantai, tinggi ruang CH, atau dakar/kitchen), tolong tentukan letak tulisan/simbol tersebut secara visual di berkas asalnya. Laporkan koordinat lokasi tersebut dalam bentuk "box" ({ "source": "nama_file", "x": horizontal, "y": vertikal, "w": lebar, "h": tinggi }) dengan nilai persentase 0 hingga 100 relatif terhadap gambar asalnya.
- x, y: Posisi sudut kiri-atas dari teks/coretan tersebut dalam persen lebar/tinggi gambar.
- w, h: Lebar dan tinggi kotak highlight yang mengelilingi teks/coretan tersebut dalam persen lebar/tinggi gambar.
Contoh: jika kata "CH=2400" berada di sudut kanan atas denah 'plan1.png', koordinat persennya mungkin { "source": "plan1.png", "x": 75, "y": 12, "w": 12, "h": 5 }.
Bila informasi tidak tercatat atau bersifat kesimpulan umum / tidak ada tempat spesifik, isikan koordinat default { "source": "", "x": 0, "y": 0, "w": 0, "h": 0 }.

Rincilah poin-poin berikut dengan sangat teliti:
1. Rangkuman detail utama permintaan renovasi proyek ini.
2. Poin penting/kritis yang perlu di-highlight atau sangat penting diperhatikan arsitek/kontraktor pada lapangan.
3. Mood (Vibes atau konsep arsitektur yang diinginkan klien).
4. Warna lantai yang diminta.
5. Warna dinding yang diminta.
6. Warna furniture yang diminta.
7. Warna & tipe dakar/kitchen yang diminta.
8. Warna kusen jendela yang diminta.
9. Warna kusen pintu yang diminta.
10. Material finishing pintu yang diminta.
11. Ketinggian ruang CH (Clear Height/Ceiling Height) yang tercatat di ruangan.
12. Catatan-catatan khusus / pelengkap pengerjaan.
13. Tulisan tangan (Handwritten Notes) yang tertera di dokumen. Analisis dan bacakan tulisan tangan tersebut, artikan teks aslinya (misal kanji Jepang atau coretan dimensi), berikan arti dan maksud pengerjaannya secara presisi disertai dengan teks redaksi aslinya.
`;

const boxSchema = {
  type: Type.OBJECT,
  description:
    "Koordinat area rujukan visual teks pada file gambar asal (skala 0 - 100%). Isi default jika tak ada rujukan spesifik.",
  properties: {
    source: { type: Type.STRING },
    x: { type: Type.NUMBER },
    y: { type: Type.NUMBER },
    w: { type: Type.NUMBER },
    h: { type: Type.NUMBER },
  },
  required: ["source", "x", "y", "w", "h"],
};

export async function summarizeItems(items: AiItem[]) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Tidak ada dokumen atau denah yang diunggah untuk dirangkum.");
  }

  const ai = getGeminiClient();
  const fileParts = items.map((item) => imagePartFromDataUrl(item.src));
  const metadataText =
    "DAFTAR BERKAS DOKUMEN YANG DIUNGGAH:\n" +
    items
      .map(
        (item, idx) =>
          `Gambar #${idx + 1}: Nama File: "${item.label}", Tipe Kategori: ${
            item.type === "denah" ? "Denah Konstruksi (Blueprint)" : "Spesifikasi/Brief (Order Sheet)"
          }`
      )
      .join("\n");

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [...fileParts, { text: metadataText }, { text: SUMMARIZE_PROMPT }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          projectSummary: {
            type: Type.OBJECT,
            properties: {
              text: {
                type: Type.STRING,
                description:
                  "Ringkasan detail utama permintaan renovasi proyek ini dalam 2-3 kalimat padat (Bahasa Indonesia).",
              },
              sources: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Daftar nama file sumber yang merujuk pada kesimpulan ini.",
              },
              box: boxSchema,
            },
            required: ["text", "sources", "box"],
          },
          highlights: {
            type: Type.ARRAY,
            description: "Daftar poin penting pelaksana lapangan (highlight kritis).",
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING, description: "Penjelasan detail poin kritis renovasi." },
                sources: { type: Type.ARRAY, items: { type: Type.STRING } },
                box: boxSchema,
              },
              required: ["text", "sources", "box"],
            },
          },
          design: {
            type: Type.OBJECT,
            properties: {
              mood: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  sources: { type: Type.ARRAY, items: { type: Type.STRING } },
                  box: boxSchema,
                },
                required: ["text", "sources", "box"],
              },
              floorColor: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  sources: { type: Type.ARRAY, items: { type: Type.STRING } },
                  box: boxSchema,
                },
                required: ["text", "sources", "box"],
              },
              wallColor: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  sources: { type: Type.ARRAY, items: { type: Type.STRING } },
                  box: boxSchema,
                },
                required: ["text", "sources", "box"],
              },
              furnitureColor: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  sources: { type: Type.ARRAY, items: { type: Type.STRING } },
                  box: boxSchema,
                },
                required: ["text", "sources", "box"],
              },
              kitchenDetail: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  sources: { type: Type.ARRAY, items: { type: Type.STRING } },
                  box: boxSchema,
                },
                required: ["text", "sources", "box"],
              },
              windowFrames: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  sources: { type: Type.ARRAY, items: { type: Type.STRING } },
                  box: boxSchema,
                },
                required: ["text", "sources", "box"],
              },
              doorFrames: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  sources: { type: Type.ARRAY, items: { type: Type.STRING } },
                  box: boxSchema,
                },
                required: ["text", "sources", "box"],
              },
              doorFinishing: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  sources: { type: Type.ARRAY, items: { type: Type.STRING } },
                  box: boxSchema,
                },
                required: ["text", "sources", "box"],
              },
              ceilingHeight: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  sources: { type: Type.ARRAY, items: { type: Type.STRING } },
                  box: boxSchema,
                },
                required: ["text", "sources", "box"],
              },
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
              "ceilingHeight",
            ],
          },
          specialNotes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                sources: { type: Type.ARRAY, items: { type: Type.STRING } },
                box: boxSchema,
              },
              required: ["text", "sources", "box"],
            },
          },
          handwrittenNotes: {
            type: Type.ARRAY,
            description: "Daftar ulasan tulisan tangan yang terdeteksi di lembar denah/spesifikasi.",
            items: {
              type: Type.OBJECT,
              properties: {
                originalText: {
                  type: Type.STRING,
                  description:
                    "Redaksi asli tulisan tangan (bila aksara Jepang, tulis Kanji/Kana aslinya).",
                },
                translation: { type: Type.STRING, description: "Terjemahan harfiah dalam Bahasa Indonesia." },
                meaning: {
                  type: Type.STRING,
                  description: "Makna teknis dari coretan tersebut untuk kontraktor/arsitek.",
                },
                source: { type: Type.STRING, description: "Nama file tempat coretan tangan ini berada." },
                box: boxSchema,
              },
              required: ["originalText", "translation", "meaning", "source", "box"],
            },
          },
        },
        required: ["projectSummary", "highlights", "design", "specialNotes", "handwrittenNotes"],
      },
    },
  });

  if (!response.text) throw new Error("Gemini mengembalikan respon kosong.");
  return JSON.parse(response.text.trim());
}

const CHAT_SYSTEM_INSTRUCTION = `Kamu adalah AI Chat Assistant ahli bernama "Madorai Assist", asisten spesialis kontraktor dan arsitek Indonesia dalam menerjemahkan dan menganalisis berkas konstruksi Jepang (Madori/Floorplan dan Order Sheet/Brief).
Tugasmu adalah menjawab pertanyaan pengguna secara "grounded" (sangat terikat pada informasi aktual visual dan tekstual dari berkas dokumen yang diunggah).

Panduan Jawaban:
1. Jawablah menggunakan Bahasa Indonesia yang profesional, ramah, dan ringkas namun teknis dan akurat.
2. Selalu rujuk detail spesifik dari berkas (misalnya nama ruang, ukuran, atau no spesifikasi material) untuk membuktikan jawabanmu.
3. Jika ditanya hal yang tidak ada di berkas atau tidak dapat diamati secara visual dari denah/spesifikasi, katakan secara jujur bahwa informasi tersebut tidak ditemukan di berkas yang diunggah. Jangan mengarang data!
4. Jika pengguna bertanya tentang tulisan Jepang atau coretan tangan, bantu bacakan dan jelaskan maksud teknis konstruksinya secara santun.`;

export async function chatWithItems(
  items: AiItem[] = [],
  messages: Array<{ role: string; content: string }>
) {
  if (!Array.isArray(messages)) throw new Error("Kolom 'messages' wajib diisi.");

  const ai = getGeminiClient();
  const fileParts = Array.isArray(items) ? items.map((item) => imagePartFromDataUrl(item.src)) : [];

  const formattedHistory: any[] = messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));

  if (fileParts.length > 0) {
    const firstUserMsgIndex = formattedHistory.findIndex((history) => history.role === "user");
    if (firstUserMsgIndex !== -1) {
      formattedHistory[firstUserMsgIndex].parts = [
        ...fileParts,
        {
          text:
            "Berikut adalah semua dokumen denah arsitektur dan order sheet yang diunggah untuk proyek ini. Harap analisis dan pahami berkas-berkas ini.\n\nPertanyaan/Permintaan pengguna: " +
            formattedHistory[firstUserMsgIndex].parts[0].text,
        },
      ];
    } else {
      formattedHistory.unshift({
        role: "user",
        parts: [
          ...fileParts,
          { text: "Berikut adalah dokumen denah arsitektur dan laporannya untuk pengerjaan proyek ini." },
        ],
      });
    }
  }

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: formattedHistory,
    config: {
      systemInstruction: CHAT_SYSTEM_INSTRUCTION,
    },
  });

  return { reply: response.text || "Maaf, asisten tidak dapat memberikan jawaban." };
}
