import { describe, expect, it } from "vitest";
import { parseFacebookVideoUrlsFromHtml } from "../src/platforms/facebook/api/OpenGraphFetch";
import { isFacebookVideoPlaceholderPoster } from "../src/platforms/facebook/content/PostMedia";

describe("isFacebookVideoPlaceholderPoster", () => {
    it("detects the generic Facebook play placeholder", () => {
        expect(isFacebookVideoPlaceholderPoster(
            "https://static.xx.fbcdn.net/rsrc.php/v4/yN/r/AAqMW82PqGg.gif?_nc_eui2=abc"
        )).toBe(true);
    });

    it("allows real poster images", () => {
        expect(isFacebookVideoPlaceholderPoster("https://cdn.example/poster.jpg")).toBe(false);
    });
});

describe("parseFacebookVideoUrlsFromHtml", () => {
    it("reads og:video and embedded JSON video URLs", () => {
        const html = `
            <meta property="og:video" content="https://video.example.com/fallback.mp4" />
            <script>"browser_native_hd_url":"https:\\/\\/video.xx.fbcdn.net\\/v\\/clip.mp4?efg=abc"</script>
        `;

        expect(parseFacebookVideoUrlsFromHtml(html)).toEqual([
            "https://video.example.com/fallback.mp4",
            "https://video.xx.fbcdn.net/v/clip.mp4?efg=abc"
        ]);
    });
});
