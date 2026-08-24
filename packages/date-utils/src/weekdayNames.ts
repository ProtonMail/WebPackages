import { getDateTimeFormatter } from "./formatDate.ts";

type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// A known Sunday to anchor weekday generation (Feb 6, 2000 = Sunday)
const ANCHOR_SUNDAY = new Date(2000, 1, 6);

const getLocalizedWeekdays = (
    locale: string,
    options: Intl.DateTimeFormatOptions,
): string[] => {
    const formatter = getDateTimeFormatter({ locale, ...options });
    return Array.from({ length: 7 }, (_, i) => {
        return formatter.format(
            new Date(
                ANCHOR_SUNDAY.getFullYear(),
                ANCHOR_SUNDAY.getMonth(),
                ANCHOR_SUNDAY.getDate() + i,
            ),
        );
    });
};

export const getLocalizedWeekdaysLong = (locale: string): string[] => {
    return getLocalizedWeekdays(locale, { weekday: "long" });
};

export const getLocalizedWeekdaysShort = (locale: string): string[] => {
    return getLocalizedWeekdays(locale, { weekday: "narrow" });
};

export const getWeekDayText = (day: Weekday, locale: string): string => {
    const weekdayNames = getLocalizedWeekdaysLong(locale);
    return weekdayNames[day] ?? "";
};
