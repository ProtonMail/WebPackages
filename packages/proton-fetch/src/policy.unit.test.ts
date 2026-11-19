import { describe, expect, it } from "vitest";
import { defaultRetryPolicy, retryDelays } from "./policy.ts";

const noJitter = () => 0;

describe("retryDelays", () => {
    it("starts at minDelayMs and multiplies up to maxDelayMs", () => {
        const policy = { ...defaultRetryPolicy, maxRetries: 7 };
        expect([...retryDelays(policy, noJitter)]).toEqual([
            1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000,
        ]);
    });

    it("adds delayIncrementMs before multiplying", () => {
        const policy = {
            ...defaultRetryPolicy,
            maxRetries: 6,
            maxDelayMs: 4_000,
            delayIncrementMs: 1_000,
            delayMultiplier: 1,
        };
        expect([...retryDelays(policy, noJitter)]).toEqual([
            1_000, 2_000, 3_000, 4_000, 4_000, 4_000,
        ]);
    });

    it("adds up to jitterMs to each delay", () => {
        expect([...retryDelays(defaultRetryPolicy, () => 0.5)]).toEqual([
            2_500, 3_500, 5_500,
        ]);
    });

    it("yields nothing when maxRetries is 0", () => {
        expect([
            ...retryDelays({ ...defaultRetryPolicy, maxRetries: 0 }),
        ]).toEqual([]);
    });
});
