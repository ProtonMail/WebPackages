export const capitalize = (str: string | undefined, locale?: string) => {
    if (str === undefined) {
        return;
    }

    return str.charAt(0).toLocaleUpperCase(locale) + str.slice(1);
};

/**
 * Replace LTR and RTL override unicode chars which can lead to security issues on filenames
 * 202D and 202E should be the only unicode chars concerned
 * https://jira.protontech.ch/browse/SEC-644
 */
const rtlSanitize = (str: string) => {
    return str.replace(/[\u202D\u202E]/g, "_");
};

export const getInitials = (fullName = "") => {
    if (!fullName) {
        return "?";
    }

    const words = rtlSanitize(fullName)
        .replace(/\s+/g, " ") // Collapse all whitespace (including tabs/newlines) into single spaces
        .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}]+/gu, "") // Remove emoji characters (incl. flag emoji)
        .replace(/[.,/#!$@%^&*;:{}=\-_`~()]/g, "") // Remove special chars
        .trim()
        .split(" ")
        .filter(Boolean);

    if (!words.length) {
        return "?";
    }

    const [first] = words;
    const last = words[words.length - 1];

    if (!first || !last) {
        return "?";
    }

    if (words.length === 1) {
        return first.charAt(0).toUpperCase();
    }

    return (first.charAt(0) + last.charAt(0)).toUpperCase();
};
