import { describe, it, expect } from "vitest";
import { getLocalizedMonthNames } from "./monthNames.ts";

describe("monthNames", () => {
    describe("getLocalizedMonthNames", () => {
        it("should return localized months", () => {
            const months = getLocalizedMonthNames("en");

            expect(months).toStrictEqual([
                "January",
                "February",
                "March",
                "April",
                "May",
                "June",
                "July",
                "August",
                "September",
                "October",
                "November",
                "December",
            ]);
        });

        it("returns localized names for another locale", () => {
            const months = getLocalizedMonthNames("fr");

            expect(months).toStrictEqual([
                "janvier",
                "février",
                "mars",
                "avril",
                "mai",
                "juin",
                "juillet",
                "août",
                "septembre",
                "octobre",
                "novembre",
                "décembre",
            ]);
        });
    });
});
