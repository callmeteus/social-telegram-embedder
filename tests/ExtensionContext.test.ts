import { describe, expect, it } from "vitest";
import { isExtensionContextError } from "../src/core/extension";

describe("isExtensionContextError", () => {
    it("detects invalidated extension contexts", () => {
        expect(isExtensionContextError(new Error("Extension context invalidated."))).toBe(true);
        expect(isExtensionContextError(new Error("Could not establish connection. Receiving end does not exist."))).toBe(true);
        expect(isExtensionContextError(new Error("Unexpected failure"))).toBe(false);
    });
});
