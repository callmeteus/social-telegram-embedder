import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    collectFacebookActionBars,
    findActionBar,
    findPostRootFromProfile,
    findShareInsertAnchor
} from "../src/platforms/facebook/content/ActionBar";
import { injectFacebookContent } from "../src/platforms/facebook/content/InjectButton";
import { extractPostUrlFromElement } from "../src/platforms/facebook/url/FacebookUrl";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("facebook action bars without share button", () => {
    it("detects like/comment rows when share is missing", () => {
        document.body.innerHTML = `
            <article class="post-card">
                <div data-ad-rendering-role="profile_name">Ellie Viollet Huntrr</div>
                <div data-ad-rendering-role="story_message">Texto do post</div>
                <a href="https://www.facebook.com/photo/?fbid=1139394335425423&amp;set=a.112779864753547">foto</a>
                <div class="actions">
                    <div>
                        <div aria-label="Curtir" role="button">
                            <div data-ad-rendering-role="like_button"></div>
                        </div>
                    </div>
                    <div>
                        <div aria-label="Deixe um comentário" role="button">
                            <div data-ad-rendering-role="comment_button"></div>
                        </div>
                    </div>
                </div>
            </article>
        `;

        const profileName = document.querySelector('[data-ad-rendering-role="profile_name"]')!;
        const postRoot = findPostRootFromProfile(profileName);
        const actionBar = findActionBar(postRoot);

        expect(actionBar).toBe(document.querySelector(".actions"));
        expect(collectFacebookActionBars(document)).toHaveLength(1);
        expect(extractPostUrlFromElement(postRoot)).toContain("/photo/?fbid=1139394335425423");
        expect(findShareInsertAnchor(actionBar!)).not.toBeNull();
    });

    it("injects on feed posts that only expose like and comment controls", () => {
        document.body.innerHTML = `
            <article class="post-card">
                <div data-ad-rendering-role="profile_name">Ellie Viollet Huntrr</div>
                <div data-ad-rendering-role="story_message">Texto do post</div>
                <a href="https://www.facebook.com/photo/?fbid=1139394335425423&amp;set=a.112779864753547">foto</a>
                <div class="actions">
                    <div>
                        <div aria-label="Curtir" role="button">
                            <div data-ad-rendering-role="like_button"></div>
                        </div>
                    </div>
                    <div class="comment-slot">
                        <div aria-label="Deixe um comentário" role="button">
                            <div data-ad-rendering-role="comment_button"></div>
                        </div>
                    </div>
                </div>
            </article>
        `;

        injectFacebookContent(document);

        const slot = document.querySelector(".x2tg-send-button-slot");
        const commentSlot = document.querySelector(".comment-slot");

        expect(slot).not.toBeNull();
        expect(commentSlot?.nextElementSibling).toBe(slot);
    });

    it("injects on the uploaded feed markup sample", () => {
        const fixturePath = join(fixturesDir, "facebook-no-share-feed.html");

        document.body.innerHTML = readFileSync(fixturePath, "utf8");

        injectFacebookContent(document);

        expect(document.querySelector(".x2tg-send-button-slot")).not.toBeNull();
    });
});
