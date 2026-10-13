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

    it("drops the random token description of an obfuscated shared-post card", () => {
        document.body.innerHTML = `
            <div class="post">
                <div data-ad-rendering-role="meta">SxYQP.com</div>
                <div data-ad-rendering-role="title">Entrou no cio</div>
                <div data-ad-rendering-role="description">ZKnBF3l2NyBoHIghW8gAVt26WDr05SDMZRfl9T</div>
            </div>
        `;

        const snapshot = extractPostSnapshot(document.querySelector(".post")!);

        expect(snapshot.text).toBe("Entrou no cio");
    });

    it("attributes a shared photo post to its original author and drops the messenger card", () => {
        document.body.innerHTML = `
            <div class="post">
                <div data-ad-rendering-role="profile_name">
                    <h4><a href="https://www.facebook.com/ariooch"><b><span>Arioch Iankoski</span></b></a></h4>
                </div>
                <a href="https://www.facebook.com/photo/?fbid=122217820022794851">
                    <img data-imgperflogname="feedImage" src="https://scontent.fbcdn.net/v/photo.png">
                </a>
                <div data-ad-rendering-role="meta">m.me</div>
                <span data-ad-rendering-role="title">Gio</span>
                <span data-ad-rendering-role="description">p90fSBMYQpC0p3rrYkzzDGxnpAYxk</span>
                <div data-ad-rendering-role="profile_name">
                    <h5><a href="https://www.facebook.com/profile.php?id=61573845546120"><b><span>Kitsune the immortal bean</span></b></a></h5>
                </div>
            </div>
        `;

        const snapshot = extractPostSnapshot(
            document.querySelector(".post")!,
            "https://www.facebook.com/photo/?fbid=122217820022794851&set=a.122102493446794851"
        );

        expect(snapshot.text).toBe("<b>Arioch Iankoski</b> 🔁 <b>Kitsune the immortal bean</b>");
    });

    it("keeps the sharer comment, the original text, and every co-author of a shared video post", () => {
        document.body.innerHTML = `
            <div class="post">
                <div data-ad-rendering-role="profile_name">
                    <h4><a href="https://www.facebook.com/may.matrioska?__cft__=x"><b><span>May Matrioska</span></b></a></h4>
                </div>
                <div data-ad-rendering-role="story_message">
                    <div data-ad-comet-preview="message">olhem a velocidade excessiva de pacing e cortes desse trailer isso NAO É NORMAL GUYS</div>
                </div>
                <div class="shared">
                    <div>
                        <h5><span><span><span>
                            <b><span><a href="https://www.facebook.com/DisneyAnimation?__cft__=x">Walt Disney Animation Studios</a></span></b>
                            <svg><title>Conta verificada</title></svg>
                            e
                            <b><span><a href="https://www.facebook.com/Disney?__cft__=x">Disney</a></span></b>
                        </span></span></span></h5>
                    </div>
                    <div data-ad-rendering-role="story_message">
                        <div>A world of witches is calling…Disney's <a href="https://www.facebook.com/hashtag/hexed">#Hexed</a> is in theaters November 25</div>
                    </div>
                    <div data-video-id="1671985094517216"><video playsinline muted poster="https://scontent.fbcdn.net/v/poster.jpg"></video></div>
                </div>
                <div data-ad-rendering-role="meta">m.me</div>
                <span data-ad-rendering-role="title">Gio</span>
                <span data-ad-rendering-role="description">sEegQu5lFezpA7aDXML8onvONC</span>
            </div>
        `;

        const snapshot = extractPostSnapshot(
            document.querySelector(".post")!,
            "https://www.facebook.com/may.matrioska/posts/pfbid02yFdWDxCmDes4DHSjxcCn2axVMNT8vjzwXCNhbWVd3FpNaSMSizKuDTZhWnfQTdyTl"
        );

        expect(snapshot.text).toBe(
            "<b>May Matrioska</b> 🔁 <b>Walt Disney Animation Studios &amp; Disney</b>\n\n"
            + "olhem a velocidade excessiva de pacing e cortes desse trailer isso NAO É NORMAL GUYS\n\n"
            + "A world of witches is calling…Disney's #Hexed is in theaters November 25"
        );
    });

    it("ignores the online status text of avatar links when sharing a photo without a comment", () => {
        document.body.innerHTML = `
            <div class="post" role="dialog">
                <a aria-label="Kurrta Ankh" href="https://www.facebook.com/bruna.ankh?__cft__=x">
                    <svg aria-label="Kurrta Ankh" role="img"></svg>
                    <div>Indicador de status online</div><div>Online</div>
                </a>
                <div data-ad-rendering-role="profile_name">
                    <h3><a href="https://www.facebook.com/bruna.ankh?__cft__=x"><b><span>Kurrta Ankh</span></b></a></h3>
                </div>
                <div class="shared">
                    <a href="https://www.facebook.com/photo/?fbid=122225524886111483&set=a.122189815274111483">
                        <img data-imgperflogname="feedImage" src="https://scontent.fbcdn.net/v/photo.jpg">
                    </a>
                    <div data-ad-rendering-role="meta">m.me</div>
                    <span data-ad-rendering-role="title">Gio</span>
                    <span data-ad-rendering-role="description">e621 id: 5858815</span>
                    <a aria-label="Harpad Paws F&amp;P" href="https://www.facebook.com/HarpadFurry?__cft__=x">
                        <svg role="img"></svg><div>Indicador de status online</div><div>Online</div>
                    </a>
                    <div data-ad-rendering-role="profile_name">
                        <h4><span><b><span><a href="https://www.facebook.com/HarpadFurry?__cft__=x">Harpad Paws F&amp;P</a></span></b>
                        adicionou uma foto ao álbum:
                        <b><a href="https://www.facebook.com/media/set/?vanity=HarpadFurry&set=a.1">Furry</a></b></span></h4>
                    </div>
                    <div data-ad-rendering-role="story_message">
                        <div data-ad-comet-preview="message"><div dir="auto">e621 id: 5858815</div></div>
                    </div>
                </div>
                <div role="article" aria-label="Comentário de Alex Mintsugar">
                    <a href="https://www.facebook.com/alex.mintsugar?comment_id=1"><span>Alex Mintsugar</span></a>
                    <div dir="auto">Se n me engano isso foi uma comm pedida pelo próprio dublador do Bubsy kkkkk</div>
                </div>
            </div>
        `;

        const snapshot = extractPostSnapshot(
            document.querySelector(".post")!,
            "https://www.facebook.com/bruna.ankh/posts/pfbid02r1Vs946fwbzyLJReccRmkPVUUdCMmVAhmKtJrQZjopvuBtk2obLcay3Qsew4cSsfl"
        );

        expect(snapshot.text).toBe("<b>Kurrta Ankh</b> 🔁 <b>Harpad Paws F&amp;P</b>\n\ne621 id: 5858815");
    });

    it("reads the author name from the avatar label, not its online status", () => {
        document.body.innerHTML = `
            <div class="post" role="dialog">
                <a aria-label="Kurrta Ankh" href="https://www.facebook.com/bruna.ankh?__cft__=x">
                    <svg aria-label="Kurrta Ankh" role="img"></svg>
                    <div>Indicador de status online</div><div>Online</div>
                </a>
                <div data-ad-rendering-role="profile_name">
                    <h3><a href="https://www.facebook.com/bruna.ankh?__cft__=x"><b><span>Kurrta Ankh</span></b></a></h3>
                </div>
                <div data-ad-rendering-role="story_message">
                    <div data-ad-comet-preview="message"><div dir="auto">bom dia</div></div>
                </div>
            </div>
        `;

        const snapshot = extractPostSnapshot(
            document.querySelector(".post")!,
            "https://www.facebook.com/bruna.ankh/posts/pfbid02r1Vs946fwbzyLJReccRmkPVUUdCMmVAhmKtJrQZjopvuBtk2obLcay3Qsew4cSsfl"
        );

        expect(snapshot.text).toBe("<b>Kurrta Ankh</b>\n\nbom dia");
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
