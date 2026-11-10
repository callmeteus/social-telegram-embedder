import type { PickedDestination } from "../ui/picker/DestinationPicker";

/** Pause that blocks sending the same post to the same destinations twice in a row. */
export const SendDebounceMs = 3000;

/** A send queued in the service worker, waiting for its SEND_POST_DONE. */
export interface PendingSend {
    /** Key used by the resend debounce. */
    dedupeKey: string;
    /** Destinations with their labels, to describe the result. */
    destinations: PickedDestination[];
}

const pendingSends = new Map<string, PendingSend>();
const recentSends = new Map<string, number>();

/**
 * Remembers a queued send so the result pushed by the worker can be shown and debounced.
 */
export function registerPendingSend(requestId: string, send: PendingSend): void {
    pendingSends.set(requestId, send);
}

/**
 * Removes and returns the queued send for a request id (one result per send).
 */
export function takePendingSend(requestId: string): PendingSend | undefined {
    const send = pendingSends.get(requestId);

    pendingSends.delete(requestId);
    return send;
}

/**
 * Marks a send as just done, starting the resend debounce for that key.
 */
export function markRecentSend(dedupeKey: string): void {
    recentSends.set(dedupeKey, Date.now());
}

/**
 * True while sending the same post to the same destinations would be a duplicate.
 */
export function wasRecentlySent(dedupeKey: string): boolean {
    const lastSent = recentSends.get(dedupeKey) ?? 0;

    return Date.now() - lastSent < SendDebounceMs;
}

/**
 * Forgets queued and debounced sends (tests).
 */
export function resetPendingSends(): void {
    pendingSends.clear();
    recentSends.clear();
}
