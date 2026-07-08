import { readToEnd } from "@openpgp/web-stream-tools";
import { describe, expect, it } from "vitest";

import { ReadableStreamSerializer } from "../../../../src/proxy/endpoint/workerPool/transferHandlers/streamHandler.ts";
import { chunkUint8Array, streamFromChunks } from "../../../streamingHelpers.ts";

describe("transferHandlers", () => {
    describe("ReadableStreamSerializer", () => {
        it("transfers a byte stream", async () => {
            const data: Uint8Array<ArrayBuffer> = new Uint8Array([1, 2, 3, 4, 5]);
            const source = streamFromChunks(chunkUint8Array(data, 2));

            const serialized = ReadableStreamSerializer.serialize(source);
            expect(serialized).toBeInstanceOf(MessagePort);
            const transferred = ReadableStreamSerializer.deserialize(serialized);
            expect(await readToEnd(transferred)).toEqual(data);
        });

        it("transfers a string stream", async () => {
            const source = streamFromChunks(["hello ", "world"]);

            const serialized = ReadableStreamSerializer.serialize(source);
            expect(serialized).toBeInstanceOf(MessagePort);
            const transferred = ReadableStreamSerializer.deserialize(serialized);
            expect(await readToEnd(transferred)).toBe("hello world");
        });

        it("transfers an empty stream", async () => {
            const source = streamFromChunks<Uint8Array<ArrayBuffer>>([]);

            const serialized = ReadableStreamSerializer.serialize(source);
            expect(serialized).toBeInstanceOf(MessagePort);
            const transferred = ReadableStreamSerializer.deserialize(serialized);
            expect(await transferred.getReader().read()).toEqual({ done: true, value: undefined });
        });

        it("propagates a source stream error to the transferred side", async () => {
            let pulled = false;
            const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
                pull(controller) {
                    if (!pulled) {
                        // test that pre-error streamed chunks are still readable
                        controller.enqueue(new Uint8Array([1, 2]));
                        pulled = true;
                    } else {
                        controller.error(new Error("source stream error"));
                    }
                },
            });

            const serialized = ReadableStreamSerializer.serialize(source);
            expect(serialized).toBeInstanceOf(MessagePort);
            const transferred = ReadableStreamSerializer.deserialize(serialized) as ReadableStream<Uint8Array<ArrayBuffer>>;
            const reader = transferred.getReader();
            const { value: chunk } = await reader.read();
            expect(chunk?.toHex()).toEqual("0102");
            await expect(reader.read()).rejects.toThrow("source stream error");
        });

        it("propagates cancellation from the transferred side back to the source", async () => {
            const { promise: cancelled, resolve: resolveCancelled } = Promise.withResolvers<"cancelled">();
            const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
                pull(controller) {
                    controller.enqueue(new Uint8Array([1, 2]));
                },
                cancel() {
                    resolveCancelled("cancelled");
                },
            });

            const serialized = ReadableStreamSerializer.serialize(source);
            expect(serialized).toBeInstanceOf(MessagePort);
            const transferred = ReadableStreamSerializer.deserialize(serialized) as ReadableStream<Uint8Array<ArrayBuffer>>;
            const transferredReader = transferred.getReader();
            const { value: chunk } = await transferredReader.read();
            expect(chunk?.toHex()).toEqual("0102");

            await transferredReader.cancel();

            await expect(cancelled).resolves.toBe("cancelled");
        });

        it("cancels the source when the transferred side is cancelled before reading", async () => {
            const { promise: cancelledPromise, resolve: resolveCancelled } = Promise.withResolvers<"cancelled">();
            const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
                cancel() {
                    resolveCancelled("cancelled");
                },
            });

            const serialized = ReadableStreamSerializer.serialize(source);
            expect(serialized).toBeInstanceOf(MessagePort);
            const transferred = ReadableStreamSerializer.deserialize(serialized);
            expect(transferred).toBeInstanceOf(ReadableStream);

            await transferred.cancel(); // cancel before reading

            await expect(cancelledPromise).resolves.toBe("cancelled");
        });
    });
});
