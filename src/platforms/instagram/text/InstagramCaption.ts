import { buildSocialPostText, SocialCaptionAuthorStyle } from "../../../core/telegram/SocialCaption";

/**
 * Builds the Telegram caption text for an Instagram post.
 *
 * @param body - Plain caption text shown on the post.
 * @param authorHandle - Account handle shown above the caption, without the leading at sign.
 * @returns Escaped caption text with the author header when available.
 */
export function buildInstagramCaptionText(body: string, authorHandle?: string | null): string {
    return buildSocialPostText({
        body,
        pageName: authorHandle ?? undefined,
        authorStyle: SocialCaptionAuthorStyle.HANDLE
    });
}
