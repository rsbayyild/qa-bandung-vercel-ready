import { summarizeItems } from "./_gateway.js";

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
    if (!Array.isArray(body?.items) || body.items.length === 0) {
      return response.status(400).json({ error: "Tidak ada dokumen atau denah yang diunggah untuk dirangkum." });
    }

    // Visual summary is pinned server-side for predictable production behavior.
    const result = await summarizeItems(body.items, { provider: VISUAL_PROVIDER, model: VISUAL_MODEL });
    return response.status(200).json(result);
  } catch (error: any) {
    console.error("AI Gateway summarize failed:", error);
    return response.status(500).json({
      error: error?.message || "Gagal membuat ringkasan multiberkas.",
      stage: "summarize",
      provider: VISUAL_PROVIDER,
      model: VISUAL_MODEL,
    });
  }
}
