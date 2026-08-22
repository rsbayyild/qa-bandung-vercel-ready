import { getAiRuntimeStatus, testAiProvider } from "../lib/ai";

function safeError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { message: String(error) };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const runtime = getAiRuntimeStatus();
  const provider = url.searchParams.get("provider") || "openai";
  const model = url.searchParams.get("model") || undefined;
  const base = {
    ok: true,
    runtime: `node ${process.version}`,
    provider,
    model,
    ...runtime,
  };

  if (url.searchParams.get("test") !== "provider") {
    return Response.json(base);
  }

  try {
    const result = await testAiProvider({ provider, model });
    return Response.json({ ...base, reachable: true, selected: result });
  } catch (error) {
    console.error("AI provider health test failed:", error);
    return Response.json(
      { ...base, ok: false, reachable: false, error: safeError(error) },
      { status: 500 }
    );
  }
}
