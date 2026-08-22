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
    if (!Array.isArray(body?.items) || body.items.length === 0) {
      return response.status(400).json({ error: "Tidak ada dokumen atau denah yang diunggah untuk dirangkum." });
    }

    const ai = await import("../lib/ai");
    const result = await ai.summarizeItems(body.items, { provider: body.provider, model: body.model });
    return response.status(200).json(result);
  } catch (error: any) {
    console.error("Summarize API failed:", error);
    return response.status(500).json({
      error: error?.message || "Gagal membuat ringkasan multiberkas.",
      stage: "summarize",
      handler: "node-req-res-lazy-import",
    });
  }
}
