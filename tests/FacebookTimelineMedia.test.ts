import { describe, expect, it } from "vitest";
import { filterMediaToSelectedPhotos } from "../src/platforms/facebook/content/PhotoViewerMedia";
import { buildPostSnapshot } from "../src/platforms/facebook/content/PostDom";
import { extractFacebookTimelinePhotoUrls } from "../src/platforms/facebook/content/TimelineMedia";

describe("extractFacebookTimelinePhotoUrls", () => {
    it("returns feed photos in DOM order", () => {
        document.body.innerHTML = `
            <div class="post">
                <img data-imgperflogname="feedImage" src="https://cdn.example/photo-a.jpg" />
                <img data-imgperflogname="feedImage" src="https://cdn.example/photo-b.jpg" />
            </div>
        `;

        const root = document.querySelector(".post")!;
        expect(extractFacebookTimelinePhotoUrls(root)).toEqual([
            "https://cdn.example/photo-a.jpg",
            "https://cdn.example/photo-b.jpg"
        ]);
    });
});

describe("filterMediaToSelectedPhotos", () => {
    it("keeps selected photos and preserves videos", () => {
        const filtered = filterMediaToSelectedPhotos([
            { kind: "photo", url: "https://cdn.example/photo-a.jpg" },
            { kind: "photo", url: "https://cdn.example/photo-b.jpg" },
            { kind: "video", url: "https://cdn.example/video.mp4" }
        ], ["https://cdn.example/photo-b.jpg"]);

        expect(filtered).toEqual([
            { kind: "photo", url: "https://cdn.example/photo-b.jpg" },
            { kind: "video", url: "https://cdn.example/video.mp4" }
        ]);
    });
});

describe("buildPostSnapshot selected photos", () => {
    it("limits resolved media to the timeline selection", async () => {
        document.body.innerHTML = `
            <div class="post">
                <div data-ad-rendering-role="profile_name">Página</div>
                <div data-ad-rendering-role="story_message">Legenda</div>
                <img data-imgperflogname="feedImage" src="https://cdn.example/photo-a.jpg" />
                <img data-imgperflogname="feedImage" src="https://cdn.example/photo-b.jpg" />
            </div>
        `;

        const root = document.querySelector(".post")!;
        const snapshot = await buildPostSnapshot(root, null, {
            selectedPhotoUrls: ["https://cdn.example/photo-a.jpg"]
        });

        expect(snapshot.media).toEqual([
            { kind: "photo", url: "https://cdn.example/photo-a.jpg" }
        ]);
    });
});
