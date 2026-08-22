function safeError(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { message: String(error) };
}

export default {
  async fetch(request: Request) {
    const url = new URL(request.url);
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || "gpt-5.6-terra";
    const keyConfigured = Boolean(apiKey && apiKey !== "YOUR_OPENAI_API_KEY");

    const base = {
      ok: true,
      provider: "openai",
      runtime: `node ${process.version}`,
      keyConfigured,
      model,
    };

    if (url.searchParams.get("test") !== "openai") {
      return Response.json(base);
    }

    if (!keyConfigured) {
      return Response.json(
        {
          ...base,
          ok: false,
          stage: "environment",
          error:
            "OPENAI_API_KEY belum tersedia di runtime Vercel. Tambahkan Environment Variable lalu redeploy Production.",
        },
        { status: 500 }
      );
    }

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          store: false,
          input: "Balas tepat dengan kata: OK",
          max_output_tokens: 20,
        }),
      });

      const raw = await response.text();
      let payload: any;
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        payload = raw;
      }

      if (!response.ok) {
        return Response.json(
          {
            ...base,
            ok: false,
            openaiReachable: false,
            stage: "openai",
            status: response.status,
            error: payload?.error?.message || raw || "OpenAI request failed",
          },
          { status: 500 }
        );
      }

      return Response.json({
        ...base,
        openaiReachable: true,
        responseReceived: Array.isArray(payload?.output) && payload.output.length > 0,
      });
    } catch (error) {
      console.error("OpenAI health test failed:", error);
      return Response.json(
        {
          ...base,
          ok: false,
          openaiReachable: false,
          stage: "openai",
          error: safeError(error),
        },
        { status: 500 }
      );
    }
  },
};
