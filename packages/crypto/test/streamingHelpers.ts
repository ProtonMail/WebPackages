import type { Data } from "@openpgp/web-stream-tools";

export const chunkUint8Array = (bytes: Uint8Array<ArrayBuffer>, chunkSize: number): Uint8Array<ArrayBuffer>[] => {
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        chunks.push(bytes.subarray(offset, offset + chunkSize).slice());
    }
    return chunks;
};

export const streamFromChunks = <T extends Data>(chunks: T[]) => {
    const it = chunks.values();
    return new ReadableStream<T>({
        pull: (controller) => {
            const { value, done } = it.next();
            if (done) {
                controller.close();
            } else {
                controller.enqueue(value);
            }
        },
    });
};
