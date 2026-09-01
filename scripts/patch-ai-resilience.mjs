import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appPath = path.join(root, "src", "App.tsx");
let source = fs.readFileSync(appPath, "utf8");

if (!source.includes("optimizeAiImageForUpload")) {
  const marker = "export default function App() {";
  if (!source.includes(marker)) throw new Error("AI resilience patch: App marker not found");

  const helper = `
// Keep Vercel request bodies and multimodal token usage under control while
// preserving enough detail for Japanese OCR. Small crops are left untouched.
async function optimizeAiImageForUpload(src: string): Promise<string> {
  if (!src || !src.startsWith("data:image/")) return src;
  if (src.length <= 1_600_000) return src;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const maxSide = 2000;
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
        const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
        const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(src);
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.88;
        let out = canvas.toDataURL("image/jpeg", quality);
        while (out.length > 2_400_000 && quality > 0.5) {
          quality -= 0.08;
          out = canvas.toDataURL("image/jpeg", quality);
        }
        resolve(out.length < src.length ? out : src);
      } catch {
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

`;
  source = source.replace(marker, helper + marker);
}

source = source.replace(
  "          imageB64: croppedB64,",
  "          imageB64: await optimizeAiImageForUpload(croppedB64),"
);

source = source.replace(
  '        setErrorNotice("Kuota AI provider sedang habis/terbatas. Mengaktifkan Mode Simulasi Offline agar Anda tetap dapat melanjutkan workflow.");',
  '        setErrorNotice(`AI provider membalas quota/rate-limit. ${err?.message || ""} Mode Simulasi Offline diaktifkan sementara.`);'
);

// For non-quota failures, make sure the actual provider/backend error is visible.
const catchMarker = '      if (isQuotaError) {\n        setSimulationEnabled(true);';
if (source.includes(catchMarker) && !source.includes("AI provider gagal:")) {
  const quotaEnd = '        return;\n      }';
  const quotaAt = source.indexOf(catchMarker);
  const endAt = source.indexOf(quotaEnd, quotaAt);
  if (endAt !== -1) {
    const insertAt = endAt + quotaEnd.length;
    source = source.slice(0, insertAt) + '\n\n      setErrorNotice(`AI provider gagal: ${err?.message || String(err)}`);' + source.slice(insertAt);
  }
}

fs.writeFileSync(appPath, source);
console.log("Patched AI scan payload compression and clearer provider errors.");
