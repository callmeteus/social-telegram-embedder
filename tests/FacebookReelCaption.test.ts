import { describe, expect, it } from "vitest";
import { extractPostSnapshot } from "../src/platforms/facebook/content/PostDom";
import { isFacebookProfileNavigationText } from "../src/platforms/facebook/content/PostTextUtils";

describe("isFacebookProfileNavigationText", () => {
    it("detects profile navigation affordances", () => {
        expect(isFacebookProfileNavigationText("Ver perfil do dono")).toBe(true);
        expect(isFacebookProfileNavigationText("View owner's profile")).toBe(true);
        expect(isFacebookProfileNavigationText("ASUS Republic of Gamers")).toBe(false);
    });
});

describe("extractPostSnapshot reel overlay", () => {
    it("reads caption inside the video player overlay and ignores profile navigation labels", () => {
        document.body.innerHTML = `
            <div class="reel-root" data-video-id="27568225666178278">
                <div aria-label="Video player" role="group">
                    <video poster="https://cdn.example/poster.jpg"></video>
                    <a aria-label="Ver perfil do dono" href="/profile.php?id=123"></a>
                    <h2><a aria-label="Ver perfil do dono" href="/profile.php?id=123">ASUS Republic of Gamers</a></h2>
                    <span dir="auto"><div class="x126k92a">Duo saved me. #DuoItAll</div></span>
                </div>
            </div>
        `;

        const snapshot = extractPostSnapshot(document.querySelector(".reel-root")!);

        expect(snapshot.text).toContain("<b>ASUS Republic of Gamers</b>");
        expect(snapshot.text).toContain("Duo saved me.");
        expect(snapshot.text).not.toContain("Ver perfil do dono");
    });
});
