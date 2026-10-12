import { describe, expect, it } from "vitest";
import { migrateConfig } from "../src/core/storage/ConfigMigrations";
import { isConfigReady } from "../src/core/storage/Storage";
import { CurrentConfigVersion, DestinationProvider } from "../src/core/types/Config";

describe("migrateConfig", () => {
    it("upgrades the legacy Telegram-only config to the multi-provider schema", () => {
        const result = migrateConfig({
            botToken: "123:abc",
            channels: [
                { id: "a", label: "Canal A", chatId: "-1001" },
                { id: "b", label: "Canal B", chatId: "@canalb" }
            ],
            lastUsedChannelId: "b"
        });

        expect(result.migrated).toBe(true);
        expect(result.fromVersion).toBe(1);
        expect(result.config).toEqual({
            version: CurrentConfigVersion,

            providers: {
                telegram: { botToken: "123:abc" }
            },

            channels: [
                { id: "a", label: "Canal A", provider: DestinationProvider.TELEGRAM, chatId: "-1001" },
                { id: "b", label: "Canal B", provider: DestinationProvider.TELEGRAM, chatId: "@canalb" }
            ],

            lastUsedChannelId: "b"
        });
        expect(isConfigReady(result.config)).toBe(true);
    });

    it("repairs a broken legacy config instead of throwing", () => {
        const result = migrateConfig({
            channels: [{ label: "Sem id", chatId: "-1001" }, "lixo"]
        });

        expect(result.migrated).toBe(true);
        expect(result.config.providers.telegram.botToken).toBe("");
        expect(result.config.channels).toHaveLength(1);
        expect(result.config.channels[0]?.id).toMatch(/.+/);
        expect(isConfigReady(result.config)).toBe(false);
    });

    it("leaves a current-version config untouched and keeps mixed providers", () => {
        const stored = {
            version: CurrentConfigVersion,

            providers: {
                telegram: { botToken: "123:abc" }
            },

            channels: [
                { id: "a", label: "Telegram", provider: DestinationProvider.TELEGRAM, chatId: "-1001" },
                {
                    id: "b",
                    label: "Discord",
                    provider: DestinationProvider.DISCORD,
                    webhookUrl: "https://discord.com/api/webhooks/1/abc"
                }
            ]
        };

        const result = migrateConfig(stored);

        expect(result.migrated).toBe(false);
        expect(result.config.channels).toEqual(stored.channels);
    });

    it("drops channels with an unknown provider", () => {
        const result = migrateConfig({
            version: CurrentConfigVersion,
            providers: { telegram: { botToken: "" } },
            channels: [{ id: "x", label: "Outro", provider: "SLACK" }]
        });

        expect(result.config.channels).toEqual([]);
    });

    it("returns defaults when nothing is stored", () => {
        const result = migrateConfig(undefined);

        expect(result.migrated).toBe(false);
        expect(result.config.version).toBe(CurrentConfigVersion);
        expect(result.config.channels).toEqual([]);
    });
});
