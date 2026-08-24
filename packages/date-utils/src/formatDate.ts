import { UTC_TIMEZONE } from "./constants.ts";

type FormatDateOptions = Intl.DateTimeFormatOptions & {
    locale: string;
    date: Date | number;
};

/**
 * Compacts the meridiem of a formatted time: drops the separator and
 * lowercases AM/PM. Tolerant of the various separators and dotted forms —
 * note that Intl.DateTimeFormat emits U+202F (narrow no-break space), not " ".
 *
 * @example
 * formatAMPM("10:00 AM");       // "10:00am"
 * formatAMPM("10:00\u202fPM");  // "10:00pm"  (narrow no-break space)
 * formatAMPM("9:30 a.m.");      // "9:30am"
 *
 * @param value - A formatted time string (e.g. from Intl.DateTimeFormat).
 * @returns The same string with a compact, lowercased meridiem.
 */
export const formatAMPM = (value: string): string =>
    value.replace(
        /\s*([ap])\.?m\.?/gi,
        (_match, period: string) => `${period.toLowerCase()}m`,
    );

export const getDateTimeFormatter = ({
    locale,
    ...options
}: Omit<FormatDateOptions, "date">) => {
    return new Intl.DateTimeFormat(locale, options);
};

/**
 * Format a date using Intl.DateTimeFormat.
 */
export const formatDate = ({
    date,
    locale,
    ...options
}: FormatDateOptions): string => {
    const formatted = getDateTimeFormatter({ locale, ...options }).format(date);
    return formatAMPM(formatted);
};

export const formatDateToParts = ({
    date,
    locale,
    ...options
}: FormatDateOptions): Intl.DateTimeFormatPart[] =>
    getDateTimeFormatter({ locale, ...options }).formatToParts(date);

/**
 * Locale-aware inverse of formatDate for day/month/year formats.
 *
 * Derives the expected format structure from Intl.DateTimeFormat.formatToParts
 * on a reference date, builds a regex from it, and maps localized month names
 * (e.g. "juin", "Juni") back to their 1-based index.
 *
 * Returns a local-midnight Date on success, undefined on parse failure.
 * The caller is responsible for timezone re-anchoring (e.g. reanchorToZone).
 */
export const parseDate = (
    input: string,
    locale: string,
    options: Intl.DateTimeFormatOptions,
    timeZone?: string,
): Date | undefined => {
    const fmt = getDateTimeFormatter({
        locale,
        ...options,
        ...(timeZone ? { timeZone } : {}),
    });

    // Noon UTC ensures no timezon shifts the instant to a different calendar day.
    const referenceInstant = Date.UTC(2001, 0, 1, 12, 0, 0);
    const referenceParts = fmt.formatToParts(referenceInstant);

    // Build month name → 1-based month number map for "long"/"short" month options.
    const monthMap = new Map<string, number>();
    for (let month = 0; month < 12; month++) {
        const part = fmt
            .formatToParts(Date.UTC(2001, month, 1, 12, 0, 0))
            .find((p) => p.type === "month");
        if (part) {
            monthMap.set(part.value.toLowerCase(), month + 1);
        }
    }

    // Build a regex from the reference parts, capturing day/month/year groups.
    let pattern = "^";
    const captured: ("day" | "month" | "year")[] = [];
    for (const part of referenceParts) {
        if (part.type === "day" || part.type === "year") {
            pattern += "(\\d+)";
            captured.push(part.type);
        } else if (part.type === "month") {
            // Numeric months (e.g. "01") vs. name months (e.g. "January").
            pattern += /^\d+$/.test(part.value) ? "(\\d+)" : "([\\p{L}]+)";
            captured.push("month");
        } else if (part.type === "literal") {
            pattern += part.value
                .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
                .replace(/\s+/g, "\\s*");
        }
    }
    pattern += "$";

    // The following regex should be safe.
    // `pattern` is assembled only from Intl.DateTimeFormat.formatToParts()
    // output (fixed shapes "(\d+)" / "([\p{L}]+)" plus escaped literals), never
    // from `locale`/`timeZone` values directly. So it can't contain nested or
    // overlapping quantifiers and isn't susceptible to catastrophic backtracking.
    // nosemgrep
    const match = new RegExp(pattern, "iu").exec(input.trim());
    if (!match) {
        return undefined;
    }

    let day: number | undefined;
    let month: number | undefined;
    let year: number | undefined;

    captured.forEach((type, i) => {
        const val = match[i + 1] ?? "";
        if (type === "day") {
            day = parseInt(val, 10);
        } else if (type === "year") {
            year = parseInt(val, 10);
        } else {
            const num = parseInt(val, 10);
            month = Number.isNaN(num) ? monthMap.get(val.toLowerCase()) : num;
        }
    });

    if (
        day === undefined ||
        month === undefined ||
        year === undefined ||
        Number.isNaN(day) ||
        Number.isNaN(year)
    ) {
        return undefined;
    }

    const result = new Date(year, month - 1, day);
    // Guard against overflow (e.g. Feb 30 silently becoming Mar 2).
    if (
        Number.isNaN(result.getTime()) ||
        result.getMonth() !== month - 1 ||
        result.getDate() !== day
    ) {
        return undefined;
    }
    return result;
};

type FormatDateRangeOptions = Intl.DateTimeFormatOptions & {
    startDate: Date;
    endDate: Date;
    locale: string;
};

export const formatDateRange = ({
    startDate,
    endDate,
    locale,
    ...options
}: FormatDateRangeOptions): string => {
    const formatted = getDateTimeFormatter({ locale, ...options }).formatRange(
        startDate,
        endDate,
    );
    return formatAMPM(formatted);
};

const hasMinutes = ({
    date,
    timeZone,
    locale,
}: {
    date: Date | number;
    timeZone: string;
    locale: string;
}): boolean => {
    const minutePart = formatDateToParts({
        date,
        locale,
        timeZone,
        minute: "2-digit",
    }).find((part) => part.type === "minute");

    const minutes = Number(minutePart?.value ?? 0);

    return minutes !== 0;
};

/**
 * Format a time in the format we're using over the calendar application
 * - 12h format -> 9am or 9:30am
 * - 24h format -> 09:00 or 09:30
 */
export const formatTime = ({
    date,
    locale,
    timeZone,
    hour12,
}: {
    date: Date | number;
    locale: string;
    timeZone: string;
    hour12: boolean;
}): string => {
    const formatted = getDateTimeFormatter({
        locale,
        hour12,
        timeZone,
        hour: "numeric",
        minute:
            hour12 && !hasMinutes({ date, timeZone, locale })
                ? undefined
                : "2-digit",
    }).format(date);

    return formatAMPM(formatted);
};

/**
 * Ordinal-suffix maps keyed by Intl.PluralRules ordinal category.
 * Only languages whose ordinal markers are NOT already produced by
 * Intl.DateTimeFormat are listed; the rest are intentionally omitted.
 *
 * Covered: en, fr, it, nl, sv, pt
 * Skipped (Intl handles it): de, da, nb, cs, hu, fi, ja, ko, zh
 * Skipped (cardinals in dates): es, pl, ru, ar, tr
 */
const ordinalSuffixes: Record<
    string,
    Partial<Record<Intl.LDMLPluralRule, string>>
> = {
    en: { one: "st", two: "nd", few: "rd", other: "th" },
    fr: { one: "er", other: "e" },
    it: { many: "°", other: "°" },
    nl: { other: "e" },
    sv: { one: ":a", other: ":e" },
    pt: { other: "º" },
};

export const getOrdinalSuffix = (day: number, locale: string): string => {
    const lang = locale.split("-")[0];
    const map = ordinalSuffixes[lang ?? ""];
    if (!map) return "";
    const category = new Intl.PluralRules(locale, { type: "ordinal" }).select(
        day,
    );
    return map[category] ?? "";
};

/**
 * Format a date with an ordinal day suffix (e.g. "Wednesday, April 22nd, 2026").
 * Uses Intl.PluralRules to select the correct suffix per locale.
 * For languages without a suffix map the output is identical to formatDate.
 */
export const formatDateWithOrdinal = (
    date: Date,
    options: Intl.DateTimeFormatOptions,
    locale: string,
): string => {
    const parts = formatDateToParts({ locale, date, ...options });
    return parts
        .map((part) =>
            part.type === "day"
                ? `${part.value}${getOrdinalSuffix(Number(part.value), locale)}`
                : part.value,
        )
        .join("");
};

/**
 * Format a date extracting specific parts in a custom order.
 * Uses a template string where {partType} placeholders are replaced with
 * the corresponding formatted part values.
 *
 * Example: formatDateParts(date, { day: 'numeric', month: 'long' }, "{day} {month}")
 *          → "26 January"
 */
export const formatDateParts = (
    date: Date,
    options: Intl.DateTimeFormatOptions,
    template: string,
    locale: string,
): string => {
    const parts = formatDateToParts({ locale, date, ...options });
    const partsMap = new Map(parts.map((p) => [p.type, p.value]));
    return template.replace(
        /\{(\w+)\}/g,
        (_, type) => partsMap.get(type as Intl.DateTimeFormatPartTypes) ?? "",
    );
};

const getEventFormatter = ({
    date,
    locale,
    allDay,
    hour12,
    timeZone,
}: {
    date: Date | number;
    locale: string;
    allDay: boolean;
    hour12: boolean;
    timeZone: string;
}) => {
    return getDateTimeFormatter({
        locale,
        hour12,
        timeZone: allDay ? UTC_TIMEZONE : timeZone,
        // weekday + short date, with time for part-day events
        // (en-US: "Wed, Jun 18, 2026" / "Wed, Jun 18, 2026, 10:00 AM")
        ...(allDay
            ? {
                  year: "numeric",
                  month: "short",
                  weekday: "short",
                  day: "numeric",
              }
            : {
                  year: "numeric",
                  month: "short",
                  weekday: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute:
                      hour12 && !hasMinutes({ date, locale, timeZone })
                          ? undefined
                          : "2-digit",
              }),
    });
};

export const formatEventDateRange = ({
    start,
    end,
    allDay,
    locale,
    hour12,
    timeZone,
}: {
    start: Date;
    end: Date | undefined;
    allDay: boolean;
    locale: string;
    hour12: boolean;
    timeZone: string;
}): string => {
    // All-day dates are stored as UTC-midnight calendar dates.
    // Applying the calendar timezone could shift them to the wrong day.
    const startFormatter = getEventFormatter({
        date: start,
        hour12,
        timeZone,
        locale,
        allDay,
    });

    const startFormatted = formatAMPM(startFormatter.format(start));

    if (end) {
        const isSameDay =
            formatDate({
                date: start,
                timeZone: allDay ? UTC_TIMEZONE : timeZone,
                locale,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
            }) ===
            formatDate({
                date: end,
                timeZone: allDay ? UTC_TIMEZONE : timeZone,
                locale,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
            });

        if (allDay && isSameDay) {
            return startFormatted;
        }

        const endFormatted = isSameDay
            ? formatTime({ date: end, locale, hour12, timeZone })
            : formatAMPM(
                  getEventFormatter({
                      date: end,
                      hour12,
                      timeZone,
                      locale,
                      allDay,
                  }).format(end),
              );

        return `${startFormatted} - ${endFormatted}`;
    }
    return startFormatted;
};

// `YYYY-MM-DD` of `date` as observed in `timeZone`, in the format
// FullCalendar parses against its configured `timeZone`. Reading
// the wall-clock day in zone (rather than via local-time getters)
// keeps the visible range correct when the runner's zone differs
// from the calendar's.
const zonedDateStringFormatterCache = new Map<string, Intl.DateTimeFormat>();
const zonedDateStringFormatter = (locale: string, timeZone: string) => {
    const key = `${locale}|${timeZone}`;
    let fmt = zonedDateStringFormatterCache.get(key);
    if (!fmt) {
        fmt = getDateTimeFormatter({
            locale,
            timeZone,
            numberingSystem: "latn",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        });
        zonedDateStringFormatterCache.set(key, fmt);
    }
    return fmt;
};

export const toZonedDateString = (
    date: Date,
    locale: string,
    timeZone: string,
): string => {
    const map = new Map(
        zonedDateStringFormatter(locale, timeZone)
            .formatToParts(date)
            .map((p) => [p.type, p.value]),
    );
    return `${map.get("year")}-${map.get("month")}-${map.get("day")}`;
};

export const formatRelativeTimeRange = ({
    start,
    end,
    timeZone,
    hour12,
    locale,
}: {
    start: Date;
    end: Date;
    timeZone: string;
    hour12: boolean;
    locale: string;
}) => {
    const startLabel = formatTime({
        date: start,
        timeZone,
        hour12,
        locale,
    });

    const isMultiDay =
        toZonedDateString(start, locale, timeZone) !==
        toZonedDateString(end, locale, timeZone);

    const endLabel = isMultiDay
        ? formatAMPM(
              getDateTimeFormatter({
                  locale,
                  timeZone,
                  hour12,
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute:
                      hour12 && !hasMinutes({ date: end, timeZone, locale })
                          ? undefined
                          : "2-digit",
              }).format(end),
          )
        : formatTime({ date: end, timeZone, hour12, locale });

    return { startLabel, endLabel };
};
