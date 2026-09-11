import archiver from "archiver";
import { createWriteStream, readFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const version = manifest.version;
const releaseDir = join(root, "release");
const zipPath = join(releaseDir, `social-telegram-embedder-v${version}.zip`);

mkdirSync(releaseDir, { recursive: true });

await new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", resolve);
    archive.on("error", reject);

    archive.pipe(output);
    archive.directory(join(root, "dist"), false);
    archive.finalize();
});

console.log("Created", zipPath);
