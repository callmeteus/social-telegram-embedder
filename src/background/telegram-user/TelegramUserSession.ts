import { parseTelegramApiCredentials, type TelegramApiCredentials } from "../../core/telegram-user/Credentials";
import {
    classifyTelegramUserError,
    isPasswordNeededError,
    isSessionRevokedError
} from "../../core/telegram-user/Errors";
import {
    TelegramUserErrorCode,
    TelegramUserSessionState,
    type TelegramUserAccount,
    type TelegramUserError,
    type TelegramUserSessionSnapshot
} from "../../core/telegram-user/SessionTypes";
import type { TelegramUserClient } from "../../core/telegram-user/TelegramUserClient";

/** Default time without open pickers or sends before the connection is closed. */
const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

/** Cached account flag persisted in synced config (no secrets). */
export interface TelegramUserAccountCache {
    enabled: boolean;
    displayName: string;
    accountId?: number;
}

/** Side effects the session needs; injected so the state machine is testable. */
export interface TelegramUserSessionDeps {
    /** The account connection this session belongs to. */
    connectionId: string;
    createClient(credentials: TelegramApiCredentials): TelegramUserClient;
    loadCredentials(): Promise<TelegramApiCredentials | null>;
    saveCredentials(credentials: TelegramApiCredentials): Promise<void>;
    /** Deletes the local session database (auth key, peer cache). */
    wipeSessionStorage(): Promise<void>;
    loadAccountCache(): Promise<TelegramUserAccountCache>;
    saveAccountCache(cache: TelegramUserAccountCache): Promise<void>;
    /** True when another connection on this device is already logged in as this account. */
    isAccountConnectedElsewhere?(accountId: number): Promise<boolean>;
    idleTimeoutMs?: number;
}

/** Thrown by {@link TelegramUserSession.getClient} when no usable connection exists. */
export class TelegramUserSessionError extends Error {
    public readonly error: TelegramUserError;

    public constructor(error: TelegramUserError) {
        super(`[telegram-user] ${error.code}`);
        this.error = error;
    }
}

type SessionListener = (snapshot: TelegramUserSessionSnapshot) => void;

/**
 * Owns the Telegram user client of one account connection: login flows, lazy connect,
 * idle disconnect, logout and revoked-session handling.
 */
export class TelegramUserSession {
    /** The account connection this session belongs to. */
    public readonly connectionId: string;
    private readonly deps: TelegramUserSessionDeps;
    private readonly idleTimeoutMs: number;
    private readonly listeners = new Set<SessionListener>();
    private snapshot: TelegramUserSessionSnapshot = { state: TelegramUserSessionState.LOGGED_OUT, hasCredentials: false };
    private credentials: TelegramApiCredentials | null = null;
    private loggedIn = false;
    private client: TelegramUserClient | null = null;
    private connecting: Promise<TelegramUserClient> | null = null;
    private clientCleanups: (() => void)[] = [];
    private initializing: Promise<void> | null = null;
    private loginAbort: AbortController | null = null;
    private releaseLoginHold: (() => void) | null = null;
    private pendingPassword: { resolve(password: string): void; reject(err: Error): void } | null = null;
    private passwordMode: "qr" | "phone" | null = null;
    private phoneLogin: { phone: string; phoneCodeHash: string } | null = null;
    private holds = 0;
    private idleTimer: ReturnType<typeof setTimeout> | null = null;

    public constructor(deps: TelegramUserSessionDeps) {
        this.connectionId = deps.connectionId;
        this.deps = deps;
        this.idleTimeoutMs = deps.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    }

    /**
     * Restores the logged-in flag and credentials from storage without connecting. Idempotent.
     */
    public initialize(): Promise<void> {
        this.initializing ??= (async () => {
            const [credentials, cache] = await Promise.all([this.deps.loadCredentials(), this.deps.loadAccountCache()]);

            this.credentials = credentials;
            this.loggedIn = Boolean(credentials && cache.enabled);

            this.setSnapshot({
                state: this.loggedIn ? TelegramUserSessionState.READY : TelegramUserSessionState.LOGGED_OUT,
                hasCredentials: Boolean(credentials),
                account: this.loggedIn ? { id: cache.accountId ?? 0, displayName: cache.displayName } : undefined
            });
        })();

        return this.initializing;
    }

    /** Current snapshot (no secrets). */
    public getSnapshot(): TelegramUserSessionSnapshot {
        return this.snapshot;
    }

    /** True when an account is logged in on this device, connected or not. */
    public isLoggedIn(): boolean {
        return this.loggedIn;
    }

    /**
     * Subscribes to snapshot changes; the listener is called right away with the current one.
     */
    public subscribe(listener: SessionListener): () => void {
        this.listeners.add(listener);
        listener(this.snapshot);

        return () => {
            this.listeners.delete(listener);
        };
    }

    /**
     * Keeps the connection open until the returned release function is called.
     */
    public acquire(): () => void {
        this.holds++;
        this.clearIdleTimer();

        let released = false;

        return () => {
            if (released) {
                return;
            }

            released = true;
            this.holds = Math.max(0, this.holds - 1);
            this.scheduleIdleDisconnect();
        };
    }

    /**
     * Validates and stores app credentials. Refused while logged in or during a login.
     */
    public async saveCredentials(rawApiId: string, rawApiHash: string): Promise<void> {
        await this.initialize();

        if (this.loggedIn || this.isLoginInProgress()) {
            this.setError({ code: TelegramUserErrorCode.CREDENTIALS_LOCKED });
            return;
        }

        const parsed = parseTelegramApiCredentials(rawApiId, rawApiHash);

        if (!parsed.ok) {
            this.setError({ code: TelegramUserErrorCode.INVALID_CREDENTIALS_FORMAT });
            return;
        }

        await this.deps.saveCredentials(parsed.credentials);
        this.credentials = parsed.credentials;
        console.debug("[telegram-user] app credentials saved");
        this.setSnapshot({ state: TelegramUserSessionState.LOGGED_OUT, hasCredentials: true });
    }

    /**
     * Starts the QR login flow; QR URLs and 2FA prompts arrive through snapshots.
     */
    public async startQrLogin(): Promise<void> {
        const client = await this.beginLogin();

        if (!client) {
            return;
        }

        const signal = this.loginAbort?.signal ?? new AbortController().signal;

        try {
            const account = await client.signInQr({
                signal,

                onUrl: (url, expiresAt) => {
                    this.setSnapshot({
                        state: TelegramUserSessionState.AWAITING_QR,
                        hasCredentials: true,
                        qr: { url, expiresAt: expiresAt.getTime(), scanned: false }
                    });
                },

                onScanned: () => {
                    if (this.snapshot.qr) {
                        this.setSnapshot({ ...this.snapshot, qr: { ...this.snapshot.qr, scanned: true } });
                    }
                },

                password: () => this.waitForQrPassword(client),

                onInvalidPassword: () => {
                    this.setSnapshot({ ...this.snapshot, error: { code: TelegramUserErrorCode.WRONG_PASSWORD } });
                }
            });

            await this.completeLogin(client, account);
        } catch (err) {
            if (signal.aborted) {
                return;
            }

            await this.failLogin(err);
        }
    }

    /**
     * Starts the phone number login flow by requesting a code.
     */
    public async startPhoneLogin(rawPhone: string): Promise<void> {
        const phone = rawPhone.replace(/[^\d+]/g, "");

        if (phone.replace(/\D/g, "").length < 6) {
            this.setError({ code: TelegramUserErrorCode.INVALID_PHONE });
            return;
        }

        const client = await this.beginLogin();

        if (!client) {
            return;
        }

        try {
            const sent = await client.sendCode(phone);

            if ("account" in sent) {
                await this.completeLogin(client, sent.account);
                return;
            }

            this.phoneLogin = { phone, phoneCodeHash: sent.phoneCodeHash };
            this.setSnapshot({ state: TelegramUserSessionState.AWAITING_CODE, hasCredentials: true });
        } catch (err) {
            await this.failLogin(err);
        }
    }

    /**
     * Submits the code received in Telegram (phone flow).
     */
    public async submitCode(code: string): Promise<void> {
        const client = this.client;
        const phoneLogin = this.phoneLogin;

        if (!client || !phoneLogin || this.snapshot.state !== TelegramUserSessionState.AWAITING_CODE) {
            return;
        }

        try {
            const account = await client.signIn(phoneLogin.phone, phoneLogin.phoneCodeHash, code.trim());
            await this.completeLogin(client, account);
        } catch (err) {
            if (isPasswordNeededError(err)) {
                await this.promptPassword(client, "phone");
                return;
            }

            const error = classifyTelegramUserError(err);

            if (error.code === TelegramUserErrorCode.WRONG_CODE) {
                this.setSnapshot({ ...this.snapshot, error });
                return;
            }

            await this.failLogin(err);
        }
    }

    /**
     * Submits the 2FA password for either login flow.
     */
    public async submitPassword(password: string): Promise<void> {
        if (this.snapshot.state !== TelegramUserSessionState.AWAITING_PASSWORD) {
            return;
        }

        if (this.passwordMode === "qr" && this.pendingPassword) {
            const pending = this.pendingPassword;
            this.pendingPassword = null;
            this.setSnapshot({ ...this.snapshot, error: undefined });
            pending.resolve(password);
            return;
        }

        const client = this.client;

        if (this.passwordMode !== "phone" || !client) {
            return;
        }

        try {
            const account = await client.checkPassword(password);
            await this.completeLogin(client, account);
        } catch (err) {
            const error = classifyTelegramUserError(err);

            if (error.code === TelegramUserErrorCode.WRONG_PASSWORD) {
                this.setSnapshot({ ...this.snapshot, error });
                return;
            }

            await this.failLogin(err);
        }
    }

    /**
     * Aborts any login in progress and returns to the logged-out state.
     */
    public async cancelLogin(): Promise<void> {
        if (!this.isLoginInProgress()) {
            return;
        }

        console.debug("[telegram-user] login cancelled");
        this.resetLoginFlow();
        await this.dropClient();
        this.setSnapshot({ state: TelegramUserSessionState.LOGGED_OUT, hasCredentials: Boolean(this.credentials) });
    }

    /**
     * Revokes the session on the server (best effort) and wipes local session data.
     */
    public async logout(): Promise<void> {
        await this.initialize();

        const release = this.acquire();

        try {
            this.resetLoginFlow();

            if (this.loggedIn && this.credentials) {
                const client = this.client ?? this.deps.createClient(this.credentials);

                this.client = client;

                try {
                    await client.connect();
                    await client.logOut();
                    console.debug("[telegram-user] session revoked on server");
                } catch (err) {
                    console.debug("[telegram-user] server logout failed, wiping locally: %O", err);
                }
            }

            await this.endSession();
            this.setSnapshot({ state: TelegramUserSessionState.LOGGED_OUT, hasCredentials: Boolean(this.credentials) });
        } finally {
            release();
        }
    }

    /**
     * Stops any login and deletes local session data of a session that is not logged in.
     */
    public async discardLocalData(): Promise<void> {
        if (this.loggedIn) {
            return;
        }

        this.resetLoginFlow();
        await this.dropClient();
        await this.deps.wipeSessionStorage().catch((err: unknown) => {
            console.error("[telegram-user] failed to wipe session storage: %O", err);
        });
    }

    /**
     * Returns a connected client for the logged-in account, connecting lazily.
     * Throws {@link TelegramUserSessionError} when logged out or the connection fails.
     */
    public async getClient(): Promise<TelegramUserClient> {
        await this.initialize();

        if (!this.loggedIn || !this.credentials) {
            throw new TelegramUserSessionError({ code: TelegramUserErrorCode.NOT_CONNECTED });
        }

        if (this.client && !this.connecting) {
            return this.client;
        }

        this.connecting ??= this.connectLoggedIn(this.credentials).finally(() => {
            this.connecting = null;
        });

        return this.connecting;
    }

    private async connectLoggedIn(credentials: TelegramApiCredentials): Promise<TelegramUserClient> {
        const previous = this.snapshot;
        const client = this.deps.createClient(credentials);

        this.client = client;
        this.setSnapshot({ ...previous, state: TelegramUserSessionState.CONNECTING, error: undefined });
        console.debug("[telegram-user] connecting");

        try {
            await client.connect();

            const account = await client.getAuthorizedAccount();

            if (!account) {
                await this.handleSessionRevoked();
                throw new TelegramUserSessionError({ code: TelegramUserErrorCode.SESSION_REVOKED });
            }

            if (!previous.account?.id) {
                // Accounts migrated from a single-account config learn their Telegram id here.
                await this.deps.saveAccountCache({ enabled: true, displayName: account.displayName, accountId: account.id });
            }

            await this.attachReadyClient(client, account);
            this.scheduleIdleDisconnect();
            return client;
        } catch (err) {
            if (err instanceof TelegramUserSessionError) {
                throw err;
            }

            if (isSessionRevokedError(err)) {
                await this.handleSessionRevoked();
                throw new TelegramUserSessionError({ code: TelegramUserErrorCode.SESSION_REVOKED });
            }

            const error = classifyTelegramUserError(err);

            console.debug("[telegram-user] connect failed: %O", err);
            await this.dropClient();
            this.setSnapshot({ ...previous, state: TelegramUserSessionState.ERROR, error });
            throw new TelegramUserSessionError(error);
        }
    }

    private async beginLogin(): Promise<TelegramUserClient | null> {
        await this.initialize();

        if (!this.credentials) {
            this.setError({ code: TelegramUserErrorCode.MISSING_CREDENTIALS });
            return null;
        }

        if (this.loggedIn) {
            return null;
        }

        this.resetLoginFlow();
        await this.dropClient();

        this.loginAbort = new AbortController();
        this.releaseLoginHold = this.acquire();

        const client = this.deps.createClient(this.credentials);

        this.client = client;
        this.setSnapshot({ state: TelegramUserSessionState.CONNECTING, hasCredentials: true });
        console.debug("[telegram-user] login started");

        try {
            await client.connect();
            return client;
        } catch (err) {
            await this.failLogin(err);
            return null;
        }
    }

    private waitForQrPassword(client: TelegramUserClient): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            this.pendingPassword = { resolve, reject };
            void this.promptPassword(client, "qr");
        });
    }

    private async promptPassword(client: TelegramUserClient, mode: "qr" | "phone"): Promise<void> {
        const keepError = this.snapshot.state === TelegramUserSessionState.AWAITING_PASSWORD ? this.snapshot.error : undefined;
        let passwordHint = this.snapshot.passwordHint;

        this.passwordMode = mode;

        if (passwordHint === undefined) {
            passwordHint = await client.getPasswordHint().catch(() => null) ?? undefined;
        }

        console.debug("[telegram-user] waiting for 2FA password (%s flow)", mode);
        this.setSnapshot({
            state: TelegramUserSessionState.AWAITING_PASSWORD,
            hasCredentials: true,
            passwordHint,
            error: keepError
        });
    }

    private async completeLogin(client: TelegramUserClient, account: TelegramUserAccount): Promise<void> {
        if (await this.deps.isAccountConnectedElsewhere?.(account.id)) {
            await this.refuseDuplicateAccount(client);
            return;
        }

        this.loggedIn = true;
        this.resetLoginFlow();
        await this.deps.saveAccountCache({ enabled: true, displayName: account.displayName, accountId: account.id });
        await this.attachReadyClient(client, account);
        console.debug("[telegram-user] logged in");
        this.scheduleIdleDisconnect();
    }

    private async attachReadyClient(client: TelegramUserClient, account: TelegramUserAccount): Promise<void> {
        this.clearClientListeners();
        this.clientCleanups.push(client.onSessionRevoked(() => {
            void this.handleSessionRevoked();
        }));

        this.setSnapshot({ state: TelegramUserSessionState.READY, hasCredentials: true, account });

        await client.startUpdates().catch((err: unknown) => {
            console.debug("[telegram-user] updates loop failed to start: %O", err);
        });
    }

    /** Signs the extra session out so the account is not logged in twice on this device. */
    private async refuseDuplicateAccount(client: TelegramUserClient): Promise<void> {
        console.debug("[telegram-user] account already connected on another connection, signing out the new session");
        this.resetLoginFlow();

        await client.logOut().catch((err: unknown) => {
            console.debug("[telegram-user] duplicate session logout failed: %O", err);
        });
        await this.dropClient();
        await this.deps.wipeSessionStorage().catch((err: unknown) => {
            console.error("[telegram-user] failed to wipe session storage: %O", err);
        });

        this.setSnapshot({
            state: TelegramUserSessionState.LOGGED_OUT,
            hasCredentials: Boolean(this.credentials),
            error: { code: TelegramUserErrorCode.ACCOUNT_ALREADY_CONNECTED }
        });
    }

    private async failLogin(err: unknown): Promise<void> {
        const error = classifyTelegramUserError(err);

        console.debug("[telegram-user] login failed: %O", err);
        this.resetLoginFlow();
        await this.dropClient();
        this.setSnapshot({ state: TelegramUserSessionState.LOGGED_OUT, hasCredentials: Boolean(this.credentials), error });
    }

    private async handleSessionRevoked(): Promise<void> {
        if (!this.loggedIn) {
            return;
        }

        console.debug("[telegram-user] session revoked");
        await this.endSession();
        this.setSnapshot({
            state: TelegramUserSessionState.LOGGED_OUT,
            hasCredentials: Boolean(this.credentials),
            error: { code: TelegramUserErrorCode.SESSION_REVOKED }
        });
    }

    private async endSession(): Promise<void> {
        this.loggedIn = false;
        await this.dropClient();
        await this.deps.wipeSessionStorage().catch((err: unknown) => {
            console.error("[telegram-user] failed to wipe session storage: %O", err);
        });
        await this.deps.saveAccountCache({ enabled: false, displayName: "" });
    }

    private resetLoginFlow(): void {
        this.loginAbort?.abort();
        this.loginAbort = null;
        this.pendingPassword?.reject(new Error("[telegram-user] login cancelled"));
        this.pendingPassword = null;
        this.passwordMode = null;
        this.phoneLogin = null;
        this.releaseLoginHold?.();
        this.releaseLoginHold = null;
    }

    private isLoginInProgress(): boolean {
        return this.loginAbort !== null
            || this.snapshot.state === TelegramUserSessionState.AWAITING_QR
            || this.snapshot.state === TelegramUserSessionState.AWAITING_CODE
            || this.snapshot.state === TelegramUserSessionState.AWAITING_PASSWORD;
    }

    private async dropClient(): Promise<void> {
        const client = this.client;

        this.clearClientListeners();
        this.client = null;

        if (client) {
            await client.destroy().catch((err: unknown) => {
                console.debug("[telegram-user] client destroy failed: %O", err);
            });
        }
    }

    private clearClientListeners(): void {
        for (const cleanup of this.clientCleanups) {
            cleanup();
        }

        this.clientCleanups = [];
    }

    private scheduleIdleDisconnect(): void {
        this.clearIdleTimer();

        if (this.holds > 0 || !this.client || !this.loggedIn) {
            return;
        }

        this.idleTimer = setTimeout(() => {
            this.idleTimer = null;

            if (this.holds > 0 || !this.loggedIn) {
                return;
            }

            console.debug("[telegram-user] idle, disconnecting");
            void this.dropClient();
        }, this.idleTimeoutMs);
    }

    private clearIdleTimer(): void {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
    }

    private setError(error: TelegramUserError): void {
        this.setSnapshot({ ...this.snapshot, error });
    }

    private setSnapshot(snapshot: TelegramUserSessionSnapshot): void {
        if (snapshot.state !== this.snapshot.state) {
            console.debug("[telegram-user] state %s -> %s", this.snapshot.state, snapshot.state);
        }

        this.snapshot = snapshot;

        for (const listener of this.listeners) {
            listener(snapshot);
        }
    }
}
