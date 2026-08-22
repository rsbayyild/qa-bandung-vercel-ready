import { analyzeImage } from "../lib/ai";

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
    try {
      const body = await request.json();
      if (!body?.imageB64) return Response.json({ error: "Crop gambar base64 tidak ditemukan." }, { status: 400 });
      const result = await analyzeImage(body.imageB64, body.type === "order" ? "order" : "denah", {
        provider: body.provider,
        model: body.model,
      });
      return Response.json(result);
    } catch (error: any) {
      console.error("Analyze API failed:", error);
      return Response.json({ error: error?.message || "Gagal menganalisis gambar.", stage: "analyze" }, { status: 500 });
    }
  },
};
