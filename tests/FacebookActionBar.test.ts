import { describe, expect, it } from "vitest";
import {
    collectFacebookActionBars,
    collectReelViewerActionBars,
    findActionBar,
    findPostRootFromProfile,
    findReelSnapshotRoot
} from "../src/platforms/facebook/content/ActionBar";

describe("findMinimalActionBar", () => {
    it("uses the innermost action bar when wrappers also match", () => {
        document.body.innerHTML = `
            <article class="card">
                <div class="outer-actions">
                    <div data-ad-rendering-role="like_button"></div>
                    <div data-ad-rendering-role="comment_button"></div>
                    <div class="inner-actions">
                        <div role="button">
                            <div data-ad-rendering-role="share_button"></div>
                        </div>
                        <div data-ad-rendering-role="like_button"></div>
                        <div data-ad-rendering-role="comment_button"></div>
                    </div>
                </div>
            </article>
        `;

        const bars = collectFacebookActionBars(document);
        expect(bars).toHaveLength(1);
        expect(bars[0]).toBe(document.querySelector(".inner-actions"));
    });
});

describe("findPostRootFromProfile", () => {
    it("walks up until the action bar is inside the post root", () => {
        document.body.innerHTML = `
            <article class="card">
                <header><div data-ad-rendering-role="profile_name">Autor</div></header>
                <div class="content-wrapper">
                    <div data-ad-rendering-role="story_message">Texto</div>
                </div>
                <div class="actions">
                    <div data-ad-rendering-role="like_button"></div>
                    <div data-ad-rendering-role="comment_button"></div>
                    <div role="button"><div data-ad-rendering-role="share_button"></div></div>
                </div>
            </article>
        `;

        const profileName = document.querySelector('[data-ad-rendering-role="profile_name"]')!;
        const postRoot = findPostRootFromProfile(profileName);

        expect(postRoot).toBe(document.querySelector(".card"));
        expect(findActionBar(postRoot)).not.toBeNull();
    });
});

describe("collectReelViewerActionBars", () => {
    it("detects reel viewer controls by aria-label", () => {
        document.body.innerHTML = `
            <div class="viewer">
                <div data-video-id="2483275915472051">
                    <video poster="https://cdn.example/poster.jpg"></video>
                </div>
                <div class="side-actions">
                    <div aria-label="Curtir" role="button"></div>
                    <div aria-label="Comentar" role="button"></div>
                    <div aria-label="Compartilhar" role="button"></div>
                </div>
            </div>
        `;

        const bars = collectReelViewerActionBars(document);
        expect(bars).toHaveLength(1);
        expect(bars[0]).toBe(document.querySelector(".side-actions"));
    });
});
