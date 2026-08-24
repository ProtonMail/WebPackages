import { describe, expect, it } from "vitest";

import {
    formatDate,
    formatDateParts,
    formatDateWithOrdinal,
    formatEventDateRange,
    formatRelativeTimeRange,
    formatTime,
    toZonedDateString,
    parseDate,
} from "./formatDate.ts";

const dateTime = (
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
) => new Date(Date.UTC(year, month, day, hour, minute));

const dayMonth: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };

describe("formatDate", () => {
    describe("formatDate", () => {
        it("should format a date with the given locale", () => {
            expect(
                formatDate({
                    date: new Date(2026, 3, 22),
                    locale: "en-US",
                    ...dayMonth,
                }),
            ).toBe("April 22");
            expect(
                formatDate({
                    date: new Date(2026, 3, 22),
                    locale: "fr-FR",
                    ...dayMonth,
                }),
            ).toBe("22 avril");
        });
    });

    describe("formatDateWithOrdinal", () => {
        const fullDate: Intl.DateTimeFormatOptions = {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
        };

        it("should append English ordinal suffixes", () => {
            expect(
                formatDateWithOrdinal(new Date(2026, 3, 1), dayMonth, "en-US"),
            ).toBe("April 1st");
            expect(
                formatDateWithOrdinal(new Date(2026, 3, 2), dayMonth, "en-US"),
            ).toBe("April 2nd");
            expect(
                formatDateWithOrdinal(new Date(2026, 3, 3), dayMonth, "en-US"),
            ).toBe("April 3rd");
            expect(
                formatDateWithOrdinal(new Date(2026, 3, 4), dayMonth, "en-US"),
            ).toBe("April 4th");
        });

        it("should handle English edge cases (11th, 12th, 13th, 21st)", () => {
            expect(
                formatDateWithOrdinal(new Date(2026, 3, 11), dayMonth, "en-US"),
            ).toBe("April 11th");
            expect(
                formatDateWithOrdinal(new Date(2026, 3, 12), dayMonth, "en-US"),
            ).toBe("April 12th");
            expect(
                formatDateWithOrdinal(new Date(2026, 3, 13), dayMonth, "en-US"),
            ).toBe("April 13th");
            expect(
                formatDateWithOrdinal(new Date(2026, 3, 21), dayMonth, "en-US"),
            ).toBe("April 21st");
        });

        it("should use 1er for French", () => {
            expect(
                formatDateWithOrdinal(new Date(2026, 0, 1), dayMonth, "fr-FR"),
            ).toBe("1er janvier");
            expect(
                formatDateWithOrdinal(new Date(2026, 0, 2), dayMonth, "fr-FR"),
            ).toBe("2e janvier");
        });

        it("should fall back to plain formatting for unsupported locales", () => {
            expect(
                formatDateWithOrdinal(new Date(2026, 3, 1), fullDate, "de-DE"),
            ).toBe("Mittwoch, 1. April 2026");
            expect(
                formatDateWithOrdinal(new Date(2026, 3, 1), fullDate, "ja-JP"),
            ).toBe("2026年4月1日水曜日");
        });
    });

    // Intl.formatRange is returning strings with spaces (U+2009) and an en-dash (U+2013).
    const normalizeIntl = (s: string) =>
        s
            .replace(/\u2009/g, " ") // thin space → regular space
            .replace(/\u2013/g, "-"); // en-dash → hyphen

    describe("formatTime", () => {
        it("formats h12 on the hour without minutes", () => {
            expect(
                formatTime({
                    date: dateTime(2026, 3, 6, 9, 0),
                    locale: "en-US",
                    timeZone: "UTC",
                    hour12: true,
                }),
            ).toBe("9am");
        });

        it("formats h12 with minutes", () => {
            expect(
                formatTime({
                    date: dateTime(2026, 3, 6, 9, 30),
                    locale: "en-US",
                    timeZone: "UTC",
                    hour12: true,
                }),
            ).toBe("9:30am");
        });

        it("formats h24 on the hour with minutes shown", () => {
            expect(
                formatTime({
                    date: dateTime(2026, 3, 6, 9, 0),
                    locale: "en-US",
                    timeZone: "UTC",
                    hour12: false,
                }),
            ).toBe("09:00");
        });

        it("formats h24 with minutes", () => {
            expect(
                formatTime({
                    date: dateTime(2026, 3, 6, 9, 30),
                    locale: "en-US",
                    timeZone: "UTC",
                    hour12: false,
                }),
            ).toBe("09:30");
        });
    });

    describe("formatEventDateRange", () => {
        it("formats a timed event with start only", () => {
            expect(
                formatEventDateRange({
                    start: dateTime(2026, 3, 6, 2, 0),
                    end: undefined,
                    allDay: false,
                    locale: "en-US",
                    hour12: false,
                    timeZone: "UTC",
                }),
            ).toBe("Mon, Apr 6, 2026, 02:00");
        });

        it("formats a timed range", () => {
            expect(
                normalizeIntl(
                    formatEventDateRange({
                        start: dateTime(2026, 3, 6, 2, 0),
                        end: dateTime(2026, 3, 6, 3, 0),
                        allDay: false,
                        locale: "en-US",
                        hour12: false,
                        timeZone: "UTC",
                    }),
                ),
            ).toBe("Mon, Apr 6, 2026, 02:00 - 03:00");
        });

        it("formats a zero-duration event with h24", () => {
            const date = dateTime(2026, 3, 6, 2, 0);
            expect(
                formatEventDateRange({
                    start: date,
                    end: date,
                    allDay: false,
                    locale: "en-US",
                    hour12: false,
                    timeZone: "UTC",
                }),
            ).toBe("Mon, Apr 6, 2026, 02:00 - 02:00");
        });

        it("formats a zero-duration event with h12", () => {
            const date = dateTime(2026, 3, 6, 14, 0);
            expect(
                formatEventDateRange({
                    start: date,
                    end: date,
                    allDay: false,
                    locale: "en-US",
                    hour12: true,
                    timeZone: "UTC",
                }),
            ).toBe("Mon, Apr 6, 2026, 2pm - 2pm");
        });

        it("formats h12 range: start on the hour, end with minutes", () => {
            expect(
                formatEventDateRange({
                    start: dateTime(2026, 3, 6, 10, 0),
                    end: dateTime(2026, 3, 6, 10, 30),
                    allDay: false,
                    locale: "en-US",
                    hour12: true,
                    timeZone: "UTC",
                }),
            ).toBe("Mon, Apr 6, 2026, 10am - 10:30am");
        });

        it("formats h12 range: start with minutes, end on the hour", () => {
            expect(
                formatEventDateRange({
                    start: dateTime(2026, 3, 6, 10, 30),
                    end: dateTime(2026, 3, 6, 11, 0),
                    allDay: false,
                    locale: "en-US",
                    hour12: true,
                    timeZone: "UTC",
                }),
            ).toBe("Mon, Apr 6, 2026, 10:30am - 11am");
        });

        it("formats a timed range spanning midnight", () => {
            expect(
                formatEventDateRange({
                    start: dateTime(2026, 3, 6, 22, 0),
                    end: dateTime(2026, 3, 7, 2, 0),
                    allDay: false,
                    locale: "en-US",
                    hour12: false,
                    timeZone: "UTC",
                }),
            ).toBe("Mon, Apr 6, 2026, 22:00 - Tue, Apr 7, 2026, 02:00");
        });

        it("formats an all-day single-day event", () => {
            expect(
                formatEventDateRange({
                    start: dateTime(2026, 3, 6, 0, 0),
                    end: undefined,
                    allDay: true,
                    locale: "en-US",
                    hour12: false,
                    timeZone: "Europe/Zurich",
                }),
            ).toBe("Mon, Apr 6, 2026");
        });

        it("formats an all-day multi-day range", () => {
            expect(
                normalizeIntl(
                    formatEventDateRange({
                        start: dateTime(2026, 3, 6, 0, 0),
                        end: dateTime(2026, 3, 8, 0, 0),
                        allDay: true,
                        locale: "en-US",
                        hour12: false,
                        timeZone: "Europe/Zurich",
                    }),
                ),
            ).toBe("Mon, Apr 6, 2026 - Wed, Apr 8, 2026");
        });

        it("skips zero-duration shortcut for all-day events", () => {
            const date = dateTime(2026, 3, 6, 0, 0);
            expect(
                formatEventDateRange({
                    start: date,
                    end: date,
                    allDay: true,
                    locale: "en-US",
                    hour12: false,
                    timeZone: "Europe/Zurich",
                }),
            ).toBe("Mon, Apr 6, 2026");
        });
    });

    describe("toZonedDateString", () => {
        it("returns a YYYY-MM-DD string for the date in the given timezone", () => {
            expect(
                toZonedDateString(
                    new Date("2026-06-23T10:00:00Z"),
                    "en",
                    "UTC",
                ),
            ).toBe("2026-06-23");
        });

        // Asia/Karachi is UTC+5 with no DST, so the boundary is always at 19:00 UTC.
        it("returns the next calendar day when the timezone has crossed midnight (positive offset)", () => {
            expect(
                toZonedDateString(
                    new Date("2026-06-23T22:00:00Z"),
                    "en",
                    "Asia/Karachi",
                ),
            ).toBe("2026-06-24");
        });

        // America/Phoenix is UTC-7 with no DST, so the boundary is always at 07:00 UTC.
        it("returns the previous calendar day when the local clock has not yet reached midnight (negative offset)", () => {
            expect(
                toZonedDateString(
                    new Date("2026-06-23T02:00:00Z"),
                    "en",
                    "America/Phoenix",
                ),
            ).toBe("2026-06-22");
        });

        it("produces the same output regardless of locale", () => {
            const date = new Date("2026-06-23T10:00:00Z");
            expect(toZonedDateString(date, "ar", "UTC")).toBe(
                toZonedDateString(date, "en", "UTC"),
            );
        });
    });

    describe("parseDate", () => {
        const opts: Intl.DateTimeFormatOptions = {
            day: "2-digit",
            month: "long",
            year: "numeric",
        };

        it.each(["en-US", "fr-FR", "de-DE", "ja-JP", "es-ES", "pt-BR"])(
            "round-trips with formatDate for %s",
            (locale) => {
                const date = new Date(2026, 5, 24); // June 24
                const formatted = formatDate({ date, locale, ...opts });
                const result = parseDate(formatted, locale, opts);
                expect(result?.getFullYear()).toBe(2026);
                expect(result?.getMonth()).toBe(5);
                expect(result?.getDate()).toBe(24);
            },
        );

        it("parses English month names directly", () => {
            const result = parseDate("June 24, 2026", "en-US", opts);
            expect(result?.getFullYear()).toBe(2026);
            expect(result?.getMonth()).toBe(5);
            expect(result?.getDate()).toBe(24);
        });

        it("parses French month names that new Date() cannot handle", () => {
            expect(new Date("24 juin 2026").getTime()).toBeNaN();
            const result = parseDate("24 juin 2026", "fr-FR", opts);
            expect(result?.getFullYear()).toBe(2026);
            expect(result?.getMonth()).toBe(5);
            expect(result?.getDate()).toBe(24);
        });

        it("preserves the calendar day regardless of timezone", () => {
            for (const timeZone of ["UTC", "America/New_York", "Asia/Tokyo"]) {
                // Noon UTC stays on June 24 in every timezone (max offset ±14 h).
                const date = new Date(Date.UTC(2026, 5, 24, 12, 0, 0));
                const formatted = formatDate({
                    date,
                    locale: "en-US",
                    timeZone,
                    ...opts,
                });
                const result = parseDate(formatted, "en-US", opts, timeZone);
                expect(result?.getFullYear()).toBe(2026);
                expect(result?.getMonth()).toBe(5);
                expect(result?.getDate()).toBe(24);
            }
        });

        it("returns undefined for unrecognized input", () => {
            expect(parseDate("not a date", "en-US", opts)).toBeUndefined();
            expect(parseDate("", "en-US", opts)).toBeUndefined();
        });

        it("returns undefined for dates that overflow (e.g. February 30)", () => {
            expect(
                parseDate("February 30, 2026", "en-US", opts),
            ).toBeUndefined();
        });
    });

    describe("formatRelativeTimeRange", () => {
        it("returns startLabel and endLabel for a same-day range in h24", () => {
            expect(
                formatRelativeTimeRange({
                    start: dateTime(2026, 3, 6, 10, 0),
                    end: dateTime(2026, 3, 6, 11, 0),
                    timeZone: "UTC",
                    hour12: false,
                    locale: "en-US",
                }),
            ).toEqual({ startLabel: "10:00", endLabel: "11:00" });
        });

        it("returns startLabel and endLabel for a same-day range in h12 on the hour", () => {
            expect(
                formatRelativeTimeRange({
                    start: dateTime(2026, 3, 6, 10, 0),
                    end: dateTime(2026, 3, 6, 11, 0),
                    timeZone: "UTC",
                    hour12: true,
                    locale: "en-US",
                }),
            ).toEqual({ startLabel: "10am", endLabel: "11am" });
        });

        it("returns startLabel and endLabel for a same-day range in h12 with minutes", () => {
            expect(
                formatRelativeTimeRange({
                    start: dateTime(2026, 3, 6, 10, 30),
                    end: dateTime(2026, 3, 6, 11, 30),
                    timeZone: "UTC",
                    hour12: true,
                    locale: "en-US",
                }),
            ).toEqual({ startLabel: "10:30am", endLabel: "11:30am" });
        });

        it("returns cross-day endLabel with weekday and date in h24", () => {
            expect(
                formatRelativeTimeRange({
                    start: dateTime(2026, 3, 6, 22, 0),
                    end: dateTime(2026, 3, 7, 2, 0),
                    timeZone: "UTC",
                    hour12: false,
                    locale: "en-US",
                }),
            ).toEqual({ startLabel: "22:00", endLabel: "Tue, Apr 7, 02:00" });
        });

        it("returns cross-day endLabel with weekday and date in h12 on the hour", () => {
            expect(
                formatRelativeTimeRange({
                    start: dateTime(2026, 3, 6, 22, 0),
                    end: dateTime(2026, 3, 7, 2, 0),
                    timeZone: "UTC",
                    hour12: true,
                    locale: "en-US",
                }),
            ).toEqual({ startLabel: "10pm", endLabel: "Tue, Apr 7, 2am" });
        });

        it("returns cross-day endLabel with minutes in h12", () => {
            expect(
                formatRelativeTimeRange({
                    start: dateTime(2026, 3, 6, 22, 0),
                    end: dateTime(2026, 3, 7, 2, 30),
                    timeZone: "UTC",
                    hour12: true,
                    locale: "en-US",
                }),
            ).toEqual({ startLabel: "10pm", endLabel: "Tue, Apr 7, 2:30am" });
        });

        it("uses the same-day path when end is on the same calendar day in the given timezone", () => {
            // UTC dates span midnight (Apr 6 23:00 → Apr 7 01:00), but in
            // America/New_York (UTC-4 in April) both fall on Apr 6 (19:00–21:00).
            expect(
                formatRelativeTimeRange({
                    start: dateTime(2026, 3, 6, 23, 0),
                    end: dateTime(2026, 3, 7, 1, 0),
                    timeZone: "America/New_York",
                    hour12: false,
                    locale: "en-US",
                }),
            ).toEqual({ startLabel: "19:00", endLabel: "21:00" });
        });
    });

    describe("formatDateParts", () => {
        it("should replace template placeholders with formatted parts", () => {
            expect(
                formatDateParts(
                    dateTime(2026, 0, 26, 0, 0),
                    dayMonth,
                    "{day} {month}",
                    "en-US",
                ),
            ).toBe("26 January");
        });

        it("should support reordering parts via template", () => {
            expect(
                formatDateParts(
                    new Date(2026, 0, 26),
                    dayMonth,
                    "{month} {day}",
                    "en-US",
                ),
            ).toBe("January 26");
        });

        it("should drop unknown placeholders", () => {
            expect(
                formatDateParts(
                    new Date(2026, 0, 26),
                    dayMonth,
                    "{day} {weekday}",
                    "en-US",
                ),
            ).toBe("26 ");
        });
    });
});
