import { describe, it, expect } from "vitest";
import { argon2 } from "../../../src/pmcrypto/index.ts";
import { ARGON2_PARAMS } from "../../../src/pmcrypto/constants.ts";

describe("argon2 key derivation", () => {
    it("basic test - minimum recommended params", async () => {
        const expected =
            "6904f1422410f8360c6538300210a2868f5e80cd88606ec7d6e7e93b49983cea";
        const passwordBytes = Uint8Array.fromHex(
            "0101010101010101010101010101010101010101010101010101010101010101",
        );
        const tag = await argon2({
            password: new TextDecoder().decode(passwordBytes),
            salt: Uint8Array.fromHex(
                "0202020202020202020202020202020202020202020202020202020202020202",
            ),
            params: ARGON2_PARAMS.MINIMUM,
        });
        expect(tag.toHex()).to.equal(expected);
    });
});
