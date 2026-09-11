import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { Send } from "lucide-static";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, "..", "icons");

const ICON_BACKGROUND = "#2AABEE";
const ICON_FOREGROUND = "#FFFFFF";

mkdirSync(iconsDir, { recursive: true });

for (const size of [16, 48, 128]) {
    const svg = buildLucideIconSvg(Send, size);
    const png = await sharp(Buffer.from(svg)).png().toBuffer();

    writeFileSync(join(iconsDir, `icon${size}.png`), png);
}

console.log("Lucide Send icons generated in", iconsDir);

/**
 * Builds a rounded extension icon SVG from a Lucide static markup string.
 */
function buildLucideIconSvg(lucideMarkup, size) {
    const innerPaths = extractSvgInner(lucideMarkup);
    const padding = size * 0.2;
    const scale = (size - padding * 2) / 24;
    const offset = padding;
    const radius = size * 0.22;

    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
        `<rect width="${size}" height="${size}" rx="${radius}" fill="${ICON_BACKGROUND}"/>`,
        `<g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="${ICON_FOREGROUND}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`,
        innerPaths,
        "</g>",
        "</svg>"
    ].join("");
}

/**
 * Extracts path/content nodes from a Lucide static SVG string.
 */
function extractSvgInner(markup) {
    const match = markup.match(/<svg[\s\S]*?>([\s\S]*?)<\/svg>/i);

    if (!match) {
        throw new Error("Invalid Lucide SVG markup.");
    }

    return match[1]
        .replace(/stroke="currentColor"/g, `stroke="${ICON_FOREGROUND}"`)
        .trim();
}
