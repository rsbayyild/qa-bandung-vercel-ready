import { analyzeImage } from "./_ai.js";

const VISUAL_PROVIDER = "gemini";
const VISUAL_MODEL = "gemini-3.6-flash";

function bodyOf(request: any) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") {
    try { return JSON.parse(request.body); } catch { return {}; }
  }
  return {};
}

export default async function handler(request: any, response: any) {
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });

  response.setHeader("X-AI-Provider", VISUAL_PROVIDER);
  response.setHeader("X-AI-Model", VISUAL_MODEL);

  try {
    const body = bodyOf(request);
    if (!body?.imageB64) return response.status(400).json({ error: "Crop gambar base64 tidak ditemukan." });

    // Visual SCAN is intentionally pinned server-side to Gemini.
    // Frontend provider/model state is ignored here so stale UI state cannot route OCR to OpenAI.
    const result = await analyzeImage(
      body.imageB64,
      body.type === "order" ? "order" : "denah",
      { provider: VISUAL_PROVIDER, model: VISUAL_MODEL }
    );
    return response.status(200).json(result);
  } catch (error: any) {
    console.error("Analyze API failed:", error);
    return response.status(500).json({
      error: error?.message || "Gagal menganalisis gambar.",
      stage: "analyze",
      provider: VISUAL_PROVIDER,
      model: VISUAL_MODEL,
      handler: "node-req-res-js-helper-pinned-vision",
    });
  }
}
