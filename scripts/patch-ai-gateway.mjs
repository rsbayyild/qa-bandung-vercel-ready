import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appPath = path.join(root, "src", "App.tsx");
let source = fs.readFileSync(appPath, "utf8");

function replaceOnce(from, to, label) {
  if (!source.includes(from)) throw new Error(`AI Gateway patch target not found: ${label}`);
  source = source.replace(from, to);
}

const appMarker = "export default function App() {";
const gatewayPrelude = `// AI Gateway upload guard: keep request bodies small enough for serverless transport
// while preserving enough detail for Japanese OCR.
async function optimizeAiImageForUpload(src: string): Promise<string> {
  if (!src || !src.startsWith("data:image/")) return src;
  if (src.length <= 1_600_000) return src;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const maxSide = 2000;
        const sourceW = img.naturalWidth || img.width;
        const sourceH = img.naturalHeight || img.height;
        const scale = Math.min(1, maxSide / Math.max(sourceW, sourceH));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(sourceW * scale));
        canvas.height = Math.max(1, Math.round(sourceH * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(src);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        let quality = 0.88;
        let out = canvas.toDataURL("image/jpeg", quality);
        while (out.length > 2_400_000 && quality > 0.52) {
          quality -= 0.08;
          out = canvas.toDataURL("image/jpeg", quality);
        }
        resolve(out.length < src.length ? out : src);
      } catch { resolve(src); }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

type ChatAiProvider = "gemini" | "openai" | "glm" | "deepseek";
const CHAT_AI_MODELS: Record<ChatAiProvider, Array<{ value: string; label: string }>> = {
  gemini: [
    { value: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
    { value: "gemini-3.7-flash", label: "Gemini 3.7 Flash" },
  ],
  openai: [
    { value: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
    { value: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
    { value: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
  ],
  glm: [
    { value: "glm-4.6v", label: "GLM-4.6V" },
    { value: "glm-4.6v-flash", label: "GLM-4.6V Flash" },
  ],
  deepseek: [
    { value: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
    { value: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
  ],
};
const DEFAULT_CHAT_AI_MODEL: Record<ChatAiProvider, string> = {
  gemini: "gemini-3.6-flash",
  openai: "gpt-5.6-terra",
  glm: "glm-4.6v-flash",
  deepseek: "deepseek-v4-flash",
};

`;
replaceOnce(appMarker, gatewayPrelude + appMarker, "App entry");

replaceOnce(
  '  const [errorNotice, setErrorNotice] = useState<string | null>(null);',
  `  const [errorNotice, setErrorNotice] = useState<string | null>(null);\n\n  // SCAN and RINGKASAN are routed server-side to Gemini. This selector is Chat-only.\n  const [chatAiProvider, setChatAiProvider] = useState<ChatAiProvider>("gemini");\n  const [chatAiModel, setChatAiModel] = useState<string>(DEFAULT_CHAT_AI_MODEL.gemini);`,
  "Chat AI state"
);

const toastBlock = `  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 4500);
  };`;
replaceOnce(
  toastBlock,
  toastBlock + `\n\n  const changeChatAiProvider = (provider: ChatAiProvider) => {\n    setChatAiProvider(provider);\n    setChatAiModel(DEFAULT_CHAT_AI_MODEL[provider]);\n    showToast(\`Chat AI: \${provider.toUpperCase()}\`, "info");\n  };`,
  "Chat AI provider handler"
);

replaceOnce(
  `          items: aiItems,\n          messages: chatMessagesForApi`,
  `          items: aiItems,\n          messages: chatMessagesForApi,\n          provider: chatAiProvider,\n          model: chatAiModel`,
  "Main chat provider payload"
);
replaceOnce(
  `          messages: [\n            { role: "user", content: promptText }\n          ]`,
  `          messages: [\n            { role: "user", content: promptText }\n          ],\n          provider: chatAiProvider,\n          model: chatAiModel`,
  "Progress chat provider payload"
);

replaceOnce(
  '// Calls the server-side proxy `/api/analyze` ensuring process.env.GEMINI_API_KEY is secure',
  '// Calls the server-side AI Gateway. SCAN routing is owned by the backend, not UI state.',
  "Scan comment"
);
replaceOnce('          imageB64: croppedB64,', '          imageB64: await optimizeAiImageForUpload(croppedB64),', "Scan image compression");
replaceOnce('console.error("Gemini server-side evaluation error:", err);', 'console.error("AI Gateway scan error:", err);', "Scan error log");

const quotaBlock = `      const isQuotaError = err.message && (
        err.message.toLowerCase().includes("quota") || 
        err.message.toLowerCase().includes("429") || 
        err.message.toLowerCase().includes("exhausted") ||
        err.message.toLowerCase().includes("exceeded")
      );

      if (isQuotaError) {
        setSimulationEnabled(true);
        setErrorNotice("Kuota harian Gemini API (Free Tier) telah habis. Mengaktifkan Mode Simulasi Offline agar Anda tetap lancar mendesain & menganalisis.");
        applySimulatedResult(pinId, hitItem.type);
        return;
      }

`;
replaceOnce(
  quotaBlock,
  `      // Do not guess the cause. Surface the exact Gateway error and keep offline\n      // simulation as an explicit user choice.\n      setErrorNotice(\`AI Gateway gagal: \${err?.message || String(err)}\`);\n\n`,
  "Misleading quota fallback"
);
source = source.replaceAll("GAGAL EVALUASI (QUOTA LIMIT):", "GAGAL EVALUASI AI:");

const progressButton = `          <button 
            id="btn-upload-progress"
            onClick={() => progressFileRef.current?.click()}
            className="flex items-center gap-1.5 text-3xs font-bold uppercase tracking-wider px-2.5 py-1 bg-neutral-200/10 hover:bg-neutral-200/25 border border-neutral-400/15 text-neutral-300/80 hover:text-white rounded-sm transition-all cursor-pointer shadow-sm animate-fade-in"
            title="Upload Bukti / Foto Progress Lapangan"
          >
            <CheckCircle2 className="w-3 h-3 text-neutral-300/60" />
            <span>PROGRESS</span>
          </button>`;
const chatSelector = `${progressButton}

          <div className="w-px h-5 bg-cod-800" />
          <div className="flex items-center gap-1 bg-cod-900/70 border border-cod-800 px-1 py-0.5 rounded-sm" title="Provider ini hanya untuk Chat. SCAN dan Ringkasan dirutekan server-side ke Gemini.">
            <span className="text-[7px] font-black tracking-widest text-cod-500 px-1">CHAT AI</span>
            <select value={chatAiProvider} onChange={(e) => changeChatAiProvider(e.target.value as ChatAiProvider)} className="bg-cod-950 text-[8px] font-mono font-bold text-cod-200 border border-cod-800 px-1.5 py-1 outline-none cursor-pointer" aria-label="Chat AI Provider">
              <option value="gemini">GEMINI</option>
              <option value="openai">OPENAI</option>
              <option value="glm">GLM</option>
              <option value="deepseek">DEEPSEEK</option>
            </select>
            <select value={chatAiModel} onChange={(e) => setChatAiModel(e.target.value)} className="bg-cod-950 text-[8px] font-mono font-bold text-cod-200 border border-cod-800 px-1.5 py-1 outline-none cursor-pointer max-w-[150px]" aria-label="Chat AI Model">
              {CHAT_AI_MODELS[chatAiProvider].map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>`;
replaceOnce(progressButton, chatSelector, "Chat AI selector");

fs.writeFileSync(appPath, source);
console.log("Applied clean AI Gateway frontend integration.");
