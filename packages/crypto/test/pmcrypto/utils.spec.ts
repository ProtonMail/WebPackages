import { describe, it, expect } from "vitest";
import { isStream, readToEnd } from "@openpgp/web-stream-tools";
import {
    streamedUint8ArrayToUtf8String,
    streamedUtf8StringToUint8Array,
} from "../../src/pmcrypto/utils.ts";
import type { Data } from "../../src/pmcrypto/index.ts";

const streamFromChunks = <T extends Data>(chunks: T[]) => {
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

describe("utils", () => {
    it("streamedUtf8StringToUint8Array - it can encode a stream", async () => {
        const stringStream = streamFromChunks(["hello", " ", "world"]);
        const encoded = streamedUtf8StringToUint8Array(stringStream);
        expect(isStream(encoded)).toBeTruthy();
        expect(await readToEnd(encoded)).to.deep.equal(
            Uint8Array.fromHex("68656c6c6f20776f726c64"),
        );
    });

    it("streamedUint8ArrayToUtf8String - it can decode a stream", async () => {
        const utf8Stream = streamFromChunks(
            ["68656c6c6f", "20776f726c64"].map((hex) =>
                Uint8Array.fromHex(hex),
            ),
        );
        const decoded = streamedUint8ArrayToUtf8String(utf8Stream);
        expect(isStream(decoded)).to.not.be.false;
        expect(await readToEnd(decoded)).to.equal("hello world");
    });

    it("streamedUint8ArrayToUtf8String - it can decode a stream with utf8 chars across chunks", async () => {
        const utf8Stream = streamFromChunks(
            ["f09f", "9982"].map((hex) => Uint8Array.fromHex(hex)),
        );
        const decoded = streamedUint8ArrayToUtf8String(utf8Stream);
        expect(isStream(decoded)).to.not.be.false;
        expect(await readToEnd(decoded)).to.equal("🙂");
    });

    it("streamedUint8ArrayToUtf8String - it does not ignore a trailing partial utf8 char", async () => {
        const utf8Stream = streamFromChunks(
            ["f09f", "9982", "f09f"].map((hex) => Uint8Array.fromHex(hex)),
        ); // emoji + half emoji
        const decoded = streamedUint8ArrayToUtf8String(utf8Stream);
        expect(isStream(decoded)).to.not.be.false;
        expect(await readToEnd(decoded)).to.equal("🙂\uFFFD");
    });
});
