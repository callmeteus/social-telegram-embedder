/**
 * mtcute option that draws the caption above a single media item.
 * mtcute calls this option `invert` on sendMedia and `invertMedia` on sendMediaGroup.
 */
export function singleMediaCaptionAboveParams(captionAbove?: boolean): { invert?: boolean } {
    return captionAbove ? { invert: true } : {};
}

/** mtcute option that draws the caption above an album. */
export function albumCaptionAboveParams(captionAbove?: boolean): { invertMedia?: boolean } {
    return captionAbove ? { invertMedia: true } : {};
}
