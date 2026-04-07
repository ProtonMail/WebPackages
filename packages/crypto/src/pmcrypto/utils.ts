import type { WebStream } from "./pmcrypto";

export type MaybeArray<T> = T | Array<T>;

/**
 * Convert a native javascript string to a Uint8Array of utf8 bytes
 * @param str - The string to convert
 * @returns A valid squence of utf8 bytes.
 */
export function streamedUtf8StringToUint8Array(
    str: WebStream<string>,
): WebStream<Uint8Array<ArrayBuffer>> {
    const reader = str.getReader();
    const encoder = new TextEncoder();
    const transformedStream: WebStream<Uint8Array<ArrayBuffer>> =
        new ReadableStream<Uint8Array<ArrayBuffer>>({
            async pull(controller) {
                const { value, done } = await reader.read();

                if (done) {
                    controller.close();
                } else {
                    controller.enqueue(encoder.encode(value));
                }
            },
            cancel() {
                return reader.cancel();
            },
        });

    return transformedStream;
}

/**
 * Convert a Uint8Array of utf8 bytes to a native javascript string
 * @param utf8 - A valid squence of utf8 bytes
 * @returns A native javascript string.
 */
export function streamedUint8ArrayToUtf8String(
    utf8: WebStream<Uint8Array<ArrayBuffer>>,
): WebStream<string> {
    const reader = utf8.getReader();
    const decoder = new TextDecoder();
    const transformedStream: WebStream<string> = new ReadableStream<string>({
        async pull(controller) {
            const { value, done } = await reader.read();

            if (done) {
                controller.enqueue(
                    decoder.decode(new Uint8Array(), { stream: false }), // flush any remaining partial char
                );
                controller.close();
            } else {
                controller.enqueue(
                    decoder.decode(value, { stream: true }), // handle chars spread across chunks
                );
            }
        },
        cancel() {
            return reader.cancel();
        },
    });

    return transformedStream;
}

/**
 * Normalise date to compare it to other OpenPGP timestamps
 * @param time - date to normalise
 * @returns date with reduced precision (seconds)
 */
export const normalizeDate = (time: Date) =>
    new Date(Math.floor(+time / 1000) * 1000);
