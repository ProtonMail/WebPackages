export const capitalize = (str: string | undefined, locale?: string) => {
    if (str === undefined) {
        return;
    }

    return str.charAt(0).toLocaleUpperCase(locale) + str.slice(1);
};
