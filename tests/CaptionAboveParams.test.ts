import { describe, expect, it } from "vitest";
import {
    albumCaptionAboveParams,
    singleMediaCaptionAboveParams
} from "../src/background/telegram-user/CaptionAboveParams";

describe("caption above mtcute params", () => {
    it("uses invert for a single media", () => {
        expect(singleMediaCaptionAboveParams(true)).toEqual({ invert: true });
        expect(singleMediaCaptionAboveParams()).toEqual({});
    });

    it("uses invertMedia for an album", () => {
        expect(albumCaptionAboveParams(true)).toEqual({ invertMedia: true });
        expect(albumCaptionAboveParams()).toEqual({});
    });
});
