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
    if (!Array.isArray(body?.messages)) {
      return response.status(400).json({ error: "Kolom 'messages' wajib diisi." });
    }

    const ai = await import("../lib/ai.ts");
    const result = await ai.chatWithItems(body.items || [], body.messages, {
      provider: body.provider,
      model: body.model,
    });
    return response.status(200).json(result);
  } catch (error: any) {
    console.error("Chat API failed:", error);
    return response.status(500).json({
      error: error?.message || "Gagal menghubungi asisten AI.",
      stage: "chat",
      handler: "node-req-res-lazy-import-ts",
    });
  }
}
