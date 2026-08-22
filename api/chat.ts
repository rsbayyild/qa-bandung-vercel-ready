import { chatWithItems } from "../lib/gemini";

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    try {
      const body = await request.json();
      if (!Array.isArray(body?.messages)) {
        return Response.json({ error: "Kolom 'messages' wajib diisi." }, { status: 400 });
      }

      const result = await chatWithItems(body.items || [], body.messages);
      return Response.json(result);
    } catch (error: any) {
      console.error("Chat API failed:", error);
      return Response.json(
        {
          error: error?.message || "Gagal menghubungi asisten AI.",
          stage: "chat",
        },
        { status: 500 }
      );
    }
  },
};
