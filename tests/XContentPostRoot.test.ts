import { describe, expect, it } from "vitest";
import { findTweetPostRootFromActionBar } from "../src/platforms/x/content/ActionBar";
import {
    buildXContentPhotoViewerSnapshot,
    isXContentPhotoViewerContext
} from "../src/platforms/x/content/PhotoViewer";
import { extractXContentTimelinePhotoUrls } from "../src/platforms/x/content/TimelineMedia";

describe("findTweetPostRootFromActionBar", () => {
    it("finds div-based timeline posts without article tags", () => {
        document.body.innerHTML = `
            <div class="timeline-post">
                <div data-testid="tweetText">Caption</div>
                <a href="/artist_daimo/status/2109071488238100947">time</a>
                <div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/a.jpg" /></div>
                <div role="group" id="action-bar">
                    <button data-testid="reply"></button>
                    <button data-testid="retweet"></button>
                </div>
            </div>
        `;

        const actionBar = document.getElementById("action-bar")!;
        const postRoot = findTweetPostRootFromActionBar(actionBar);

        expect(postRoot?.classList.contains("timeline-post")).toBe(true);
        expect(extractXContentTimelinePhotoUrls(postRoot!)).toEqual([
            "https://pbs.twimg.com/media/a.jpg?name=orig"
        ]);
    });
});

describe("buildXContentPhotoViewerSnapshot carousel", () => {
    it("captures only the active carousel slide", () => {
        document.body.innerHTML = `
            <div aria-modal="true" role="dialog">
                <span>Slide 2 de 2 – carrossel</span>
                <div aria-roledescription="carousel">
                    <ul>
                        <li role="listitem">
                            <img src="https://pbs.twimg.com/media/slide-one.jpg?format=jpg&amp;name=large" />
                        </li>
                        <li role="listitem">
                            <img src="https://pbs.twimg.com/media/slide-two.jpg?format=jpg&amp;name=large" />
                        </li>
                    </ul>
                </div>
            </div>
        `;

        expect(isXContentPhotoViewerContext({ pathname: "/home" } as Location)).toBe(true);

        const snapshot = buildXContentPhotoViewerSnapshot({ pathname: "/home" } as Location, document);

        expect(snapshot?.media).toEqual([
            { kind: "photo", url: "https://pbs.twimg.com/media/slide-two.jpg?name=orig" }
        ]);
    });
});
