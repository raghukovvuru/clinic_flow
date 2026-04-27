import { cpSync, existsSync, mkdirSync, renameSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const buildDir = join(__dirname, "build");
const destDir = join(__dirname, "..", "..", "clinic_flow", "public", "head-app");

if (!existsSync(buildDir)) {
  console.error("Build directory not found. Run `npm run build` first.");
  process.exit(1);
}

if (!existsSync(destDir)) {
  mkdirSync(destDir, { recursive: true });
}

cpSync(buildDir, destDir, { recursive: true });

const flatHtml = join(destDir, "arrival-counter.html");
const arrivalDir = join(destDir, "arrival-counter");
if (existsSync(flatHtml)) {
  if (!existsSync(arrivalDir)) {
    mkdirSync(arrivalDir, { recursive: true });
  }
  renameSync(flatHtml, join(arrivalDir, "index.html"));
}

console.log(`Copied build output to ${destDir}`);
