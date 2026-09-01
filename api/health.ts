import { analyzeImage, getAiRuntimeStatus, testAiProvider } from "./_ai.js";

function safeError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return { message: String(error) };
}

const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

export default async function handler(request: any, response: any) {
  try {
    const provider = String(request.query?.provider || "openai");
    const model = request.query?.model ? String(request.query.model) : undefined;
    const test = String(request.query?.test || "");

    const runtime = getAiRuntimeStatus();
    const base = {
      ok: true,
      runtime: `node ${process.version}`,
      handler: "node-req-res-js-helper",
      provider,
      model,
      ...runtime,
    };

    if (!test) return response.status(200).json(base);

    try {
      if (test === "provider") {
        const result = await testAiProvider({ provider, model });
        return response.status(200).json({ ...base, reachable: true, test: "text", selected: result });
      }

      if (test === "vision") {
        const result = await analyzeImage(TINY_PNG, "denah", { provider, model });
        return response.status(200).json({ ...base, reachable: true, test: "vision", result });
      }

      return response.status(400).json({ ...base, ok: false, error: { message: `Test '${test}' tidak dikenal. Gunakan provider atau vision.` } });
    } catch (error) {
      console.error("AI provider health test failed:", error);
      return response.status(500).json({ ...base, ok: false, reachable: false, test, error: safeError(error) });
    }
  } catch (error) {
    console.error("Health function bootstrap failed:", error);
    return response.status(500).json({
      ok: false,
      stage: "bootstrap",
      handler: "node-req-res-js-helper",
      error: safeError(error),
    });
  }
}
