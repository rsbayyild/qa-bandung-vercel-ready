import { analyzeImage } from "./_ai";

function bodyOf(request: any) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") {
    try { return JSON.parse(request.body); } catch { return {}; }
  }
  return {};
}

export default async function handler(request: any, response: any) {
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });

  try {
    const body = bodyOf(request);
    if (!body?.imageB64) return response.status(400).json({ error: "Crop gambar base64 tidak ditemukan." });

    const result = await analyzeImage(
      body.imageB64,
      body.type === "order" ? "order" : "denah",
      { provider: body.provider, model: body.model }
    );
    return response.status(200).json(result);
  } catch (error: any) {
    console.error("Analyze API failed:", error);
    return response.status(500).json({
      error: error?.message || "Gagal menganalisis gambar.",
      stage: "analyze",
      handler: "node-req-res-api-helper",
    });
  }
}
