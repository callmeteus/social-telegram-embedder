import { describe, expect, it } from "vitest";
import {
    buildSocialPostText,
    SocialCaptionAuthorStyle
} from "../src/core/telegram/SocialCaption";

describe("buildSocialPostText", () => {
    it("puts the author header before the body for Facebook names", () => {
        expect(buildSocialPostText({
            body: "Duo saved me. #DuoItAll",
            pageName: "ASUS Republic of Gamers",
            authorStyle: SocialCaptionAuthorStyle.NAME
        })).toBe([
            "<b>ASUS Republic of Gamers</b>",
            "Duo saved me. #DuoItAll"
        ].join("\n\n"));
    });

    it("formats repost headers with handles on X", () => {
        expect(buildSocialPostText({
            body: "Art:lichee",
            pageName: "@lilyvanhauntt",
            repostedBy: "@ariooch",
            authorStyle: SocialCaptionAuthorStyle.HANDLE
        })).toBe([
            "<b>@ariooch</b> 🔁 <b>@lilyvanhauntt</b>",
            "Art:lichee"
        ].join("\n\n"));
    });
});
