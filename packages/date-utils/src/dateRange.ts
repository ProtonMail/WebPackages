export const isDateWithinRange = (
    date: Date,
    dateRange: [Date, Date],
): boolean => {
    const [rangeStart, rangeEnd] = dateRange;
    return date >= rangeStart && date <= rangeEnd;
};
