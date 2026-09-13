import { spawnSync } from "node:child_process";
import { watch } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    copyStaticAssets,
    dist,
    getBundleOptions,
    root,
    staticAssetPaths
} from "./build-lib.mjs";
import * as esbuild from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));

const STATIC_COPY_DEBOUNCE_MS = 200;
const ICONS_PATH = join(root, "icons");

let staticCopyTimer = null;

/**
 * Debounces static asset copies triggered by file watchers and esbuild.
 */
function scheduleStaticCopy(reason) {
    if (staticCopyTimer) {
        clearTimeout(staticCopyTimer);
    }

    staticCopyTimer = setTimeout(async () => {
        await copyStaticAssets();
        console.log(`[dev] static assets updated (${reason})`);
    }, STATIC_COPY_DEBOUNCE_MS);
}

/**
 * Generates extension icons once before starting watchers.
 */
function generateIconsOnce() {
    const result = spawnSync(process.execPath, [join(__dirname, "generate-icons.mjs")], {
        cwd: root,
        stdio: "inherit"
    });

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

/**
 * Watches non-bundled assets such as manifest, locales, and CSS.
 */
function watchStaticAssets() {
    for (const assetPath of staticAssetPaths) {
        if (assetPath === ICONS_PATH) {
            continue;
        }

        watch(assetPath, { recursive: true }, () => {
            scheduleStaticCopy(assetPath.replace(root, "").replace(/^[/\\]/, ""));
        });
    }
}

generateIconsOnce();
await copyStaticAssets();

const context = await esbuild.context({
    ...getBundleOptions(),
    plugins: [
        {
            name: "dev-copy-static-on-rebuild",
            setup(build) {
                build.onEnd((result) => {
                    if (result.errors.length === 0) {
                        scheduleStaticCopy("esbuild");
                        console.log(`[dev] rebuild complete -> ${dist}`);
                    }
                });
            }
        }
    ]
});

await context.watch();
watchStaticAssets();

console.log("[dev] watching source files; reload the extension in chrome://extensions after changes");
