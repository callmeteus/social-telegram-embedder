import { describe, expect, it } from "vitest";
import {
    findActionBar,
    findPostRootFromProfile
} from "../src/platforms/facebook/content/ActionBar";
import { injectFacebookContent } from "../src/platforms/facebook/content/InjectButton";
import { extractPostUrlFromElement } from "../src/platforms/facebook/url/FacebookUrl";

describe("facebook card layout", () => {
    it("includes sibling action bar when resolving post root", () => {
        document.body.innerHTML = `
            <article class="card">
                <header>
                    <div data-ad-rendering-role="profile_name">Autor</div>
                </header>
                <div data-ad-rendering-role="story_message">Texto</div>
                <a href="https://www.facebook.com/photo/?fbid=123">foto</a>
                <img data-imgperflogname="feedImage" src="https://cdn.example/photo.jpg" />
                <div class="actions">
                    <div data-ad-rendering-role="like_button"></div>
                    <div data-ad-rendering-role="comment_button"></div>
                    <div role="button">
                        <div data-ad-rendering-role="share_button"></div>
                    </div>
                </div>
            </article>
        `;

        const profileName = document.querySelector('[data-ad-rendering-role="profile_name"]')!;
        const postRoot = findPostRootFromProfile(profileName);

        expect(postRoot).toBe(document.querySelector(".card"));
        expect(findActionBar(postRoot)).not.toBeNull();
        expect(extractPostUrlFromElement(postRoot)).toContain("fbid=123");

        injectFacebookContent(document);
        expect(document.querySelector(".x2tg-send-button-slot")).not.toBeNull();
    });
});
