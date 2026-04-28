import { cpSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const buildDir = join(__dirname, "build");
const arrivalHtml = join(buildDir, "arrival-counter.html");
const destDir = join(__dirname, "..", "..", "clinic_flow", "public", "head-app");

if (!existsSync(buildDir)) {
  console.error("Build directory not found. Run `npm run build` first.");
  process.exit(1);
}

if (!existsSync(arrivalHtml)) {
  console.error("Arrival Counter build output missing: build/arrival-counter.html");
  process.exit(1);
}

if (!existsSync(destDir)) {
  mkdirSync(destDir, { recursive: true });
}

cpSync(buildDir, destDir, { recursive: true });

console.log(`Copied build output to ${destDir}`);
