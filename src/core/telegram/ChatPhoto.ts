import { normalizeTelegramChatId } from "./NormalizeChatId";
import { buildTelegramBotApiUrl, buildTelegramBotFileUrl } from "./TelegramApiUrl";
import { bytesToBase64 } from "./TelegramFileUtils";

interface BotApiResponse<T> {
    ok: boolean;
    result?: T;
}

interface BotChat {
    photo?: { small_file_id?: string };
}

interface BotFile {
    file_path?: string;
}

/**
 * Downloads the small profile photo of a chat the bot can see, as a data URL.
 * Resolves null when the chat has no photo or anything fails.
 *
 * @param botToken - Bot token from @BotFather.
 * @param chatId - Chat id or @username as configured.
 */
export async function fetchBotChatPhoto(botToken: string, chatId: string): Promise<string | null> {
    if (!botToken.trim() || !chatId.trim()) {
        return null;
    }

    try {
        const chat = await callBotApi<BotChat>(botToken, "getChat", { chat_id: normalizeTelegramChatId(chatId) });
        const fileId = chat?.photo?.small_file_id;

        if (!fileId) {
            return null;
        }

        const file = await callBotApi<BotFile>(botToken, "getFile", { file_id: fileId });

        if (!file?.file_path) {
            return null;
        }

        const response = await fetch(buildTelegramBotFileUrl(botToken.trim(), file.file_path));

        if (!response.ok) {
            return null;
        }

        const blob = await response.blob();
        const bytes = new Uint8Array(await blob.arrayBuffer());

        return `data:${blob.type || "image/jpeg"};base64,${bytesToBase64(bytes)}`;
    } catch (err) {
        console.debug("[telegram] chat photo load failed: %O", err);
        return null;
    }
}

async function callBotApi<T>(botToken: string, method: string, body: Record<string, unknown>): Promise<T | null> {
    const response = await fetch(buildTelegramBotApiUrl(botToken.trim(), method), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    const data = await response.json() as BotApiResponse<T>;

    return data.ok ? data.result ?? null : null;
}
