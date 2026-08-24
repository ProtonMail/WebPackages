import { describe, it, expect } from "vitest";
import {
    getLocalizedWeekdaysLong,
    getLocalizedWeekdaysShort,
} from "./weekdayNames.ts";

describe("weekdayNames", () => {
    describe("getLocalizedWeekdaysLong", () => {
        it("should return localized weekdays long", () => {
            const weekdays = getLocalizedWeekdaysLong("en");

            expect(weekdays).toStrictEqual([
                "Sunday",
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
            ]);
        });

        it("should return localized weekdays long for another locale", () => {
            const weekdays = getLocalizedWeekdaysLong("fr");

            expect(weekdays).toStrictEqual([
                "dimanche",
                "lundi",
                "mardi",
                "mercredi",
                "jeudi",
                "vendredi",
                "samedi",
            ]);
        });
    });

    describe("getLocalizedWeekdaysShort", () => {
        it("should return localized weekdays short", () => {
            const weekdays = getLocalizedWeekdaysShort("en");

            expect(weekdays).toStrictEqual(["S", "M", "T", "W", "T", "F", "S"]);
        });

        it("should return localized weekdays short for another locale", () => {
            const weekdays = getLocalizedWeekdaysShort("fr");

            expect(weekdays).toStrictEqual(["D", "L", "M", "M", "J", "V", "S"]);
        });
    });
});
