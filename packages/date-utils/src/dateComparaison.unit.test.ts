import { describe, it, expect } from "vitest";

import { isSameMinute } from "./dateComparaison";

const LOCALE = "fr-CH";

describe("dateComparaison", () => {
    describe("isSameMinute", () => {
        it("returns true for two dates in the same minute without timezone", () => {
            expect(
                isSameMinute(
                    new Date("2026-06-16T10:30:00Z"),
                    new Date("2026-06-16T10:30:59Z"),
                    LOCALE,
                    "UTC",
                ),
            ).toBe(true);
        });

        it("returns true for two dates in the same minute with timezone", () => {
            // Both instants fall in the 06:30 minute in America/New_York
            expect(
                isSameMinute(
                    new Date("2026-06-16T10:30:00Z"),
                    new Date("2026-06-16T10:30:59Z"),
                    LOCALE,
                    "America/New_York",
                ),
            ).toBe(true);
        });

        it("returns true for the last second of the minute", () => {
            expect(
                isSameMinute(
                    new Date("2026-06-16T10:30:59Z"),
                    new Date("2026-06-16T10:30:00Z"),
                    LOCALE,
                    "UTC",
                ),
            ).toBe(true);
        });

        it("returns false once the minute rolls over", () => {
            expect(
                isSameMinute(
                    new Date("2026-06-16T10:30:59Z"),
                    new Date("2026-06-16T10:31:00Z"),
                    LOCALE,
                    "UTC",
                ),
            ).toBe(false);
        });

        it("returns true for an event in the past few seconds", () => {
            expect(
                isSameMinute(
                    new Date("2026-06-16T10:30:40Z"),
                    new Date("2026-06-16T10:30:55Z"),
                    LOCALE,
                    "UTC",
                ),
            ).toBe(true);
        });

        it("returns false between midnight", () => {
            expect(
                isSameMinute(
                    new Date("2026-06-16T23:59:59Z"),
                    new Date("2026-06-17T00:00:00Z"),
                    LOCALE,
                    "UTC",
                ),
            ).toBe(false);
        });

        it("returns false for another date", () => {
            expect(
                isSameMinute(
                    new Date("2026-06-16T10:30:00Z"),
                    new Date("2026-07-20T10:30:00Z"),
                    LOCALE,
                    "UTC",
                ),
            ).toBe(false);
        });

        it("returns false for the same wall-clock time in different timezones", () => {
            // 10:30 local in UTC vs 10:30 local in UTC+3 (07:30Z): different minutes
            expect(
                isSameMinute(
                    new Date("2026-06-16T10:30:00Z"),
                    new Date("2026-06-16T10:30:00+03:00"),
                    LOCALE,
                    "UTC",
                ),
            ).toBe(false);
        });
    });
});
