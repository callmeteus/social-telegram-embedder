import webext from "playwright-webextext";
import { firefox } from "playwright";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const { withExtension } = webext;

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const profileDir = mkdtempSync(join(tmpdir(), "x2tg-firefox-smoke-"));
const EXTENSION_ID = "x-to-telegram@callmeteus.github";
const EXTENSION_UUID = "2975768f-5c9f-4941-86e9-c53dfb667d84";

const firefoxWithExtension = withExtension(firefox, join(root, "dist-firefox"));

const context = await firefoxWithExtension.launchPersistentContext(profileDir, {
    headless: false,
    firefoxUserPrefs: {
        "extensions.webextensions.uuids": JSON.stringify({
            [EXTENSION_ID]: EXTENSION_UUID
        }),
        "xpinstall.signatures.required": false,
        "extensions.autoDisableScopes": 0
    }
});

const errors = [];

// The add-on is installed over the remote debugging protocol after launch.
await new Promise((resolve) => setTimeout(resolve, 5000));

try {
    context.on("page", (page) => {
        page.on("pageerror", (err) => errors.push(String(err)));
        page.on("console", (msg) => {
            if (msg.type() === "error") errors.push(msg.text());
        });
    });

    const page = await context.newPage();

    // Instagram is in the manifest matches; the content script still runs on
    // the domain even when the user is logged out.
    await page.goto("https://www.instagram.com/", {
        waitUntil: "domcontentloaded",
        timeout: 30000
    });

    await page.waitForFunction(
        () => document.documentElement.getAttribute("data-x2tg-content-script") !== null,
        { timeout: 15000 }
    ).catch(() => undefined);

    const state = await page.evaluate(() => ({
        url: location.href,
        title: document.title,
        contentScript: document.documentElement.getAttribute("data-x2tg-content-script")
    }));

    console.log("Content script state:", JSON.stringify(state, null, 2));

    if (errors.length) {
        console.log("Console errors (first 10):", errors.slice(0, 10));
    }

    if (state.contentScript !== "firefox") {
        throw new Error(
            `Firefox content script did not run (marker=${state.contentScript ?? "none"})`
        );
    }

    console.log("Firefox smoke test passed: content script executed with browser.* bridge");
} finally {
    await context.close();
}
