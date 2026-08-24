import { describe, it, expect } from "vitest";
import { getIsMidnight } from "./midnight.ts";

describe("midnight", () => {
    describe("getIsMidnight", () => {
        it("returns true for exactly midnight (00:00:00.000)", () => {
            expect(getIsMidnight(new Date(2024, 0, 15, 0, 0, 0, 0))).toBe(true);
        });

        it("returns false when hours differ from midnight", () => {
            expect(getIsMidnight(new Date(2024, 0, 15, 1, 0, 0, 0))).toBe(
                false,
            );
        });

        it("returns false when minutes differ from midnight", () => {
            expect(getIsMidnight(new Date(2024, 0, 15, 0, 1, 0, 0))).toBe(
                false,
            );
        });

        it("returns false when seconds differ from midnight", () => {
            expect(getIsMidnight(new Date(2024, 0, 15, 0, 0, 1, 0))).toBe(
                false,
            );
        });

        it("returns false when milliseconds differ from midnight", () => {
            expect(getIsMidnight(new Date(2024, 0, 15, 0, 0, 0, 1))).toBe(
                false,
            );
        });

        it("returns false for 1ms before midnight", () => {
            expect(getIsMidnight(new Date(2024, 0, 15, 23, 59, 59, 999))).toBe(
                false,
            );
        });
    });
});
