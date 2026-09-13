import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Extension package root. */
export const root = join(__dirname, "..");

/** Build output directory. */
export const dist = join(root, "dist");

/** Bundler entry points. */
export const entries = [
    { in: "src/background/ServiceWorker.ts", out: "background" },
    { in: "src/content/ContentScript.ts", out: "content" },
    { in: "src/options/OptionsPage.ts", out: "options" }
];

/** Static assets copied into dist on every build. */
export const staticAssetPaths = [
    join(root, "manifest.json"),
    join(root, "_locales"),
    join(root, "src/options/OptionsPage.html"),
    join(root, "src/options/OptionsPage.css"),
    join(root, "src/content/styles/content.css"),
    join(root, "icons")
];

let staticCopyChain = Promise.resolve();

/**
 * Copies static assets into dist, serializing concurrent callers.
 */
export function copyStaticAssets() {
    staticCopyChain = staticCopyChain
        .then(() => copyStaticAssetsOnce())
        .catch((error) => {
            console.error("[build] failed to copy static assets: %O", error);
        });

    return staticCopyChain;
}

async function copyStaticAssetsOnce() {
    mkdirSync(dist, { recursive: true });
    mkdirSync(join(dist, "icons"), { recursive: true });

    await copyFileWithRetry(join(root, "manifest.json"), join(dist, "manifest.json"));
    await copyDirectoryWithRetry(join(root, "_locales"), join(dist, "_locales"));
    await copyFileWithRetry(join(root, "src/options/OptionsPage.html"), join(dist, "options.html"));
    await copyFileWithRetry(join(root, "src/options/OptionsPage.css"), join(dist, "options.css"));
    await copyFileWithRetry(join(root, "src/content/styles/content.css"), join(dist, "content.css"));
    await copyDirectoryWithRetry(join(root, "icons"), join(dist, "icons"));
}

async function copyFileWithRetry(sourcePath, destinationPath, maxAttempts = 5) {
    mkdirSync(dirname(destinationPath), { recursive: true });

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            copyFileSync(sourcePath, destinationPath);
            return;
        } catch (error) {
            if (attempt === maxAttempts || !isRetryableCopyError(error)) {
                throw error;
            }

            await sleep(50 * attempt);
        }
    }
}

async function copyDirectoryWithRetry(sourcePath, destinationPath, maxAttempts = 5) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            copyDirectoryContents(sourcePath, destinationPath);
            return;
        } catch (error) {
            if (attempt === maxAttempts || !isRetryableCopyError(error)) {
                throw error;
            }

            await sleep(50 * attempt);
        }
    }
}

function copyDirectoryContents(sourcePath, destinationPath) {
    mkdirSync(destinationPath, { recursive: true });

    for (const entry of readdirSync(sourcePath, { withFileTypes: true })) {
        const entrySourcePath = join(sourcePath, entry.name);
        const entryDestinationPath = join(destinationPath, entry.name);

        if (entry.isDirectory()) {
            copyDirectoryContents(entrySourcePath, entryDestinationPath);
            continue;
        }

        if (!entry.isFile()) {
            continue;
        }

        copyFileSync(entrySourcePath, entryDestinationPath);
    }
}

function isRetryableCopyError(error) {
    if (!error || typeof error !== "object") {
        return false;
    }

    if (process.platform === "win32" && error.syscall === "unlink") {
        return true;
    }

    return error.code === "EBUSY" || error.code === "EPERM" || error.code === "EACCES";
}

function sleep(durationMs) {
    return new Promise((resolve) => {
        setTimeout(resolve, durationMs);
    });
}

/**
 * Returns the shared esbuild options for extension bundles.
 */
export function getBundleOptions() {
    return {
        entryPoints: entries.map((entry) => ({
            in: join(root, entry.in),
            out: entry.out
        })),
        bundle: true,
        outdir: dist,
        format: "iife",
        target: "chrome120",
        logLevel: "info"
    };
}

/**
 * Builds extension JavaScript bundles and copies static assets.
 */
export async function buildExtension() {
    await copyStaticAssets();
    await esbuild.build(getBundleOptions());
}
