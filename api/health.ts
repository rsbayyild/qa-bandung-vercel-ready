import { getAiRuntimeStatus } from "./_gateway.js";

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") return response.status(405).json({ error: "Method not allowed" });

  try {
    return response.status(200).json({
      ok: true,
      service: "madorai-ai-gateway",
      runtime: `node ${process.version}`,
      ...getAiRuntimeStatus(),
    });
  } catch (error: any) {
    console.error("AI Gateway health failed:", error);
    return response.status(500).json({
      ok: false,
      service: "madorai-ai-gateway",
      error: error?.message || String(error),
    });
  }
}
