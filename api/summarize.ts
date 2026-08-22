import { summarizeItems } from "../lib/ai";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!Array.isArray(body?.items) || body.items.length === 0) {
      return Response.json(
        { error: "Tidak ada dokumen atau denah yang diunggah untuk dirangkum." },
        { status: 400 }
      );
    }

    const result = await summarizeItems(body.items, {
      provider: body.provider,
      model: body.model,
    });

    return Response.json(result);
  } catch (error: any) {
    console.error("Summarize API failed:", error);
    return Response.json(
      { error: error?.message || "Gagal membuat ringkasan multiberkas.", stage: "summarize" },
      { status: 500 }
    );
  }
}
