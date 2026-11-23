import { describe, expect, it } from "vitest";
import { getPlatformSiteForUrl } from "../src/platforms/site";
import { SocialPlatformId } from "../src/platforms/types";
import { resolvePopupStatus } from "../src/popup/SiteStatus";

describe("getPlatformSiteForUrl", () => {
    it("recognizes the X and Twitter hosts from the platform manifest", () => {
        expect(getPlatformSiteForUrl("https://x.com/i/status/1")?.id).toBe(SocialPlatformId.X);
        expect(getPlatformSiteForUrl("https://twitter.com/user/status/1")?.id).toBe(SocialPlatformId.X);
    });

    it("recognizes the Facebook hosts from the platform manifest", () => {
        expect(getPlatformSiteForUrl("https://www.facebook.com/post/1")?.id).toBe(SocialPlatformId.FACEBOOK);
        expect(getPlatformSiteForUrl("https://web.facebook.com/post/1")?.id).toBe(SocialPlatformId.FACEBOOK);
        expect(getPlatformSiteForUrl("https://m.facebook.com/post/1")?.id).toBe(SocialPlatformId.FACEBOOK);
    });

    it("recognizes Instagram from the platform manifest", () => {
        expect(getPlatformSiteForUrl("https://www.instagram.com/p/ABC123def45/")?.id)
            .toBe(SocialPlatformId.INSTAGRAM);
        expect(getPlatformSiteForUrl("https://www.instagram.com/reel/XYZ987abc12/")?.id)
            .toBe(SocialPlatformId.INSTAGRAM);
    });

    it("recognizes the FurAffinity hosts from the platform manifest", () => {
        expect(getPlatformSiteForUrl("https://www.furaffinity.net/view/12345/")?.id).toBe(SocialPlatformId.FURAFINITY);
        expect(getPlatformSiteForUrl("https://furaffinity.net/view/12345")?.id).toBe(SocialPlatformId.FURAFINITY);
    });

    it("recognizes TikTok video pages and short links from the platform manifest", () => {
        expect(getPlatformSiteForUrl("https://www.tiktok.com/@chef/video/1")?.id).toBe(SocialPlatformId.TIKTOK);
        expect(getPlatformSiteForUrl("https://vm.tiktok.com/ZSabc123")?.id).toBe(SocialPlatformId.TIKTOK);
        expect(getPlatformSiteForUrl("https://vt.tiktok.com/ZSxyz789")?.id).toBe(SocialPlatformId.TIKTOK);
    });

    it("ignores unsupported, internal, and malformed URLs", () => {
        expect(getPlatformSiteForUrl("https://example.com/post/1")).toBeUndefined();
        expect(getPlatformSiteForUrl("https://facebook.com/post/1")).toBeUndefined();
        expect(getPlatformSiteForUrl("chrome://extensions")).toBeUndefined();
        expect(getPlatformSiteForUrl("not a url")).toBeUndefined();
        expect(getPlatformSiteForUrl(undefined)).toBeUndefined();
    });
});

describe("resolvePopupStatus", () => {
    it("reports active on a supported site with a configured channel", () => {
        const status = resolvePopupStatus("https://x.com/i/status/1", true);

        expect(status.state).toBe("active");
        expect(status.site?.label).toBe("X");
        expect(status.host).toBe("x.com");
    });

    it("reports setup needed on a supported site without a channel", () => {
        const status = resolvePopupStatus("https://www.facebook.com/post/1", false);

        expect(status.state).toBe("setup");
        expect(status.site?.label).toBe("Facebook");
        expect(status.host).toBe("facebook.com");
    });

    it("reports unsupported regardless of configuration", () => {
        expect(resolvePopupStatus("https://example.com", true).state).toBe("unsupported");
        expect(resolvePopupStatus(undefined, false).host).toBeUndefined();
    });
});
