import { describe, it, expect } from "vitest";
import { isDateWithinRange } from "./dateRange.ts";

describe("dateRange", () => {
    describe("isDateWithinRange", () => {
        const rangeStart = new Date(2026, 2, 4, 0, 0);
        const rangeEnd = new Date(2026, 2, 4, 23, 59, 59, 999);

        it("returns true when date is inside the range", () => {
            expect(
                isDateWithinRange(new Date(2026, 2, 4, 12), [
                    rangeStart,
                    rangeEnd,
                ]),
            ).toBe(true);
        });

        it("returns false when date is before the range", () => {
            expect(
                isDateWithinRange(new Date(2026, 2, 3, 23, 59), [
                    rangeStart,
                    rangeEnd,
                ]),
            ).toBe(false);
        });

        it("returns false when date is after the range", () => {
            expect(
                isDateWithinRange(new Date(2026, 2, 5, 0, 0), [
                    rangeStart,
                    rangeEnd,
                ]),
            ).toBe(false);
        });
    });
});
