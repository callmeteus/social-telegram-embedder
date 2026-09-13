import { describe, expect, it } from "vitest";
import {
    extractPostUrlFromActionBar,
    extractPostUrlFromElement,
    extractReelPostUrl,
    extractReelUrlFromVideoContainer,
    facebookPostUrlFromPage,
    facebookReelUrlFromVideoId,
    normalizeFacebookPostUrl
} from "../src/platforms/facebook/url/FacebookUrl";

describe("normalizeFacebookPostUrl", () => {
    it("strips Facebook tracking params from post links", () => {
        const raw = "https://www.facebook.com/user/posts/pfbid02ABC?__cft__[0]=x&__tn__=R-R";
        expect(normalizeFacebookPostUrl(raw)).toBe(
            "https://www.facebook.com/user/posts/pfbid02ABC"
        );
    });

    it("accepts photo permalinks", () => {
        expect(normalizeFacebookPostUrl(
            "https://www.facebook.com/photo/?fbid=123&set=a.456"
        )).toBe("https://www.facebook.com/photo/?fbid=123&set=a.456");
    });

    it("accepts reel permalinks", () => {
        expect(normalizeFacebookPostUrl(
            "https://www.facebook.com/reel/2483275915472051/?s=single_unit&__tn__=R-R"
        )).toBe("https://www.facebook.com/reel/2483275915472051/?s=single_unit");
    });

    it("returns null for non-post URLs", () => {
        expect(normalizeFacebookPostUrl("https://www.facebook.com/user")).toBeNull();
    });
});

describe("facebookPostUrlFromPage", () => {
    it("builds normalized URL from post page location", () => {
        const location = {
            href: "https://www.facebook.com/user/posts/pfbid02ABC?__tn__=R-R"
        } as Location;

        expect(facebookPostUrlFromPage(location)).toBe(
            "https://www.facebook.com/user/posts/pfbid02ABC"
        );
    });
});

describe("facebookReelUrlFromVideoId", () => {
    it("builds normalized reel URL from video id", () => {
        expect(facebookReelUrlFromVideoId("2483275915472051")).toBe(
            "https://www.facebook.com/reel/2483275915472051/"
        );
    });
});

describe("extractReelUrlFromVideoContainer", () => {
    it("extracts reel URL from data-video-id container", () => {
        document.body.innerHTML = `
            <div data-video-id="2483275915472051">
                <video poster="https://cdn.example/poster.jpg"></video>
            </div>
        `;

        const container = document.querySelector("div")!;
        expect(extractReelUrlFromVideoContainer(container)).toBe(
            "https://www.facebook.com/reel/2483275915472051/"
        );
    });
});

describe("extractPostUrlFromElement", () => {
    it("extracts post URL from permalink anchor", () => {
        document.body.innerHTML = `
            <div>
                <a href="/user/posts/pfbid02ABC?__tn__=R-R">2h</a>
            </div>
        `;

        const container = document.querySelector("div")!;
        expect(extractPostUrlFromElement(container)).toBe(
            "https://www.facebook.com/user/posts/pfbid02ABC"
        );
    });

    it("extracts reel URL from permalink anchor", () => {
        document.body.innerHTML = `
            <div>
                <a href="/reel/2483275915472051/?s=single_unit&__tn__=R-R">Reel</a>
            </div>
        `;

        const container = document.querySelector("div")!;
        expect(extractPostUrlFromElement(container)).toBe(
            "https://www.facebook.com/reel/2483275915472051/?s=single_unit"
        );
    });
});

describe("extractReelPostUrl", () => {
    it("builds reel URL from the scoped video container", () => {
        document.body.innerHTML = `
            <div data-video-id="2483275915472051">
                <video poster="https://cdn.example/poster.jpg"></video>
            </div>
        `;

        const container = document.querySelector("div")!;
        expect(extractReelPostUrl(container)).toBe(
            "https://www.facebook.com/reel/2483275915472051/"
        );
    });

    it("does not pick unrelated feed links outside the scoped container", () => {
        document.body.innerHTML = `
            <div class="reel-root" data-video-id="1758743321721989">
                <video></video>
            </div>
            <a href="/raisa.pereira.2025/posts/pfbid0WrongPost">feed behind</a>
        `;

        const snapshotRoot = document.querySelector(".reel-root")!;

        expect(extractReelPostUrl(snapshotRoot, {
            href: "https://www.facebook.com/reel/1758743321721989/"
        } as Location)).toBe("https://www.facebook.com/reel/1758743321721989/");
    });
});

describe("extractPostUrlFromActionBar", () => {
    it("walks up from action bar to find permalink", () => {
        document.body.innerHTML = `
            <div class="post">
                <a href="/user/posts/pfbid02XYZ">2h</a>
                <div class="actions">
                    <div data-ad-rendering-role="share_button"></div>
                </div>
            </div>
        `;

        const actionBar = document.querySelector(".actions")!;
        expect(extractPostUrlFromActionBar(actionBar)).toBe(
            "https://www.facebook.com/user/posts/pfbid02XYZ"
        );
    });
});
