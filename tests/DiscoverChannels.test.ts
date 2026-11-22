import { describe, expect, it } from "vitest";
import {
    collectChannelsFromUpdate,
    formatDetectedChannelTitle,
    getDetectedChannelKey,
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

describe("forum topics", () => {
    it("collects a topic from a message in a forum supergroup", () => {
        const channels = new Map();

        collectChannelsFromUpdate({
            update_id: 3,
            message: {
                chat: { id: -100555, type: "supergroup", title: "Grupo", is_forum: true },
                message_thread_id: 42,
                forum_topic_created: { name: "Fofocas" }
            }
        }, channels);

        expect(Array.from(channels.values())).toEqual([{
            chatId: "-100555",
            title: "Grupo",
            topicId: 42,
            topicTitle: "Fofocas"
        }]);
        expect(getDetectedChannelKey(Array.from(channels.values())[0]!)).toBe("-100555:42");
        expect(formatDetectedChannelTitle(Array.from(channels.values())[0]!)).toBe("Grupo · Fofocas");
    });

    it("keeps two topics of the same group as separate destinations", () => {
        const channels = new Map();

        for (const topicId of [7, 8]) {
            collectChannelsFromUpdate({
                update_id: topicId,
                message: {
                    chat: { id: -100777, type: "supergroup", title: "Grupo", is_forum: true },
                    message_thread_id: topicId
                }
            }, channels);
        }

        expect(channels.size).toBe(2);
        expect(Array.from(channels.keys())).toEqual(["-100777:7", "-100777:8"]);
    });

    it("ignores messages without a forum topic", () => {
        const channels = new Map();

        collectChannelsFromUpdate({
            update_id: 6,
            message: {
                chat: { id: -100888, type: "supergroup", title: "Grupo", is_forum: true }
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
