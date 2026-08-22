import { analyzeImage } from "../lib/gemini";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body?.imageB64) {
      return Response.json({ error: "Crop gambar base64 tidak ditemukan." }, { status: 400 });
    }
    const result = await analyzeImage(body.imageB64, body.type === "order" ? "order" : "denah");
    return Response.json(result);
  } catch (error: any) {
    console.error("Analyze API failed:", error);
    return Response.json(
      { error: error?.message || "Gagal menganalisis gambar menggunakan Gemini." },
      { status: 500 }
    );
  }
}
