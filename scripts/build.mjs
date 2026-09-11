import * as esbuild from "esbuild";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dist = join(root, "dist");

mkdirSync(dist, { recursive: true });
mkdirSync(join(dist, "icons"), { recursive: true });

const entries = [
    { in: "src/background/ServiceWorker.ts", out: "background" },
    { in: "src/content/ContentScript.ts", out: "content" },
    { in: "src/options/OptionsPage.ts", out: "options" }
];

await esbuild.build({
    entryPoints: entries.map((entry) => ({
        in: join(root, entry.in),
        out: entry.out
    })),
    bundle: true,
    outdir: dist,
    format: "iife",
    target: "chrome120",
    logLevel: "info"
});

cpSync(join(root, "manifest.json"), join(dist, "manifest.json"));
cpSync(join(root, "src/options/OptionsPage.html"), join(dist, "options.html"));
cpSync(join(root, "src/options/OptionsPage.css"), join(dist, "options.css"));
cpSync(join(root, "src/content/styles/content.css"), join(dist, "content.css"));
cpSync(join(root, "icons"), join(dist, "icons"), { recursive: true });

console.log("Build complete:", dist);
