import { getDateTimeFormatter } from "./formatDate.ts";

export const getLocalizedMonthNames = (locale: string): string[] => {
    const formatter = getDateTimeFormatter({ locale, month: "long" });
    return Array.from({ length: 12 }, (_, i) =>
        formatter.format(new Date(2000, i, 1)),
    );
};
