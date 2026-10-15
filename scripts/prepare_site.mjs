// Copies the JSON data next to the compiled site so GitHub Pages can serve it.
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
mkdirSync("docs/data", { recursive: true });
cpSync("src/data", "docs/data", { recursive: true });
writeFileSync("docs/.nojekyll", "");
console.log("site prepared in docs/");
