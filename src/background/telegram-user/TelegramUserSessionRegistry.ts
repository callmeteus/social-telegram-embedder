import type { TelegramUserSession } from "./TelegramUserSession";

/**
 * One {@link TelegramUserSession} per account connection, created on first use and kept for
 * the worker lifetime. Sessions of logins that never finished are dropped with their storage.
 */
export class TelegramUserSessionRegistry {
    private readonly sessions = new Map<string, TelegramUserSession>();
    private readonly createSession: (connectionId: string) => TelegramUserSession;

    public constructor(createSession: (connectionId: string) => TelegramUserSession) {
        this.createSession = createSession;
    }

    /**
     * Returns the session of an account connection, creating it when needed.
     */
    public get(connectionId: string): TelegramUserSession {
        let session = this.sessions.get(connectionId);

        if (!session) {
            session = this.createSession(connectionId);
            this.sessions.set(connectionId, session);
        }

        return session;
    }

    /**
     * Forgets a session that is not logged in (an abandoned "add account" attempt) and wipes
     * whatever its login left on disk. Logged-in sessions are kept.
     */
    public async discardIfLoggedOut(connectionId: string): Promise<void> {
        const session = this.sessions.get(connectionId);

        if (!session) {
            return;
        }

        await session.initialize();

        if (session.isLoggedIn()) {
            return;
        }

        this.sessions.delete(connectionId);
        console.debug("[telegram-user] discarding unfinished account %s", connectionId);
        await session.discardLocalData();
    }
}
