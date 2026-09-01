# Madorai Assist / QA Bandung

Production Vite app for reviewing Japanese renovation and construction documents.

## AI Gateway

The serverless AI layer lives under `/api` and keeps provider keys server-side.

- `POST /api/analyze` — SCAN/OCR. Pinned server-side to Gemini 3.6 Flash.
- `POST /api/summarize` — visual project summary. Pinned server-side to Gemini 3.6 Flash.
- `POST /api/chat` — conversational analysis. Provider/model can be selected from the Chat AI UI.
- `GET /api/health` — minimal gateway/configuration status. It never exposes secret values.

The production visual path intentionally ignores frontend provider state. This prevents stale UI state from rerouting OCR or summaries to another provider.

## Environment variables

Required for production visual features:

```text
GEMINI_API_KEY=...
```

Optional chat providers:

```text
OPENAI_API_KEY=...
GLM_API_KEY=...
DEEPSEEK_API_KEY=...
```

## Build

The original Google AI Studio frontend source is reconstructed from the bootstrap archive, then one deterministic integration step is applied:

```text
scripts/unpack.mjs
scripts/patch-ai-gateway.mjs
```

The previous multiprovider/Gemini/resilience patch chain is no longer used.
