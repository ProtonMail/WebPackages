import { describe, expect, it } from "vitest";
import { computeKeyPassword, generateKeySalt } from "../../src/srp/keys.ts";

describe("passwords", () => {
    it("should generate key salt", () => {
        const salt = generateKeySalt();
        expect(salt.length).toBe(24);
    });

    it("should compute key password", async () => {
        const keyp = await computeKeyPassword("hello", "ajHO5Xshwb9h9DcAExIkbg==");
        expect(keyp).toBe("vQp4euSvXpBygefcOfyhCbWmFgFmgeW");
    });

    it("should throw without a salt", async () => {
        // @ts-expect-error
        const promise = computeKeyPassword("hello");
        await expect(promise).rejects.toMatchObject({
            name: "Error",
            message: "Password and salt required.",
        });
    });

    it("should throw without a password", async () => {
        // @ts-expect-error
        const promise = computeKeyPassword(undefined, "ajHO5Xshwb9h9DcAExIkbg==");
        await expect(promise).rejects.toMatchObject({
            name: "Error",
            message: "Password and salt required.",
        });
    });
});
