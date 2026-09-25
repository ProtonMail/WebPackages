/**
 * Splits a file path for truncation: `suffix` always contains the last
 * `tailLength` characters of the base name plus the extension, so something
 * recognizable stays visible next to the extension when truncated — not just
 * the extension itself. `prefix` is everything before that. If the base name
 * isn't longer than `tailLength`, no split is needed — `prefix` is empty and
 * `suffix` is the full path. Leading directories (if any) stay in `prefix`.
 */
export const splitFilePath = (
    name: string,
    tailLength = 10,
): { prefix: string; suffix: string } => {
    const dotIndex = name.lastIndexOf(".");
    const hasExtension = dotIndex > 0;
    const base = hasExtension ? name.slice(0, dotIndex) : name;
    const extension = hasExtension ? name.slice(dotIndex) : "";

    if (base.length <= tailLength) {
        return { prefix: "", suffix: name };
    }

    return {
        prefix: base.slice(0, base.length - tailLength),
        suffix: base.slice(base.length - tailLength) + extension,
    };
};
