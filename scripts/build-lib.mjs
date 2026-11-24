import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Extension package root. */
export const root = join(__dirname, "..");

/** Build output directory for Chrome. */
export const chromeDist = join(root, "dist");

/** Build output directory for Firefox. */
export const firefoxDist = join(root, "dist-firefox");

/** Active build target. */
let currentTarget = "chrome";

/** Default dist export, kept for callers that do not choose a target. */
export const dist = chromeDist;

/**
 * Selects the active build target.
 *
 * @param target - `chrome` or `firefox`.
 */
export function setBuildTarget(target) {
    if (target !== "chrome" && target !== "firefox") {
        throw new Error(`Unknown build target: ${target}`);
    }

    currentTarget = target;
}

/**
 * Returns the output directory of the active target.
 */
export function getDist() {
    return currentTarget === "firefox" ? firefoxDist : chromeDist;
}

/** Bundler entry points. */
export const entries = [
    { in: "src/background/ServiceWorker.ts", out: "background" },
    { in: "src/content/ContentScript.ts", out: "content" },
    { in: "src/content/InstagramVideoMapBootstrap.ts", out: "instagram-video-map-bootstrap" },
    { in: "src/injected/InstagramVideoMap.ts", out: "instagram-video-map" },
    { in: "src/options/OptionsPage.ts", out: "options" },
    { in: "src/popup/Popup.ts", out: "popup" }
];

/**
 * mtcute crypto WASM. The IIFE bundle cannot resolve it through import.meta.url,
 * so it ships as a file and the background loads it via chrome.runtime.getURL.
 */
const MTCUTE_WASM_SOURCE = "node_modules/@mtcute/wasm/mtcute-simd.wasm";

/** File name of the mtcute WASM inside dist. */
export const MtcuteWasmFileName = "mtcute.wasm";

/** Static assets copied into dist on every build. */
export const staticAssetPaths = [
    join(root, "manifest.json"),
    join(root, "_locales"),
    join(root, "src/options/OptionsPage.html"),
    join(root, "src/options/OptionsPage.css"),
    join(root, "src/options/SendChannels.css"),
    join(root, "src/options/TelegramAccountSection.css"),
    join(root, "src/options/SetupWizard.css"),
    join(root, "src/popup/Popup.html"),
    join(root, "src/popup/Popup.css"),
    join(root, "src/content/styles/content.css"),
    join(root, "icons"),
    join(root, MTCUTE_WASM_SOURCE)
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
    const output = getDist();

    mkdirSync(output, { recursive: true });
    mkdirSync(join(output, "icons"), { recursive: true });

    if (currentTarget === "firefox") {
        await writeFileWithRetry(join(output, "manifest.json"), buildFirefoxManifest());
    } else {
        await copyFileWithRetry(join(root, "manifest.json"), join(output, "manifest.json"));
    }
    await copyDirectoryWithRetry(join(root, "_locales"), join(output, "_locales"));
    await copyFileWithRetry(join(root, "src/options/OptionsPage.html"), join(output, "options.html"));
    await copyFileWithRetry(join(root, "src/options/OptionsPage.css"), join(output, "options.css"));
    await copyFileWithRetry(join(root, "src/options/SendChannels.css"), join(output, "send-channels.css"));
    await copyFileWithRetry(join(root, "src/options/TelegramAccountSection.css"), join(output, "account.css"));
    await copyFileWithRetry(join(root, "src/options/SetupWizard.css"), join(output, "setup.css"));
    await copyFileWithRetry(join(root, "src/popup/Popup.html"), join(output, "popup.html"));
    await copyFileWithRetry(join(root, "src/popup/Popup.css"), join(output, "popup.css"));
    await copyFileWithRetry(join(root, "src/content/styles/content.css"), join(output, "content.css"));
    await copyDirectoryWithRetry(join(root, "icons"), join(output, "icons"));
    await copyFileWithRetry(join(root, MTCUTE_WASM_SOURCE), join(output, MtcuteWasmFileName));
}

/**
 * Builds the Firefox manifest from the Chrome one.
 *
 * Firefox MV3 accepts `service_worker` from 121 onwards but still appreciates
 * the classic `scripts` declaration, and needs an explicit gecko id so the
 * extension keeps its identity across rebuilds.
 */
function buildFirefoxManifest() {
    const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));

    delete manifest.minimum_chrome_version;

    manifest.browser_specific_settings = {
        gecko: {
            id: "x-to-telegram@callmeteus.github",
            strict_min_version: "140.0",
            data_collection_permissions: { required: ["none"] }
        }
    };

    // Firefox MV3 accepts service_worker from 121 onwards; keep the classic
    // scripts declaration as well for broader compatibility.
    manifest.background = {
        service_worker: "background.js",
        scripts: ["background.js"]
    };

    return `${JSON.stringify(manifest, null, 4)}\n`;
}

async function writeFileWithRetry(destinationPath, content, maxAttempts = 5) {
    mkdirSync(dirname(destinationPath), { recursive: true });

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            writeFileSync(destinationPath, content);
            return;
        } catch (error) {
            if (attempt === maxAttempts || !isRetryableCopyError(error)) {
                throw error;
            }

            await sleep(50 * attempt);
        }
    }
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
        outdir: getDist(),
        format: "iife",
        target: currentTarget === "firefox" ? "firefox128" : "chrome120",
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

/**
 * Builds the Firefox extension into dist-firefox.
 */
export async function buildFirefoxExtension() {
    setBuildTarget("firefox");
    await buildExtension();
    setBuildTarget("chrome");
}
