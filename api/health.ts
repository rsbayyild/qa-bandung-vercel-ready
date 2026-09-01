import { getAiRuntimeStatus, testAiProvider } from "./_ai";

function safeError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return { message: String(error) };
}

export default async function handler(request: any, response: any) {
  try {
    const provider = String(request.query?.provider || "openai");
    const model = request.query?.model ? String(request.query.model) : undefined;
    const test = String(request.query?.test || "");

    const runtime = getAiRuntimeStatus();
    const base = {
      ok: true,
      runtime: `node ${process.version}`,
      handler: "node-req-res-api-helper",
      provider,
      model,
      ...runtime,
    };

    if (test !== "provider") {
      return response.status(200).json(base);
    }

    try {
      const result = await testAiProvider({ provider, model });
      return response.status(200).json({ ...base, reachable: true, selected: result });
    } catch (error) {
      console.error("AI provider health test failed:", error);
      return response.status(500).json({ ...base, ok: false, reachable: false, error: safeError(error) });
    }
  } catch (error) {
    console.error("Health function bootstrap failed:", error);
    return response.status(500).json({
      ok: false,
      stage: "bootstrap",
      handler: "node-req-res-api-helper",
      error: safeError(error),
    });
  }
}
