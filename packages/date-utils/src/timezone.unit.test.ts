import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    calendarDayOffset,
    dateFromZonedParts,
    deviceTodayAsUTCMidnight,
    getGMTOffset,
    getHourInTimezone,
    getMinutesSinceMidnightInTimezone,
    getSlotDateFromTime,
    getTimezoneShortLabel,
    getToday,
    getWeekdayInTimezone,
    getZonedParts,
    isNowWeekend,
    isToday,
    toDeviceLocalMidnight,
} from "./timezone";

describe("timezone helpers", () => {
    describe("getGMTOffset", () => {
        it("returns a GMT offset string for a valid timezone", () => {
            expect(getGMTOffset(new Date("2026-01-15T00:00:00Z"), "UTC")).toBe(
                "GMT+0",
            );
        });

        it("returns a positive offset", () => {
            // Europe/Vilnius is EEST (UTC+3) during summer
            expect(
                getGMTOffset(
                    new Date("2026-07-01T00:00:00Z"),
                    "Europe/Vilnius",
                ),
            ).toBe("GMT+3");
        });

        it("returns a negative offset", () => {
            // America/New_York is EDT (UTC-4) during summer
            expect(
                getGMTOffset(
                    new Date("2026-07-01T00:00:00Z"),
                    "America/New_York",
                ),
            ).toBe("GMT-4");
        });

        it("reflects DST change: America/New_York is GMT-5 in winter and GMT-4 in summer", () => {
            expect(
                getGMTOffset(
                    new Date("2026-01-15T00:00:00Z"),
                    "America/New_York",
                ),
            ).toBe("GMT-5");
            expect(
                getGMTOffset(
                    new Date("2026-07-15T00:00:00Z"),
                    "America/New_York",
                ),
            ).toBe("GMT-4");
        });
    });

    describe("getSlotDateFromTime", () => {
        it("returns midnight for slot 0 in UTC", () => {
            const result = getSlotDateFromTime(
                0,
                "UTC",
                new Date("2026-06-16T12:00:00Z"),
            );
            expect(result.toISOString()).toBe("2026-06-16T00:00:00.000Z");
        });

        it("returns 1:00 AM for a 1-hour slot in UTC", () => {
            const result = getSlotDateFromTime(
                3_600_000,
                "UTC",
                new Date("2026-06-16T12:00:00Z"),
            );
            expect(result.toISOString()).toBe("2026-06-16T01:00:00.000Z");
        });

        it("accounts for a positive UTC offset (Pacific/Kiritimati, UTC+14)", () => {
            // refDate 2026-06-16T12:00:00Z = June 17 02:00 in Kiritimati
            // → midnight June 17 Kiritimati = 2026-06-16T10:00:00Z
            // → 1:00 AM Kiritimati = 2026-06-16T11:00:00Z
            const result = getSlotDateFromTime(
                3_600_000,
                "Pacific/Kiritimati",
                new Date("2026-06-16T12:00:00Z"),
            );
            expect(result.toISOString()).toBe("2026-06-16T11:00:00.000Z");
        });

        it("accounts for a negative UTC offset (America/Araguaina, UTC-3)", () => {
            // refDate 2026-06-16T12:00:00Z = June 16 09:00 in Araguaina
            // → midnight June 16 Araguaina = 2026-06-16T03:00:00Z
            // → 1:00 AM Araguaina = 2026-06-16T04:00:00Z
            const result = getSlotDateFromTime(
                3_600_000,
                "America/Araguaina",
                new Date("2026-06-16T12:00:00Z"),
            );
            expect(result.toISOString()).toBe("2026-06-16T04:00:00.000Z");
        });

        it("uses the calendar day of refDate in the target timezone, not the UTC day", () => {
            // 2026-06-16T23:00:00Z is June 16 UTC but already June 17 in Kiritimati (+14)
            // → midnight June 17 Kiritimati = 2026-06-16T10:00:00Z
            const result = getSlotDateFromTime(
                0,
                "Pacific/Kiritimati",
                new Date("2026-06-16T23:00:00Z"),
            );
            expect(result.toISOString()).toBe("2026-06-16T10:00:00.000Z");
        });
    });

    describe("getTimezoneShortLabel", () => {
        it("returns first 3 chars for a single-word city", () => {
            expect(getTimezoneShortLabel("Europe/London")).toBe("Lon");
        });

        it("returns acronym for a multi-word city", () => {
            expect(getTimezoneShortLabel("Asia/Ho_Chi_Minh")).toBe("HCM");
        });

        it("returns acronym for a two-word city in a deep path", () => {
            expect(getTimezoneShortLabel("America/Argentina/La_Rioja")).toBe(
                "LR",
            );
        });

        it("handles UTC with no slash", () => {
            expect(getTimezoneShortLabel("UTC")).toBe("UTC");
        });
    });

    describe("getZonedParts", () => {
        const locale = "en-US";

        it("decomposes a UTC instant into correct calendar parts", () => {
            const date = new Date("2026-05-12T15:30:45Z");
            const parts = getZonedParts(date, locale, "UTC");
            expect(parts).toEqual({
                year: 2026,
                month: 5,
                day: 12,
                hours: 15,
                minutes: 30,
                seconds: 45,
            });
        });

        it("reflects the wall clock in a timezone ahead of UTC", () => {
            // UTC 2026-05-12T22:00:00Z = May 13 07:00 in Asia/Tokyo (UTC+9)
            const date = new Date("2026-05-12T22:00:00Z");
            const parts = getZonedParts(date, locale, "Asia/Tokyo");
            expect(parts.year).toBe(2026);
            expect(parts.month).toBe(5);
            expect(parts.day).toBe(13);
            expect(parts.hours).toBe(7); // UTC+9
        });

        it("reflects the wall clock in a timezone behind UTC", () => {
            // UTC 2026-05-12T02:00:00Z = May 11 21:00 in America/New_York (UTC-5 in winter, but May = UTC-4)
            const date = new Date("2026-05-12T02:00:00Z");
            const parts = getZonedParts(date, locale, "America/New_York");
            expect(parts.year).toBe(2026);
            expect(parts.month).toBe(5);
            expect(parts.day).toBe(11);
            expect(parts.hours).toBe(22); // UTC-4 in May
        });

        it("normalises hour 24 to 0 at midnight", () => {
            // Some JS engines emit "24" for midnight; test the normalisation path
            // by picking a midnight UTC instant and checking hours is 0.
            const date = new Date("2026-05-12T00:00:00Z");
            const parts = getZonedParts(date, locale, "UTC");
            expect(parts.hours).toBe(0);
        });
    });

    describe("dateFromZonedParts", () => {
        const locale = "en-US";

        it("round-trips through getZonedParts in UTC", () => {
            const result = dateFromZonedParts(
                2026,
                5,
                12,
                15,
                30,
                locale,
                "UTC",
            );
            const parts = getZonedParts(result, locale, "UTC");
            expect(parts.year).toBe(2026);
            expect(parts.month).toBe(5);
            expect(parts.day).toBe(12);
            expect(parts.hours).toBe(15);
            expect(parts.minutes).toBe(30);
        });

        it("round-trips through getZonedParts in a positive-offset timezone", () => {
            const result = dateFromZonedParts(
                2026,
                5,
                13,
                8,
                0,
                locale,
                "Asia/Tokyo",
            );
            const parts = getZonedParts(result, locale, "Asia/Tokyo");
            expect(parts.year).toBe(2026);
            expect(parts.month).toBe(5);
            expect(parts.day).toBe(13);
            expect(parts.hours).toBe(8);
            expect(parts.minutes).toBe(0);
        });

        it("round-trips through getZonedParts in a negative-offset timezone", () => {
            const result = dateFromZonedParts(
                2026,
                5,
                11,
                22,
                0,
                locale,
                "America/New_York",
            );
            const parts = getZonedParts(result, locale, "America/New_York");
            expect(parts.year).toBe(2026);
            expect(parts.month).toBe(5);
            expect(parts.day).toBe(11);
            expect(parts.hours).toBe(22);
            expect(parts.minutes).toBe(0);
        });

        it("resolves correctly across a DST spring-forward boundary", () => {
            // America/New_York springs forward at 2026-03-08T02:00 local → 03:00
            // 02:30 doesn't exist; dateFromZonedParts should resolve to 03:30 (post-gap)
            const result = dateFromZonedParts(
                2026,
                3,
                8,
                2,
                30,
                locale,
                "America/New_York",
            );
            const parts = getZonedParts(result, locale, "America/New_York");
            // The requested wall-clock time falls in the gap, so the resolved hour
            // will be shifted into valid territory (03:30).
            expect(parts.day).toBe(8);
            expect(parts.minutes).toBe(30);
        });
    });

    describe("calendarDayOffset", () => {
        const locale = "en-US";

        it("returns 0 when both dates fall on the same calendar day", () => {
            const date = new Date("2026-05-12T10:00:00Z");
            const dateToCompare = new Date("2026-05-12T20:00:00Z");
            expect(calendarDayOffset(date, dateToCompare, locale, "UTC")).toBe(
                0,
            );
        });

        it("returns 1 when dateToCompare is one day ahead", () => {
            const date = new Date("2026-05-12T10:00:00Z");
            const dateToCompare = new Date("2026-05-13T10:00:00Z");
            expect(calendarDayOffset(date, dateToCompare, locale, "UTC")).toBe(
                1,
            );
        });

        it("returns a negative value when dateToCompare is before date", () => {
            const date = new Date("2026-05-12T10:00:00Z");
            const dateToCompare = new Date("2026-05-11T10:00:00Z");
            expect(calendarDayOffset(date, dateToCompare, locale, "UTC")).toBe(
                -1,
            );
        });

        it("returns the correct offset for multiple days apart", () => {
            const date = new Date("2026-05-10T10:00:00Z");
            const dateToCompare = new Date("2026-05-15T10:00:00Z");
            expect(calendarDayOffset(date, dateToCompare, locale, "UTC")).toBe(
                5,
            );
        });

        it("uses the timezone to determine the calendar day boundary", () => {
            // UTC 2026-05-12T23:00:00Z = May 12 in UTC, but May 12 19:00 in America/New_York (UTC-4)
            // UTC 2026-05-13T01:00:00Z = May 13 in UTC, but May 12 21:00 in America/New_York
            // In UTC: different days (offset = 1); in New York: same day (offset = 0)
            const date = new Date("2026-05-12T23:00:00Z");
            const dateToCompare = new Date("2026-05-13T01:00:00Z");
            expect(calendarDayOffset(date, dateToCompare, locale, "UTC")).toBe(
                1,
            );
            expect(
                calendarDayOffset(
                    date,
                    dateToCompare,
                    locale,
                    "America/New_York",
                ),
            ).toBe(0);
        });

        it("handles a timezone ahead of UTC crossing midnight", () => {
            // UTC 2026-05-12T22:00:00Z = May 13 07:00 in Asia/Tokyo (UTC+9)
            // UTC 2026-05-13T08:00:00Z = May 13 17:00 in Asia/Tokyo
            // Both are May 13 in Tokyo → offset = 0
            const date = new Date("2026-05-12T22:00:00Z");
            const dateToCompare = new Date("2026-05-13T08:00:00Z");
            expect(
                calendarDayOffset(date, dateToCompare, locale, "Asia/Tokyo"),
            ).toBe(0);
        });
    });

    describe("getToday", () => {
        const locale = "en-US";

        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it("returns the correct date in UTC", () => {
            vi.setSystemTime(new Date("2026-05-12T10:00:00Z"));
            const today = getToday(locale, "UTC");
            expect(today.getFullYear()).toBe(2026);
            expect(today.getMonth()).toBe(4); // May
            expect(today.getDate()).toBe(12);
        });

        it("returns the next day when the calendar timezone is ahead of UTC", () => {
            // UTC 2026-05-11T23:00:00Z = May 12 in UTC+14 (Pacific/Kiritimati)
            vi.setSystemTime(new Date("2026-05-11T23:00:00Z"));
            const today = getToday(locale, "Pacific/Kiritimati");
            expect(today.getFullYear()).toBe(2026);
            expect(today.getMonth()).toBe(4); // May
            expect(today.getDate()).toBe(12);
        });

        it("returns the previous day when the calendar timezone is behind UTC", () => {
            // UTC 2026-05-12T01:00:00Z = May 11 in UTC-12 (Etc/GMT+12)
            vi.setSystemTime(new Date("2026-05-12T01:00:00Z"));
            const today = getToday(locale, "Etc/GMT+12");
            expect(today.getFullYear()).toBe(2026);
            expect(today.getMonth()).toBe(4); // May
            expect(today.getDate()).toBe(11);
        });

        it("returns a Date whose local getters match the calendar-timezone day", () => {
            // UTC 2026-05-11T23:30:00Z = May 12 in Pacific/Kiritimati (+14)
            vi.setSystemTime(new Date("2026-05-11T23:30:00Z"));
            const today = getToday(locale, "Pacific/Kiritimati");
            // Local getters must return May 12 so isSameDay comparisons work correctly
            expect(today.getDate()).toBe(12);
        });
    });

    describe("isToday", () => {
        const locale = "en-US";

        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it("returns true for the current calendar date in UTC", () => {
            vi.setSystemTime(new Date("2026-05-12T10:00:00Z"));
            expect(
                isToday(new Date("2026-05-12T00:00:00Z"), locale, "UTC"),
            ).toBe(true);
        });

        it("returns false for a different calendar date", () => {
            vi.setSystemTime(new Date("2026-05-12T10:00:00Z"));
            expect(
                isToday(new Date("2026-05-11T00:00:00Z"), locale, "UTC"),
            ).toBe(false);
        });

        it("returns true when the same instant falls on today in the given timezone but not in UTC", () => {
            // UTC 2026-05-11T23:00:00Z = May 12 in UTC+14 (Pacific/Kiritimati)
            vi.setSystemTime(new Date("2026-05-11T23:00:00Z"));
            expect(
                isToday(
                    new Date("2026-05-11T23:00:00Z"),
                    locale,
                    "Pacific/Kiritimati",
                ),
            ).toBe(true);
        });

        it("returns false when comparing across a UTC day boundary that isn't today in the given timezone", () => {
            // "Now" is May 12 in Pacific/Kiritimati (UTC+14), but the compared date is still May 11 there
            vi.setSystemTime(new Date("2026-05-11T23:00:00Z"));
            expect(
                isToday(
                    new Date("2026-05-11T09:00:00Z"),
                    locale,
                    "Pacific/Kiritimati",
                ),
            ).toBe(false);
        });
    });

    describe("deviceTodayAsUTCMidnight", () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it("returns UTC midnight for the device-local calendar date", () => {
            vi.setSystemTime(new Date("2026-05-12T10:30:00Z"));
            const result = deviceTodayAsUTCMidnight();
            expect(result.toISOString()).toBe("2026-05-12T00:00:00.000Z");
        });
    });

    describe("toDeviceLocalMidnight", () => {
        it("converts a UTC midnight date to device-local midnight", () => {
            const utcMidnight = new Date("2026-05-12T00:00:00.000Z");
            const result = toDeviceLocalMidnight(utcMidnight);
            expect(result.getFullYear()).toBe(2026);
            expect(result.getMonth()).toBe(4); // May
            expect(result.getDate()).toBe(12);
            expect(result.getHours()).toBe(0);
            expect(result.getMinutes()).toBe(0);
            expect(result.getSeconds()).toBe(0);
        });
    });

    describe("getHourInTimezone", () => {
        it("should return the expected hour in UTC", () => {
            const hours = getHourInTimezone({
                date: new Date(Date.UTC(2026, 2, 4, 12)),
                locale: "en-US",
                timeZone: "UTC",
            });
            expect(hours).toEqual(12);
        });

        it("should return the expected hour in another timezone", () => {
            const hours = getHourInTimezone({
                date: new Date(Date.UTC(2026, 2, 4, 12)),
                locale: "en-US",
                timeZone: "Europe/Paris",
            });
            expect(hours).toEqual(13);
        });

        it("should return 0 for midnight", () => {
            const hours = getHourInTimezone({
                date: new Date(Date.UTC(2026, 2, 4, 0)),
                locale: "en-US",
                timeZone: "UTC",
            });
            expect(hours).toEqual(0);
        });
    });

    describe("getMinutesSinceMidnightInTimezone", () => {
        it("should return 0 minutes for midnight", () => {
            expect(
                getMinutesSinceMidnightInTimezone({
                    date: new Date(Date.UTC(2026, 2, 4, 0, 0)),
                    locale: "en-US",
                    timeZone: "UTC",
                }),
            ).toEqual(0);
        });

        it("should returns expected minutes for a time in UTC", () => {
            expect(
                getMinutesSinceMidnightInTimezone({
                    date: new Date(Date.UTC(2026, 2, 4, 13, 37)),
                    locale: "en-US",
                    timeZone: "UTC",
                }),
            ).toEqual(13 * 60 + 37);
        });

        it("should return the expected minutes when the target timezone has an offset", () => {
            expect(
                getMinutesSinceMidnightInTimezone({
                    date: new Date(Date.UTC(2026, 2, 4, 23, 30)),
                    locale: "en-US",
                    timeZone: "Europe/Paris",
                }),
            ).toEqual(30); // 0 * 60 + 30
        });
    });

    describe("getWeekdayInTimezone", () => {
        it("should return the weekday in UTC (0 = Sunday ... 6 = Saturday)", () => {
            // 2026-03-04 is a Wednesday
            expect(
                getWeekdayInTimezone({
                    date: new Date(Date.UTC(2026, 2, 4, 12)),
                    locale: "en-US",
                    timeZone: "UTC",
                }),
            ).toEqual(3);
        });

        it("rolls forward to the next day when the zone crosses midnight", () => {
            // 2026-07-25 23:00 UTC is Saturday, but 01:00 the next day in Paris (Sunday)
            expect(
                getWeekdayInTimezone({
                    date: new Date(Date.UTC(2026, 6, 25, 23)),
                    locale: "en-US",
                    timeZone: "UTC",
                }),
            ).toEqual(6);
            expect(
                getWeekdayInTimezone({
                    date: new Date(Date.UTC(2026, 6, 25, 23)),
                    locale: "en-US",
                    timeZone: "Europe/Paris",
                }),
            ).toEqual(0);
        });

        it("rolls back to the previous day for negative-offset zones", () => {
            // 2026-07-26 02:00 UTC is Sunday, but 22:00 the previous day in New York (Saturday)
            expect(
                getWeekdayInTimezone({
                    date: new Date(Date.UTC(2026, 6, 26, 2)),
                    locale: "en-US",
                    timeZone: "America/New_York",
                }),
            ).toEqual(6);
        });
    });

    describe("isNowWeekend", () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        /** Jan 2024 starts on Monday, meaning that for the following tests
         * 01/01 -> Monday
         * 07/01 -> Sunday
         */
        it("should return true for Saturday (6)", () => {
            vi.setSystemTime(new Date("2024-01-06T10:00:00Z"));
            expect(
                isNowWeekend({
                    now: new Date(),
                    locale: "en-US",
                    timeZone: "UTC",
                }),
            ).toBe(true);
        });

        it("should return true for Sunday (0)", () => {
            vi.setSystemTime(new Date("2024-01-07T10:00:00Z"));
            expect(
                isNowWeekend({
                    now: new Date(),
                    locale: "en-US",
                    timeZone: "UTC",
                }),
            ).toBe(true);
        });

        it("should return false for Monday (1) through Friday (5)", () => {
            for (let day = 1; day <= 5; day++) {
                vi.setSystemTime(new Date(`2024-01-0${day}T10:00:00Z`));
                expect(
                    isNowWeekend({
                        now: new Date(),
                        locale: "en-US",
                        timeZone: "UTC",
                    }),
                ).toBe(false);
            }
        });
    });
});
