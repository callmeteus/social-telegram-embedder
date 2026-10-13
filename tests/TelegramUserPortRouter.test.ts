import { describe, expect, it, vi } from "vitest";
import { routeTelegramUserPort } from "../src/background/telegram-user/PortRouter";
import { TelegramUserSessionRegistry } from "../src/background/telegram-user/TelegramUserSessionRegistry";
import { buildTelegramUserPortName, TelegramUserPortName } from "../src/core/telegram-user/PortProtocol";
import { createFakePort } from "./helpers/FakePort";
import { createSessionHarness, type SessionHarness } from "./helpers/SessionHarness";

const ExtensionId = "ext-id";
const OptionsUrl = `chrome-extension://${ExtensionId}/options.html`;

function createRegistry(loggedIn: Record<string, boolean> = {}): { sessions: TelegramUserSessionRegistry; harnesses: Map<string, SessionHarness> } {
    const harnesses = new Map<string, SessionHarness>();
    const sessions = new TelegramUserSessionRegistry((connectionId) => {
        const harness = createSessionHarness({ connectionId, loggedIn: loggedIn[connectionId] ?? false });

        harnesses.set(connectionId, harness);
        return harness.session;
    });

    return { sessions, harnesses };
}

const authPort = (connectionId: string): string => buildTelegramUserPortName(TelegramUserPortName.AUTH, connectionId);
const dialogsPort = (connectionId: string): string => buildTelegramUserPortName(TelegramUserPortName.DIALOGS, connectionId);

describe("routeTelegramUserPort", () => {
    it("drops ports from other extensions", () => {
        const { sessions } = createRegistry();
        const fake = createFakePort(dialogsPort("acc"), { id: "evil", url: "https://x.com/" });

        expect(routeTelegramUserPort(fake.port, sessions, ExtensionId)).toBe(false);
        expect(fake.port.disconnect).toHaveBeenCalled();
    });

    it("refuses the login port from a content script on a web page", () => {
        const { sessions } = createRegistry();
        const fake = createFakePort(authPort("acc"), { id: ExtensionId, url: "https://x.com/home" });

        expect(routeTelegramUserPort(fake.port, sessions, ExtensionId)).toBe(false);
        expect(fake.port.disconnect).toHaveBeenCalled();
    });

    it("refuses ports without a valid connection id", () => {
        const { sessions, harnesses } = createRegistry();
        const fake = createFakePort(`${TelegramUserPortName.DIALOGS}:../evil`, { id: ExtensionId, url: "https://x.com/home" });

        expect(routeTelegramUserPort(fake.port, sessions, ExtensionId)).toBe(false);
        expect(fake.port.disconnect).toHaveBeenCalled();
        expect(harnesses.size).toBe(0);
    });

    it("accepts the login port from the options page and the dialogs port from content scripts", async () => {
        const { sessions } = createRegistry();
        const auth = createFakePort(authPort("acc"), { id: ExtensionId, url: OptionsUrl });
        const dialogs = createFakePort(dialogsPort("acc"), { id: ExtensionId, url: "https://x.com/home" });

        expect(routeTelegramUserPort(auth.port, sessions, ExtensionId)).toBe(true);
        expect(routeTelegramUserPort(dialogs.port, sessions, ExtensionId)).toBe(true);

        await vi.waitFor(() => {
            expect(auth.posted).toHaveLength(1);
            expect(dialogs.posted.length).toBeGreaterThan(0);
        });
        auth.remoteDisconnect();
        dialogs.remoteDisconnect();
    });

    it("gives each connection its own session", () => {
        const { sessions, harnesses } = createRegistry();

        routeTelegramUserPort(createFakePort(dialogsPort("acc"), { id: ExtensionId, url: "https://x.com/" }).port, sessions, ExtensionId);
        routeTelegramUserPort(createFakePort(dialogsPort("acc-2"), { id: ExtensionId, url: "https://x.com/" }).port, sessions, ExtensionId);
        routeTelegramUserPort(createFakePort(dialogsPort("acc"), { id: ExtensionId, url: "https://x.com/" }).port, sessions, ExtensionId);

        expect(Array.from(harnesses.keys())).toEqual(["acc", "acc-2"]);
        expect(sessions.get("acc")).not.toBe(sessions.get("acc-2"));
    });

    it("discards an unfinished login when its last login port closes, but keeps a logged-in account", async () => {
        const { sessions, harnesses } = createRegistry({ "acc-old": true });
        const fresh = createFakePort(authPort("acc-new"), { id: ExtensionId, url: OptionsUrl });
        const existing = createFakePort(authPort("acc-old"), { id: ExtensionId, url: OptionsUrl });

        routeTelegramUserPort(fresh.port, sessions, ExtensionId);
        routeTelegramUserPort(existing.port, sessions, ExtensionId);
        await vi.waitFor(() => expect(fresh.posted.length + existing.posted.length).toBeGreaterThan(1));

        const freshSession = sessions.get("acc-new");
        const oldSession = sessions.get("acc-old");

        fresh.remoteDisconnect();
        existing.remoteDisconnect();

        await vi.waitFor(() => expect(harnesses.get("acc-new")?.wipeSessionStorage).toHaveBeenCalled());
        expect(sessions.get("acc-new")).not.toBe(freshSession);
        expect(sessions.get("acc-old")).toBe(oldSession);
        expect(harnesses.get("acc-old")?.wipeSessionStorage).not.toHaveBeenCalled();
    });

    it("ignores unrelated port names", () => {
        const { sessions } = createRegistry();
        const fake = createFakePort("something-else", { id: ExtensionId, url: OptionsUrl });

        expect(routeTelegramUserPort(fake.port, sessions, ExtensionId)).toBe(false);
        expect(fake.port.disconnect).not.toHaveBeenCalled();
    });
});
