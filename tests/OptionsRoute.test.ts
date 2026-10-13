import { describe, expect, it } from "vitest";
import { formatOptionsRoute, OptionsView, parseOptionsRoute } from "../src/options/OptionsRoute";

describe("parseOptionsRoute", () => {
    it("reads the list, the chooser and each detail screen", () => {
        expect(parseOptionsRoute("")).toEqual({ view: OptionsView.LIST });
        expect(parseOptionsRoute("#")).toEqual({ view: OptionsView.LIST });
        expect(parseOptionsRoute("#add")).toEqual({ view: OptionsView.ADD });
        expect(parseOptionsRoute("#bot/telegram-bot")).toEqual({ view: OptionsView.BOT, connectionId: "telegram-bot" });
        expect(parseOptionsRoute("#account/3f2a-9c")).toEqual({ view: OptionsView.ACCOUNT, connectionId: "3f2a-9c" });
    });

    it("falls back to the list for unknown or unsafe hashes", () => {
        expect(parseOptionsRoute("#bot")).toEqual({ view: OptionsView.LIST });
        expect(parseOptionsRoute("#bot/../evil")).toEqual({ view: OptionsView.LIST });
        expect(parseOptionsRoute("#settings")).toEqual({ view: OptionsView.LIST });
    });
});

describe("formatOptionsRoute", () => {
    it("round-trips every screen", () => {
        const routes = [
            { view: OptionsView.LIST },
            { view: OptionsView.ADD },
            { view: OptionsView.BOT, connectionId: "bot-1" },
            { view: OptionsView.ACCOUNT, connectionId: "acc-1" }
        ];

        for (const route of routes) {
            expect(parseOptionsRoute(formatOptionsRoute(route))).toEqual(route);
        }
    });
});
