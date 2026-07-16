// Build the PuttyPNG monofile by injecting the canonical engine (puttypng.js)
// into the page template. This keeps ONE source of truth for the engine: the
// Node self-test runs against puttypng.js, and the shipped page embeds the exact
// same bytes inside <script id="puttypng-engine">.
//
// Usage:  node build.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const engine = readFileSync(join(__dirname, "puttypng.js"), "utf8");
const template = readFileSync(join(__dirname, "index.template.html"), "utf8");

const MARKER = "/* __PUTTYPNG_ENGINE__ */";
if (!template.includes(MARKER)) {
  console.error("FATAL: engine marker not found in index.template.html");
  process.exit(2);
}

const output = template.replace(MARKER, () => engine);
const outPath = join(__dirname, "V1_-_PuttyPNG_Website.html");
writeFileSync(outPath, output, "utf8");

console.log("Built " + outPath.replace(__dirname + "\\", "").replace(__dirname + "/", ""));
console.log("Engine: " + engine.length.toLocaleString() + " bytes");
console.log("Page:   " + output.length.toLocaleString() + " bytes");
