import { describe, expect, it } from "vitest";
import {
    collectChannelsFromUpdate,
    resolveTelegramChatId,
    sortDetectedChannels
} from "../src/core/telegram/DiscoverChannels";

describe("resolveTelegramChatId", () => {
    it("uses @username for public channels", () => {
        expect(resolveTelegramChatId({
            id: -100123,
            type: "channel",
            title: "Fofocas",
            username: "fofocas"
        })).toBe("@fofocas");
    });

    it("uses numeric id for private channels", () => {
        expect(resolveTelegramChatId({
            id: -100987654321,
            type: "channel",
            title: "Privado"
        })).toBe("-100987654321");
    });
});

describe("collectChannelsFromUpdate", () => {
    it("collects channel from my_chat_member update", () => {
        const channels = new Map();

        collectChannelsFromUpdate({
            update_id: 1,
            my_chat_member: {
                chat: {
                    id: -100111,
                    type: "channel",
                    title: "Tech",
                    username: "techbr"
                }
            }
        }, channels);

        expect(Array.from(channels.values())).toEqual([{
            chatId: "@techbr",
            title: "Tech",
            username: "techbr"
        }]);
    });

    it("ignores non-channel chats", () => {
        const channels = new Map();

        collectChannelsFromUpdate({
            update_id: 2,
            message: {
                chat: {
                    id: 12345,
                    type: "private",
                    title: "User"
                }
            }
        }, channels);

        expect(channels.size).toBe(0);
    });
});

describe("sortDetectedChannels", () => {
    it("sorts by title", () => {
        expect(sortDetectedChannels([
            { chatId: "@b", title: "Zorro" },
            { chatId: "@a", title: "Alpha" }
        ])).toEqual([
            { chatId: "@a", title: "Alpha" },
            { chatId: "@b", title: "Zorro" }
        ]);
    });
});
