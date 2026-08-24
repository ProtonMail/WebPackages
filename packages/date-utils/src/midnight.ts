export const getIsMidnight = (date: Date): boolean => {
    return (
        date.getHours() === 0 &&
        date.getMinutes() === 0 &&
        date.getSeconds() === 0 &&
        date.getMilliseconds() === 0
    );
};
