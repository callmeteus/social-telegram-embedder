import { isExtensionContextError, isExtensionContextValid } from "../../core/extension";
import type { SocialMediaInlineBlob, SocialPostSnapshot } from "../../platforms/types";

const STORAGE_PREFIX = "x2tg-inline-blob:";

/**
 * Moves inline media bytes to session storage so the runtime message stays small.
 */
export async function offloadSnapshotMediaBlobs(
    snapshot: SocialPostSnapshot,
    requestId: string
): Promise<SocialPostSnapshot> {
    const media = await Promise.all(snapshot.media.map(async (item, index) => {
        if (!item.inlineBlob) {
            return item;
        }

        if (!isExtensionContextValid()) {
            return item;
        }

        const storageKey = `${STORAGE_PREFIX}${requestId}:${index}`;

        try {
            await chrome.storage.session.set({
                [storageKey]: item.inlineBlob
            });
        } catch (err) {
            if (isExtensionContextError(err)) {
                return item;
            }

            throw err;
        }

        return {
            kind: item.kind,
            url: item.url,
            inlineBlobStorageKey: storageKey
        };
    }));

    return {
        ...snapshot,
        media
    };
}

/**
 * Restores offloaded inline media bytes in the service worker.
 */
export async function hydrateSnapshotMediaBlobs(
    snapshot: SocialPostSnapshot
): Promise<SocialPostSnapshot> {
    const media = await Promise.all(snapshot.media.map(async (item) => {
        if (item.inlineBlob || !item.inlineBlobStorageKey) {
            return item;
        }

        const stored = await chrome.storage.session.get(item.inlineBlobStorageKey);
        const inlineBlob = stored[item.inlineBlobStorageKey] as SocialMediaInlineBlob | undefined;

        if (inlineBlob) {
            await chrome.storage.session.remove(item.inlineBlobStorageKey);
        }

        return {
            ...item,
            inlineBlob,
            inlineBlobStorageKey: undefined
        };
    }));

    return {
        ...snapshot,
        media
    };
}
