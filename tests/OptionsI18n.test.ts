import { describe, expect, it } from "vitest";
import enMessages from "../_locales/en/messages.json";
import ptBrMessages from "../_locales/pt_BR/messages.json";

const PreferenceMessageKeys = [
    "optionsPreferencesTitle",
    "optionsHideRecentChatsLabel",
    "optionsHideRecentChatsDescription"
] as const;

describe.each([
    { locale: "en", messages: enMessages },
    { locale: "pt_BR", messages: ptBrMessages }
])("$locale options messages", ({ messages }) => {
    it.each(PreferenceMessageKeys)("defines %s", (key) => {
        expect(messages).toHaveProperty(key);
        expect(messages[key].message).not.toBe("");
    });
});
