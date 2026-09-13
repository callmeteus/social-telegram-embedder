import { describe, expect, it, vi } from "vitest";
import {
    hydrateSnapshotMediaBlobs,
    offloadSnapshotMediaBlobs
} from "../src/content/media/BlobSnapshotTransfer";
import type { SocialPostSnapshot } from "../src/platforms/types";

describe("BlobSnapshotTransfer", () => {
    it("offloads inline blobs to session storage and hydrates them in the service worker", async () => {
        const snapshot: SocialPostSnapshot = {
            text: "caption",
            media: [
                {
                    kind: "video",
                    url: "blob:https://www.facebook.com/test",
                    inlineBlob: {
                        base64: "ZGF0YQ==",
                        mimeType: "video/mp4"
                    }
                }
            ]
        };

        vi.stubGlobal("chrome", {
            runtime: {
                id: "test-extension-id"
            },
            storage: {
                session: {
                    data: {} as Record<string, unknown>,
                    async set(values: Record<string, unknown>) {
                        Object.assign(this.data, values);
                    },
                    async get(key: string) {
                        return {
                            [key]: this.data[key]
                        };
                    },
                    async remove(key: string) {
                        delete this.data[key];
                    }
                }
            }
        });

        const offloaded = await offloadSnapshotMediaBlobs(snapshot, "req-1");

        expect(offloaded.media[0]?.inlineBlob).toBeUndefined();
        expect(offloaded.media[0]?.inlineBlobStorageKey).toContain("req-1");

        const hydrated = await hydrateSnapshotMediaBlobs(offloaded);

        expect(hydrated.media[0]?.inlineBlob).toEqual({
            base64: "ZGF0YQ==",
            mimeType: "video/mp4"
        });
        expect(hydrated.media[0]?.inlineBlobStorageKey).toBeUndefined();
    });
});
