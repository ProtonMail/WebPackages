import {
    formatDate,
    formatDateToParts,
    getDateTimeFormatter,
    toZonedDateString,
} from "./formatDate.ts";

/**
 * Returns the timezone offset in a GTM formatted string
 * E.g. Europe/Vilnius -> GMT + 3
 *
 * @param timezone
 */
export const getGMTOffset = (date: Date, timezone: string): string => {
    // Use Intl to get the offset string for the given timezone
    const parts = new Intl.DateTimeFormat(undefined, {
        timeZone: timezone,
        timeZoneName: "shortOffset",
    }).formatToParts(date);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? timezone;
};
/**
 * Returns a short label for a timezone (first 3 letters of the city, or acronym)
 * E.g. Europe/Vilnius -> Vil
 * E.g. America/Argentina/La_Rioja -> LR
 *
 * @param timezone
 */
export const getTimezoneShortLabel = (timezone: string) => {
    // Timezones can have different formats
    // Europe/London - Asia/Ho_Chi_Minh - America/Argentina/La_Rioja - UTC
    const city = timezone.split("/").pop()?.replace(/_/g, " ") ?? timezone;
    const words = city.split(" ");

    // For multi words timezone, return the acronym (E.g. "Ho Chi Minh" -> HCM)
    if (words.length > 1) {
        return words.map((word) => word[0]).join("");
    }

    // Else return the first 3 chars of the city
    return city.slice(0, 3);
};

// Returns the UTC timestamp for midnight of the day containing `refDate` in `timezone`.
const getUtcMidnightTimeStamp = (timezone: string, refDate: Date): number => {
    const parts = new Intl.DateTimeFormat(undefined, {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).formatToParts(refDate);

    const getPart = (type: string) => {
        const val = Number(parts.find((p) => p.type === type)?.value ?? 0);
        return type === "hour" && val === 24 ? 0 : val;
    };

    const msSinceMidnight =
        (getPart("hour") * 3600 + getPart("minute") * 60 + getPart("second")) *
        1000;
    return refDate.getTime() - msSinceMidnight;
};

// Returns the UTC instant for a time-of-day offset (`slotMs` from midnight) in `timezone`,
// anchored to the calendar day containing `refDate`.
export const getSlotDateFromTime = (
    slotMs: number,
    timezone: string,
    refDate: Date,
): Date => {
    return new Date(getUtcMidnightTimeStamp(timezone, refDate) + slotMs);
};

interface ZonedParts {
    year: number;
    month: number;
    day: number;
    hours: number;
    minutes: number;
    seconds: number;
}

// `numberingSystem: "latn"` forces Latin digits so the numeric parts
// stay parseable regardless of the runtime's default locale.
const formatterCache = new Map<string, Intl.DateTimeFormat>();
const partsFormatter = (locale: string, timeZone: string) => {
    const key = `${locale}|${timeZone}`;
    let fmt = formatterCache.get(key);
    if (!fmt) {
        fmt = getDateTimeFormatter({
            locale,
            timeZone,
            numberingSystem: "latn",
            year: "numeric",
            month: "numeric",
            day: "numeric",
            hour: "numeric",
            minute: "numeric",
            second: "numeric",
            hour12: false,
        });
        formatterCache.set(key, fmt);
    }
    return fmt;
};

/** Decompose `date` into calendar parts as observed in `timeZone`. */
export const getZonedParts = (
    date: Date,
    locale: string,
    timeZone: string,
): ZonedParts => {
    const map = new Map(
        partsFormatter(locale, timeZone)
            .formatToParts(date)
            .map((p) => [p.type, p.value]),
    );
    // Some engines emit "24" for midnight when hour12 is false.
    const rawHour = Number(map.get("hour"));
    return {
        year: Number(map.get("year")),
        month: Number(map.get("month")),
        day: Number(map.get("day")),
        hours: rawHour % 24,
        minutes: Number(map.get("minute")),
        seconds: Number(map.get("second")),
    };
};

/**
 * Returns a Date representing today in the user timeZone, encoded as UTC midnight
 */
export const getToday = (locale: string, timeZone: string): Date => {
    const { year, month, day } = getZonedParts(new Date(), locale, timeZone);
    return new Date(Date.UTC(year, month - 1, day));
};

/**
 * Returns the UTC midnight Date for the calendar date that `now` falls on in `timeZone`.
 * Used to compare all-day event dates (stored as UTC midnight calendar dates) against
 * the user's "today" in their calendar timezone.
 */
export const getZonedDayAsUTC = (
    now: Date,
    locale: string,
    timeZone: string,
): Date => {
    const { year, month, day } = getZonedParts(now, locale, timeZone);
    return new Date(Date.UTC(year, month - 1, day));
};

/**
 * Returns whether `date` falls on today's calendar date in `timeZone`.
 */
export const isToday = (
    date: Date,
    locale: string,
    timeZone: string,
): boolean => {
    return (
        getToday(locale, timeZone).getTime() ===
        getZonedDayAsUTC(date, locale, timeZone).getTime()
    );
};

export const getHourInTimezone = ({
    date,
    timeZone,
    locale,
}: {
    date: Date;
    timeZone: string;
    locale: string;
}): number => {
    return parseInt(
        formatDate({ date, locale, timeZone, hour: "numeric", hour12: false }),
        10,
    );
};

// Minutes elapsed since midnight of `date` as observed in `timeZone`, e.g. 13:30 -> 810 mins
export const getMinutesSinceMidnightInTimezone = ({
    date,
    timeZone,
    locale,
}: {
    date: Date;
    timeZone: string;
    locale: string;
}): number => {
    const parts = formatDateToParts({
        date,
        locale,
        timeZone,
        hour: "numeric",
        minute: "numeric",
        hour12: false,
        // Force 0-23 format explicitly: some locales default to the h24 cycle,
        // where midnight formats as "24" instead of "0".
        hourCycle: "h23",
    });

    const hours = parseInt(
        parts.find((p) => p.type === "hour")?.value ?? "0",
        10,
    );
    const minutes = parseInt(
        parts.find((p) => p.type === "minute")?.value ?? "0",
        10,
    );

    return hours * 60 + minutes;
};

// Weekday (0 = Sunday ... 6 = Saturday) of `date` as observed in `timeZone`.
// toZonedDateString yields the wall-clock YYYY-MM-DD in the zone; parsing it back
// at UTC midnight lets getUTCDay() report the weekday for that calendar date.
export const getWeekdayInTimezone = ({
    date,
    timeZone,
    locale,
}: {
    date: Date;
    timeZone: string;
    locale: string;
}): number => {
    return new Date(
        `${toZonedDateString(date, locale, timeZone)}T00:00:00Z`,
    ).getUTCDay();
};

const SUNDAY = 0;
const SATURDAY = 6;

export const isNowWeekend = ({
    now,
    locale,
    timeZone,
}: {
    now: Date;
    locale: string;
    timeZone: string;
}): boolean => {
    const dayOfWeek = getWeekdayInTimezone({ date: now, timeZone, locale });
    return dayOfWeek === SATURDAY || dayOfWeek === SUNDAY;
};

/**
 * Returns a Date whose UTC value represents the wall-clock time of `date` in
 * `timeZone`, reinterpreted as if it were UTC. This lets date-fns functions
 * (endOfDay, startOfDay, intervalToDuration, …) operate in the calendar
 * timezone's frame without needing tz-aware variants.
 */
export const getZonedTimeAsUTC = (
    date: Date,
    locale: string,
    timeZone: string,
): Date => {
    const { year, month, day, hours, minutes, seconds } = getZonedParts(
        date,
        locale,
        timeZone,
    );
    return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
};

/**
 * Returns the offset (in minutes) such that
 * `localWallClock = UTC + offset` for the given instant in `timeZone`.
 */
const getZoneOffsetMinutes = (
    date: Date,
    locale: string,
    timeZone: string,
): number => {
    const p = getZonedParts(date, locale, timeZone);
    const localAsUtc = Date.UTC(
        p.year,
        p.month - 1,
        p.day,
        p.hours,
        p.minutes,
        p.seconds,
    );
    return Math.round((localAsUtc - date.getTime()) / 60_000);
};

/**
 * Construct a Date whose wall-clock representation in `timeZone` matches
 * the supplied calendar parts. Performs a second pass so DST transitions
 * resolve to the correct UTC instant.
 */
export const dateFromZonedParts = (
    year: number,
    month: number,
    day: number,
    hours: number,
    minutes: number,
    locale: string,
    timeZone: string,
): Date => {
    const naiveUtc = Date.UTC(year, month - 1, day, hours, minutes);
    const firstGuess = new Date(
        naiveUtc -
            getZoneOffsetMinutes(new Date(naiveUtc), locale, timeZone) * 60_000,
    );
    const offset = getZoneOffsetMinutes(firstGuess, locale, timeZone);
    return new Date(naiveUtc - offset * 60_000);
};

/**
 * Returns the number of calendar days that dateToCompare is ahead of date with
 * the user timeZone.
 * It should be: positive when dateToCompare is later and negative when earlier; 0 when same day.
 * - > 0 when dateToCompare is after date
 * - < 0 when dateToCompare is before date
 * - 0 when dateToCompare and date are on the same day
 */
export const calendarDayOffset = (
    date: Date,
    dateToCompare: Date,
    locale: string,
    timeZone: string,
): number => {
    const zonedDate = getZonedParts(date, locale, timeZone);
    const zonedDateToCompare = getZonedParts(dateToCompare, locale, timeZone);
    const dateTimestamp = Date.UTC(
        zonedDate.year,
        zonedDate.month - 1,
        zonedDate.day,
    );
    const dateToCompareTimestamp = Date.UTC(
        zonedDateToCompare.year,
        zonedDateToCompare.month - 1,
        zonedDateToCompare.day,
    );
    return Math.round(
        (dateToCompareTimestamp - dateTimestamp) / (24 * 60 * 60 * 1000),
    );
};

/**
 * Returns today's date as UTC midnight, based on the device-local calendar date.
 * Use as a placeholder before the calendar timezone is known.
 */
export const deviceTodayAsUTCMidnight = (): Date => {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
};

/**
 * Converts a UTC-midnight calendar date to device-local midnight,
 * for passing to design-system components that use device-local date-fns internally.
 */
export const toDeviceLocalMidnight = (utcMidnightDate: Date): Date => {
    return new Date(
        utcMidnightDate.getUTCFullYear(),
        utcMidnightDate.getUTCMonth(),
        utcMidnightDate.getUTCDate(),
    );
};
