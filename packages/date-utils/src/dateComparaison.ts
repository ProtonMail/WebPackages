import { getZonedParts } from "./timezone";

export const isSameMinute = (
  date1: Date,
  date2: Date,
  locale: string,
  timeZone: string,
): boolean => {
  const left = getZonedParts(date1, locale, timeZone);
  const right = getZonedParts(date2, locale, timeZone);
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hours === right.hours &&
    left.minutes === right.minutes
  );
};
