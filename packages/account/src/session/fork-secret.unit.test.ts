import { describe, it, expect, afterEach, vi } from "vitest";
import { generateForkSecret } from "./fork-secret.ts";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("generateForkSecret", () => {
    it("returns a fork secret and its SHA-256 as the fork challenge", async () => {
        vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
            if (array instanceof Uint8Array) {
                array.fill(0x11);
            }
            return array;
        });

        const { forkSecret, forkChallenge } = await generateForkSecret();

        expect(forkSecret).toBe("11".repeat(32));
        // Matches the API's hash('sha256', $secret) of the secret as sent
        expect(forkChallenge).toBe(
            "3138bb9bc78df27c473ecfd1410f7bd45ebac1f59cf3ff9cfe4db77aab7aedd3",
        );
    });

    it("generates a new 32 byte fork secret every time", async () => {
        const forkSecrets = [
            await generateForkSecret(),
            await generateForkSecret(),
        ];

        expect(forkSecrets[0]?.forkSecret).toMatch(/^[0-9a-f]{64}$/);
        expect(forkSecrets[1]?.forkSecret).toMatch(/^[0-9a-f]{64}$/);
        expect(forkSecrets[0]?.forkSecret).not.toBe(forkSecrets[1]?.forkSecret);
        expect(forkSecrets[0]?.forkChallenge).toMatch(/^[0-9a-f]{64}$/);
        expect(forkSecrets[0]?.forkChallenge).not.toBe(
            forkSecrets[1]?.forkChallenge,
        );
    });
});
