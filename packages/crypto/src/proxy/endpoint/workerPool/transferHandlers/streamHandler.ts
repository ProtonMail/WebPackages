/* eslint-disable @typescript-eslint/no-explicit-any */
type Data = Uint8Array<ArrayBuffer> | string;
type ChunkWithData<T> = { done: true } | { done: false; value: T };
const STREAM_CONTROL_TYPE = {
    READ: "READ",
    CANCEL: "CANCEL",
} as const;
const STREAM_DATA_TYPE = {
    CHUNK: "CHUNK",
    ERROR: "ERROR",
} as const;
/**
 * Transfer a readable stream chunk by chunk using message channels.
 * Both byte and string streams are supported.
 */
export const ReadableStreamSerializer = {
    canHandle: (obj: any): obj is ReadableStream<Data> =>
        typeof obj === "object" && obj.getReader,
    serialize: (
        readableStream: ReadableStream<Data>,
    ): MessagePort => {
        const { port1, port2 } = new MessageChannel();

        // wait to get the reader until the first chunk is requested
        let reader: ReadableStreamDefaultReader<Data> | null = null;

        port1.onmessage = async ({ data: { type } }: { data: { type: keyof typeof STREAM_CONTROL_TYPE }}) => {
            switch (type) {
                case STREAM_CONTROL_TYPE.READ: {
                    reader ??= readableStream.getReader();
                    const result = await reader.read()
                        .then(chunk => ({ type: STREAM_DATA_TYPE.CHUNK, chunk }))
                        .catch((error: unknown) => ({
                            type: STREAM_DATA_TYPE.ERROR,
                            // ensure error can be structured-cloned, otherwise postMessage below will throw
                            error: new Error(error instanceof Error ? error.message : String(error)),
                        }));
                    port1.postMessage(result, []); // no transferables: unsafe even byte chunks from the worker side

                    if (result.type === STREAM_DATA_TYPE.ERROR || result.chunk.done) {
                        port1.close();
                    }
                    break;
                }
                case STREAM_CONTROL_TYPE.CANCEL:
                    if (reader) {
                        void reader.cancel().catch(() => {});
                    } else {
                        void readableStream.cancel().catch(() => {});
                    }
                    port1.close();
                    break;
                default:
                    throw new Error("Unknown stream transfer control type");
            }
        };

        // Transfer the message channel to the caller's execution context
        return port2; // NB: the port is transferable and must be transferred
    },
    getTransferables: (port: MessagePort): Transferable[] => [port],
    deserialize: (port: MessagePort): ReadableStream<Data> => {
        // Convenience function to allow us to use async/await for messages coming down the port
        const nextPortMessage = () =>
            new Promise<ChunkWithData<Data>>((resolve, reject) => {
                port.onmessage = ({ data }: {
                    data: { type: typeof STREAM_DATA_TYPE.CHUNK, chunk: ChunkWithData<Data> } | { type: typeof STREAM_DATA_TYPE.ERROR, error: Error };
                }) => {
                    switch (data.type) {
                        case STREAM_DATA_TYPE.CHUNK:
                            resolve(data.chunk);
                            break;
                        case STREAM_DATA_TYPE.ERROR:
                            reject(data.error);
                            break;
                        default:
                            throw new Error("Unknown stream transfer data type");
                    }

                };
                /**
                 * onmessageerror fires on deserialization issues, and should be unreachable given the current logic.
                 * We guard it anyway to avoid the reconstructed stream hanging if it fires.
                 */
                port.onmessageerror = () => reject(new Error("Failed to deserialize stream chunk"));
            });

        // Minimal proxy reader
        const portReader = {
            read: () => {
                port.postMessage({ type: STREAM_CONTROL_TYPE.READ });
                // promise that will resolve with the chunk returned by the remote reader
                return nextPortMessage();
            },

            cancel: () => {
                port.postMessage({ type: STREAM_CONTROL_TYPE.CANCEL });
            },
        };

        const reconstructedStream = new ReadableStream<Data>({
            async pull(controller) {
                try {
                    const chunk = await portReader.read();
                    // When no more data needs to be consumed, close the stream and release the channel
                    if (chunk.done) {
                        controller.close();
                        port.close();
                        return;
                    }
                    // Enqueue the next data chunk into our target stream
                    controller.enqueue(chunk.value);
                } catch (error) {
                    // on read's error, we need to close the channel
                    port.close();
                    throw error;
                }
            },
            cancel() {
                portReader.cancel();
                port.close();
            },
        });

        // // TODO? (not needed for now): make it iterable so it can be used in for-await-of statement
        // reconstructedStream[Symbol.asyncIterator] = () => portReader;

        return reconstructedStream;
    },
};

export type SerializeWebStreamTypes<T> = {
    [I in keyof T]: T[I] extends ReadableStream<Data> | undefined
        ? MessagePort
        : T[I];
};
