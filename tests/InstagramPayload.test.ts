import { describe, expect, it, vi } from "vitest";
import { buildInstagramLinkOnlyPost } from "../src/platforms/instagram/api/InstagramPost";
import { resolveInstagramMedia } from "../src/platforms/instagram/content/InstagramMedia";
import {
    buildInstagramSnapshot,
    extractInstagramAuthorHandle,
    extractInstagramCaptionText,
    extractInstagramMedia,
    extractInstagramPostUrl
} from "../src/platforms/instagram/content/PostDom";
import { snapshotToFetchedPost } from "../src/platforms/types";

const postUrl = "https://www.instagram.com/p/ABC123def45/";

const photoPostMarkup = `
    <article>
        <header><a href="/traveler">traveler</a></header>
        <img class="avatar" src="https://scontent-abc.cdninstagram.com/avatar.jpg" width="40">
        <img src="https://scontent-abc.cdninstagram.com/v/photo1.jpg?stp=dst-jpg">
        <img src="https://scontent-abc.fbcdn.net/v/photo2.jpg">
        <img src="https://scontent-abc.cdninstagram.com/v/photo1.jpg?stp=dst-jpg">
        <a href="/p/ABC123def45/?igshid=1">permalink</a>
        <div dir="auto"><span class="x193iq5w">Chasing light in the city.</span></div>
        <div dir="auto">Like</div>
    </article>
`;

describe("Instagram page extraction", () => {
    it("reads the caption, author and canonical post URL from the post container", () => {
        document.body.innerHTML = photoPostMarkup;
        const article = document.querySelector("article");

        if (!article) {
            throw new Error("post fixture is missing");
        }

        expect(extractInstagramCaptionText(article)).toBe("Chasing light in the city.");
        expect(extractInstagramAuthorHandle(article)).toBe("traveler");
        expect(extractInstagramPostUrl(article)).toBe(postUrl);
    });

    it("prefers the real caption span and ignores interface chrome", () => {
        document.body.innerHTML = `
            <article>
                <header><a href="/traveler">traveler</a></header>
                <span class="x193iq5w">Sugestões para vocêÁudio originalSugestões para você</span>
                <span class="x193iq5w">Curtido por fã e outras 2 pessoas</span>
                <span class="x193iq5w">outras 2 pessoas</span>
                <span class="_ap3a _aaco _aacu _aacx _aad7 _aade">A real caption here.</span>
            </article>
        `;
        const article = document.querySelector("article");

        if (!article) {
            throw new Error("post fixture is missing");
        }

        expect(extractInstagramCaptionText(article)).toBe("A real caption here.");
    });

    it("omits the author name when a carousel post has no caption", () => {
        document.body.innerHTML = `
            <article>
                <header><a href="/traveler">traveler</a></header>
                <span class="x193iq5w">traveler</span>
                <span class="x193iq5w">Curtido por fã e outras 2 pessoas</span>
                <span class="x193iq5w">outras 2 pessoas</span>
            </article>
        `;
        const article = document.querySelector("article");

        if (!article) {
            throw new Error("post fixture is missing");
        }

        expect(extractInstagramCaptionText(article)).toBe("");
    });

    it("maps a photo carousel in display order and skips avatars and duplicates", () => {
        document.body.innerHTML = photoPostMarkup;
        const article = document.querySelector("article");

        if (!article) {
            throw new Error("post fixture is missing");
        }

        expect(extractInstagramMedia(article)).toEqual([
            {
                kind: "photo",
                url: "https://scontent-abc.cdninstagram.com/v/photo1.jpg?stp=dst-jpg"
            },
            {
                kind: "photo",
                url: "https://scontent-abc.fbcdn.net/v/photo2.jpg"
            }
        ]);
    });

    it("maps a reel to video media and drops the video poster image", () => {
        document.body.innerHTML = `
            <article>
                <img src="https://scontent-abc.cdninstagram.com/v/poster.jpg">
                <video poster="https://scontent-abc.cdninstagram.com/v/poster.jpg"
                       src="https://scontent-abc.cdninstagram.com/v/clip.mp4"></video>
            </article>
        `;
        const article = document.querySelector("article");

        if (!article) {
            throw new Error("reel fixture is missing");
        }

        expect(extractInstagramMedia(article)).toEqual([
            {
                kind: "video",
                url: "https://scontent-abc.cdninstagram.com/v/clip.mp4"
            }
        ]);
    });

    it("returns an empty snapshot behind a login wall", () => {
        document.body.innerHTML = `
            <article>
                <div>Log in to see photos and videos from your friends.</div>
            </article>
        `;
        const article = document.querySelector("article");

        if (!article) {
            throw new Error("login wall fixture is missing");
        }

        expect(buildInstagramSnapshot(article, postUrl)).toEqual({
            text: "",
            media: []
        });
    });

    it("maps a captured snapshot to the cross-platform post payload", () => {
        document.body.innerHTML = photoPostMarkup;
        const article = document.querySelector("article");

        if (!article) {
            throw new Error("post fixture is missing");
        }

        const fetched = snapshotToFetchedPost(postUrl, buildInstagramSnapshot(article, postUrl));

        expect(fetched.embedUrl).toBe(postUrl);
        expect(fetched.sourceUrl).toBe(postUrl);
        expect(fetched.text).toBe("@<b>traveler</b>\n\nChasing light in the city.");
        expect(fetched.media).toHaveLength(2);
    });
});

describe("buildInstagramLinkOnlyPost", () => {
    it("keeps the source link when the page media cannot be resolved", () => {
        expect(buildInstagramLinkOnlyPost(postUrl)).toEqual({
            embedUrl: postUrl,
            sourceUrl: postUrl,
            text: "",
            media: []
        });
    });
});

describe("resolveInstagramMedia", () => {
    it("keeps direct CDN URLs and inlines readable blob videos", async () => {
        const blob = {
            size: 5000,
            type: "video/mp4",
            arrayBuffer: async () => new Uint8Array(5000).buffer
        };
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            blob: async () => blob
        });
        vi.stubGlobal("fetch", fetchMock);

        try {
            const resolved = await resolveInstagramMedia([
                {
                    kind: "video",
                    url: "https://scontent-abc.cdninstagram.com/v/clip.mp4"
                },
                {
                    kind: "video",
                    url: "blob:https://www.instagram.com/1234"
                }
            ]);

            expect(resolved[0]).toEqual({
                kind: "video",
                url: "https://scontent-abc.cdninstagram.com/v/clip.mp4"
            });
            expect(resolved[1]?.inlineBlob?.mimeType).toBe("video/mp4");
            expect(resolved[1]?.inlineBlob?.base64.length).toBeGreaterThan(0);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("drops blob videos that cannot be read", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("blob expired")));

        try {
            expect(await resolveInstagramMedia([
                {
                    kind: "video",
                    url: "blob:https://www.instagram.com/expired"
                }
            ])).toEqual([]);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
