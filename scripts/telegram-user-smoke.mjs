import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryStorage, TelegramClient, WebCryptoProvider } from "@mtcute/web";
import { root } from "./build-lib.mjs";

/**
 * Connects the same mtcute web client used by the extension to Telegram (test DCs by default)
 * and requests a QR login token, proving the api credentials and the WASM/WebSocket stack work.
 * Credentials come from telegram-api.local.json (gitignored). Pass --production to use production DCs.
 */
const credentials = JSON.parse(readFileSync(join(root, "telegram-api.local.json"), "utf8"));
const testMode = !process.argv.includes("--production");
// mtcute mishandles raw bytes as wasmInput (instantiate returns { module, instance }), so pass a compiled module.
const wasmModule = new WebAssembly.Module(readFileSync(join(root, "node_modules/@mtcute/wasm/mtcute-simd.wasm")));

const client = new TelegramClient({
    apiId: Number(credentials.apiId),
    apiHash: String(credentials.apiHash),
    storage: new MemoryStorage(),
    crypto: new WebCryptoProvider({ wasmInput: wasmModule }),
    testMode,
    network: {
        pingInterval: 20_000
    }
});

const abort = new AbortController();
const timeout = setTimeout(() => abort.abort(), 30_000);

try {
    await client.connect();
    console.log("[smoke] connected (testMode=%s)", testMode);

    const config = await client.call({ _: "help.getConfig" });
    console.log("[smoke] help.getConfig ok: this DC = %d, %d DC options", config.thisDc, config.dcOptions.length);

    await client.signInQr({
        abortSignal: abort.signal,
        onUrlUpdated(url, expires) {
            console.log("[smoke] QR login URL issued (prefix %s), expires %s", url.slice(0, 18), expires.toISOString());
            abort.abort();
        }
    }).catch((err) => {
        if (!abort.signal.aborted) {
            throw err;
        }
    });

    console.log("[smoke] OK");
} catch (err) {
    console.error("[smoke] failed: %O", err);
    process.exitCode = 1;
} finally {
    clearTimeout(timeout);
    await client.destroy();
}
