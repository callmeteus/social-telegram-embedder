/**
 * Downloads a remote resource with byte progress when Content-Length is available.
 */
export async function fetchBlobWithProgress(
    url: string,
    onProgress: (loaded: number, total: number | null) => void
): Promise<Blob> {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}`);
    }

    if (!response.body) {
        const blob = await response.blob();
        onProgress(blob.size, blob.size);
        return blob;
    }

    const totalHeader = response.headers.get("content-length");
    const total = totalHeader ? Number.parseInt(totalHeader, 10) : null;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;

    onProgress(0, total);

    while (true) {
        const { done, value } = await reader.read();

        if (done) {
            break;
        }

        if (value) {
            chunks.push(value);
            loaded += value.byteLength;
            onProgress(loaded, total);
        }
    }

    return new Blob(chunks as BlobPart[], { type: response.headers.get("content-type") ?? undefined });
}

/**
 * Formats download progress for user-facing toast copy.
 */
export function formatDownloadProgressMessage(
    itemIndex: number,
    itemTotal: number,
    loaded: number,
    total: number | null
): { message: string; percent?: number } {
    const prefix = itemTotal > 1
        ? `Baixando mídia ${itemIndex} de ${itemTotal}...`
        : "Baixando mídia...";

    if (!total || total <= 0) {
        const kilobytes = Math.max(1, Math.round(loaded / 1024));
        return {
            message: `${prefix} ${kilobytes} KB`
        };
    }

    const percent = Math.min(100, Math.round((loaded / total) * 100));

    return {
        message: `${prefix} ${percent}%`,
        percent
    };
}
