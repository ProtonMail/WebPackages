import { describe, it, expect } from "vitest";
import {
    unsafeMD5,
    unsafeSHA1,
    SHA256,
    SHA512,
} from "../../../src/pmcrypto/index.ts";
import { utf8StringToUint8Array } from "../../../src/utils.ts";

describe("hash functions", () => {
    it("md5 basic test", async () => {
        const emptyHash = await unsafeMD5(new Uint8Array([])).then((bytes) =>
            bytes.toHex(),
        );
        const testHash = await unsafeMD5(
            utf8StringToUint8Array(
                "The quick brown fox jumps over the lazy dog",
            ),
        ).then((bytes) => bytes.toHex());
        expect(emptyHash).to.equal("d41d8cd98f00b204e9800998ecf8427e");
        expect(testHash).to.equal("9e107d9d372bb6826bd81d3542a419d6");
    });

    it("sha1 basic test", async () => {
        const emptyHash = await unsafeSHA1(new Uint8Array([])).then((bytes) =>
            bytes.toHex(),
        );
        const testHash = await unsafeSHA1(utf8StringToUint8Array("abc")).then(
            (bytes) => bytes.toHex(),
        );
        expect(emptyHash).to.equal("da39a3ee5e6b4b0d3255bfef95601890afd80709");
        expect(testHash).to.equal("a9993e364706816aba3e25717850c26c9cd0d89d");
    });

    it("sha1 basic test (streaming)", async () => {
        const dataStreamEmpty = new ReadableStream<Uint8Array<ArrayBuffer>>({
            pull: (controller) => {
                controller.enqueue(new Uint8Array());
                controller.close();
            },
        });
        const dataStreamTest = new ReadableStream<Uint8Array<ArrayBuffer>>({
            pull: (controller) => {
                const data = utf8StringToUint8Array("abc");
                for (let i = 0; i < data.length; i++) {
                    controller.enqueue(data.subarray(i, i + 1));
                }
                controller.close();
            },
        });
        const emptyHash = await unsafeSHA1(dataStreamEmpty).then((bytes) =>
            bytes.toHex(),
        );
        const testHash = await unsafeSHA1(dataStreamTest).then((bytes) =>
            bytes.toHex(),
        );
        expect(emptyHash).to.equal("da39a3ee5e6b4b0d3255bfef95601890afd80709");
        expect(testHash).to.equal("a9993e364706816aba3e25717850c26c9cd0d89d");
    });

    it("sha256 basic test", async () => {
        const emptyInput = utf8StringToUint8Array("");
        const emptyDigest = await SHA256(emptyInput).then((bytes) =>
            bytes.toHex(),
        );
        expect(emptyDigest).to.equal(
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        );

        const abcInput = utf8StringToUint8Array("abc");
        const abcDigest = await SHA256(abcInput).then((bytes) => bytes.toHex());
        expect(abcDigest).to.equal(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        );
    });

    it("sha512 basic test", async () => {
        const emptyInput = utf8StringToUint8Array("");
        const emptyDigest = await SHA512(emptyInput).then((bytes) =>
            bytes.toHex(),
        );
        expect(emptyDigest).to.equal(
            "cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e",
        );

        const abcInput = utf8StringToUint8Array("abc");
        const abcDigest = await SHA512(abcInput).then((bytes) => bytes.toHex());
        expect(abcDigest).to.equal(
            "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
        );
    });
});
