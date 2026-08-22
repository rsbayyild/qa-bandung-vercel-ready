import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appPath = path.join(root, "src", "App.tsx");
let source = fs.readFileSync(appPath, "utf8");

if (source.includes('<option value="gemini">GEMINI</option>')) {
  console.log("Gemini UI already patched.");
  process.exit(0);
}

function replaceOnce(from, to, label) {
  if (!source.includes(from)) throw new Error(`Gemini UI patch target not found: ${label}`);
  source = source.replace(from, to);
}

replaceOnce(
  'type AiProvider = "openai" | "glm" | "deepseek";',
  'type AiProvider = "openai" | "gemini" | "glm" | "deepseek";',
  "AiProvider type"
);

replaceOnce(
  '  glm: [\n    { value: "glm-4.6v", label: "GLM-4.6V", vision: true },',
  '  gemini: [\n    { value: "gemini-3.7-flash", label: "Gemini 3.7 Flash", vision: true },\n    { value: "gemini-3.6-flash", label: "Gemini 3.6 Flash", vision: true },\n  ],\n  glm: [\n    { value: "glm-4.6v", label: "GLM-4.6V", vision: true },',
  "Gemini model options"
);

replaceOnce(
  '  glm: "glm-4.6v-flash",',
  '  gemini: "gemini-3.7-flash",\n  glm: "glm-4.6v-flash",',
  "Gemini default model"
);

replaceOnce(
  '      showToast("DeepSeek saat ini text-only; SCAN/RINGKASAN visual memerlukan OpenAI atau GLM.", "info");',
  '      showToast("DeepSeek saat ini text-only; SCAN/RINGKASAN visual memerlukan OpenAI, Gemini, atau GLM.", "info");',
  "DeepSeek warning"
);

replaceOnce(
  '      showToast(`AI Engine: ${provider === "openai" ? "OpenAI" : "GLM"}`, "info");',
  '      const providerLabel = provider === "openai" ? "OpenAI" : provider === "gemini" ? "Gemini" : "GLM";\n      showToast(`AI Engine: ${providerLabel}`, "info");',
  "Provider toast"
);

replaceOnce(
  '              <option value="openai">OPENAI</option>\n              <option value="glm">GLM</option>',
  '              <option value="openai">OPENAI</option>\n              <option value="gemini">GEMINI</option>\n              <option value="glm">GLM</option>',
  "Provider selector"
);

fs.writeFileSync(appPath, source);
console.log("Patched Gemini provider into src/App.tsx");
