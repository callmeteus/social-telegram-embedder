import { describe, expect, it } from "vitest";
import { extractPostSnapshot } from "../src/platforms/facebook/content/PostDom";

describe("extractPostSnapshot", () => {
    it("ignores generic video placeholder posters until video is resolved", () => {
        document.body.innerHTML = `
            <div class="post">
                <div data-ad-rendering-role="title">
                    <span dir="auto">Titulo do post</span>
                </div>
                <div data-ad-rendering-role="description">
                    <span dir="auto">Descricao curta</span>
                </div>
                <div data-video-id="2483275915472051">
                    <video poster="https://static.xx.fbcdn.net/rsrc.php/v4/yN/r/AAqMW82PqGg.gif"></video>
                </div>
            </div>
        `;

        const snapshot = extractPostSnapshot(document.querySelector(".post")!);

        expect(snapshot.text).toBe("Titulo do post\n\nDescricao curta");
        expect(snapshot.media).toEqual([]);
    });

    it("uses only story text when a link preview is present", () => {
        document.body.innerHTML = `
            <div class="post">
                <div data-ad-rendering-role="story_message">Tenho um oc dessa especie</div>
                <div data-ad-rendering-role="meta">o5zoeB.com</div>
                <div data-ad-rendering-role="title">Gio</div>
                <div data-ad-rendering-role="description">The aardwolf is a hyena that chose termites over meat.</div>
            </div>
        `;

        const snapshot = extractPostSnapshot(document.querySelector(".post")!);

        expect(snapshot.text).toBe("Tenho um oc dessa especie");
        expect(snapshot.text).not.toContain("Gio");
        expect(snapshot.text).not.toContain("The aardwolf");
        expect(snapshot.text).not.toContain("o5zoeB.com");
    });

    it("keeps story text, page name from post URL, and repost attribution", () => {
        document.body.innerHTML = `
            <div class="post">
                <div data-ad-rendering-role="profile_name">
                    <h4><a href="https://www.facebook.com/ariooch"><b><span>Arioch Iankoski</span></b></a></h4>
                </div>
                <div data-ad-rendering-role="story_message">Art:lichee</div>
                <h5><a href="https://www.facebook.com/chen.xin.xin.962081"><b><span>陈心心</span></b></a></h5>
                <div data-ad-rendering-role="title">Gio</div>
                <div data-ad-rendering-role="description">0xPfc7nzo0RDJ7ZBXFjp5iCkDehsjs1HcI5lGuPu53SguyuISgGMDWUGAtsPyb</div>
                <div data-ad-rendering-role="meta">CCAaS3RDn6.com</div>
            </div>
        `;

        const snapshot = extractPostSnapshot(
            document.querySelector(".post")!,
            "https://www.facebook.com/lilyvanhauntt/posts/pfbid038UhX3mvAvCx6YN55Gob7KGYPYchv6eyhWGgPtJBUqbGgo7wAF2q9ptj8crYmXuHl"
        );

        expect(snapshot.text).toBe([
            "<b>Arioch Iankoski</b> 🔁 <b>Lilyvanhauntt</b>",
            "Art:lichee"
        ].join("\n\n"));
        expect(snapshot.text).not.toContain("Gio");
        expect(snapshot.text).not.toContain("0xPfc7");
        expect(snapshot.text).not.toContain("CCAaS3RDn6.com");
    });

    it("prefers full description over truncated preview cards", () => {
        document.body.innerHTML = `
            <div class="post">
                <div data-ad-rendering-role="title">BRASIL E CAMPEAO EM TORNEIO MUNDIAL DE TFT... Ver mais</div>
                <div data-ad-rendering-role="meta">m.me</div>
                <div data-ad-rendering-role="description">BRASIL E CAMPEAO EM TORNEIO MUNDIAL DE TFT Daniels e Toddy venceram.</div>
                <span>Fotos</span>
            </div>
        `;

        const snapshot = extractPostSnapshot(document.querySelector(".post")!);

        expect(snapshot.text).not.toContain("m.me");
        expect(snapshot.text).not.toContain("Fotos");
        expect(snapshot.text).not.toContain("Ver mais");
        expect(snapshot.text).toContain("Daniels e Toddy venceram.");
    });

    it("uses description when story text is only the see-more link", () => {
        document.body.innerHTML = `
            <div class="post">
                <div data-ad-rendering-role="story_message">... Ver mais</div>
                <div data-ad-rendering-role="description">Art: Jayrnski commission for Little Puppy Moon</div>
            </div>
        `;

        const snapshot = extractPostSnapshot(document.querySelector(".post")!);

        expect(snapshot.text).toBe("Art: Jayrnski commission for Little Puppy Moon");
        expect(snapshot.text).not.toContain("Ver mais");
    });

    it("extracts profile photo update posts with author name, emoji caption, and cover photo", () => {
        document.body.innerHTML = `
            <div class="post">
                <div data-ad-rendering-role="profile_name">
                    <h4>
                        <b><a href="https://www.facebook.com/lola.hayden.14102">Lola Lupinus Hayden</a></b>
                        atualizou a foto do perfil dela.
                    </h4>
                </div>
                <div data-ad-rendering-role="story_message">
                    <div data-ad-comet-preview="message">
                        <img alt="🎨" src="https://static.xx.fbcdn.net/images/emoji.php/v9/t82/1/16/1f3a8.png" />
                        <a href="https://www.facebook.com/Blazitastic">Blazitastic Art</a>
                    </div>
                </div>
                <img
                    data-imgperflogname="feedCoverPhoto"
                    src="https://cdn.example/profile-photo.jpg"
                />
            </div>
        `;

        const snapshot = extractPostSnapshot(document.querySelector(".post")!);

        expect(snapshot.text).toBe([
            "<b>Lola Lupinus Hayden</b>",
            "🎨 Blazitastic Art"
        ].join("\n\n"));
        expect(snapshot.text).not.toContain("atualizou a foto do perfil");
        expect(snapshot.media).toEqual([
            {
                kind: "photo",
                url: "https://cdn.example/profile-photo.jpg"
            }
        ]);
    });
});
