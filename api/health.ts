function safeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }
  return { message: String(error) };
}

export default {
  async fetch(request: Request) {
    const url = new URL(request.url);
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";
    const base = {
      ok: true,
      runtime: `node ${process.version}`,
      keyConfigured: Boolean(apiKey && apiKey !== "MY_GEMINI_API_KEY" && apiKey !== "YOUR_GEMINI_API_KEY"),
      model,
    };

    if (url.searchParams.get("test") !== "gemini") {
      return Response.json(base);
    }

    if (!base.keyConfigured) {
      return Response.json(
        {
          ...base,
          ok: false,
          stage: "environment",
          error: "GEMINI_API_KEY belum tersedia di runtime Vercel. Tambahkan Environment Variable lalu redeploy deployment Production.",
        },
        { status: 500 }
      );
    }

    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model,
        contents: "Balas tepat dengan kata: OK",
      });

      return Response.json({
        ...base,
        geminiReachable: true,
        responseReceived: Boolean(response.text),
      });
    } catch (error) {
      console.error("Gemini health test failed:", error);
      return Response.json(
        {
          ...base,
          ok: false,
          geminiReachable: false,
          stage: "gemini",
          error: safeError(error),
        },
        { status: 500 }
      );
    }
  },
};
