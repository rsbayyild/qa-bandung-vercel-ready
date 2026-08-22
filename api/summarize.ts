import { summarizeItems } from "../lib/openai";

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    try {
      const body = await request.json();
      if (!Array.isArray(body?.items) || body.items.length === 0) {
        return Response.json(
          { error: "Tidak ada dokumen atau denah yang diunggah untuk dirangkum." },
          { status: 400 }
        );
      }

      const result = await summarizeItems(body.items);
      return Response.json(result);
    } catch (error: any) {
      console.error("Summarize API failed:", error);
      return Response.json(
        {
          error: error?.message || "Gagal membuat ringkasan multiberkas menggunakan OpenAI.",
          stage: "summarize",
        },
        { status: 500 }
      );
    }
  },
};
