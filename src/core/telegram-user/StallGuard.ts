/** Message carried by {@link SendStalledError}; classified as SEND_STALLED. */
export const SendStalledMessage = "SEND_STALLED";

/**
 * Thrown when a send makes no progress for longer than the allowed idle window.
 */
export class SendStalledError extends Error {
    public constructor(idleMs: number) {
        super(`${SendStalledMessage}: no progress for ${idleMs} ms`);
        this.name = "SendStalledError";
    }
}

/**
 * Runs a task that reports progress and fails it when progress stops.
 * The task receives an abort signal, cancelled on stall, and a `touch` callback
 * that resets the idle window. The returned promise always settles, even when
 * the task ignores the signal.
 *
 * @param task - Work to run; call `touch` whenever it makes progress.
 * @param idleMs - Longest allowed gap between progress reports.
 */
export function runWithStallGuard<T>(
    task: (signal: AbortSignal, touch: () => void) => Promise<T>,
    idleMs: number
): Promise<T> {
    const controller = new AbortController();

    return new Promise<T>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        let settled = false;

        const finish = (): void => {
            settled = true;

            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        };

        const touch = (): void => {
            if (settled) {
                return;
            }

            if (timer) {
                clearTimeout(timer);
            }

            timer = setTimeout(() => {
                const error = new SendStalledError(idleMs);

                finish();
                controller.abort(error);
                reject(error);
            }, idleMs);
        };

        touch();

        task(controller.signal, touch).then(
            (value) => {
                if (!settled) {
                    finish();
                    resolve(value);
                }
            },
            (err: unknown) => {
                if (!settled) {
                    finish();
                    reject(err);
                }
            }
        );
    });
}
