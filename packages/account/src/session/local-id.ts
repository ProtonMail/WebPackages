export const stripLeadingSlash = (str: string) => str.replace(/^\/+/g, "");
export const stripTrailingSlash = (str: string) => str.replace(/\/+$/g, "");
export const stripLeadingAndTrailingSlash = (str: string) =>
    str.replace(/^\/+|\/+$/g, "");

export const getLocalIdPath = (u?: number) =>
    u === undefined ? undefined : `u/${u}`;

export const getValidLocalId = (localID = ""): number | undefined => {
    if (!localID) {
        return;
    }
    if (/^\d+$/.test(localID)) {
        const maybeLocalID = Number(localID);
        if (
            Number.isInteger(maybeLocalID) &&
            maybeLocalID >= 0 &&
            maybeLocalID <= 100000000
        ) {
            return maybeLocalID;
        }
    }
};

export const getLocalIdFromPathname = (
    pathname: string,
): number | undefined => {
    const maybeLocalID = /^\/?u\/([^/]+)\/?/.exec(pathname)?.[1];
    return getValidLocalId(maybeLocalID);
};

export const getLocalIdBasename = (basename = "", localID?: number): string => {
    if (localID === undefined) {
        return basename;
    }
    const localIDPathBase = getLocalIdPath(localID);
    const joined = [basename, localIDPathBase].filter(Boolean).join("/");
    return joined ? `/${joined}` : basename;
};

export const getPathnameWithoutLocalId = (pathname: string): string => {
    const strippedPathname = stripLeadingSlash(pathname);

    if (strippedPathname === "u") {
        return "/";
    }

    const pathnamePrefix = "u/";
    if (strippedPathname.startsWith(pathnamePrefix)) {
        // Strip out the 'u/' part
        let value = stripLeadingSlash(
            strippedPathname.slice(pathnamePrefix.length),
        );

        const localID = getLocalIdFromPathname(`${pathnamePrefix}${value}`);
        // If there is a valid local id, also strip out that
        if (localID !== undefined) {
            value = value.slice(`${localID}`.length);
        }

        // Keep stripping /u prefix if it exists
        return getPathnameWithoutLocalId(value);
    }

    return `/${strippedPathname}`;
};

export const getPathWithoutLocalId = (url: string) => {
    try {
        const { pathname, hash, search } = new URL(url, window.location.origin);
        return `${stripLeadingAndTrailingSlash(getPathnameWithoutLocalId(pathname))}${search}${hash}`;
    } catch {
        return "";
    }
};

export class LocalIdUrl {
    localId: number | undefined;
    url: URL;
    basename: string;

    constructor(localId: number | undefined, basename: string, url: URL) {
        this.url = url;
        this.localId = localId;
        this.basename = basename;
    }

    static fromUrl(url: URL) {
        const pathname = url.pathname;

        const result = new URL(url);
        result.pathname = getPathnameWithoutLocalId(pathname);

        const localId = getLocalIdFromPathname(pathname);
        const basename = getLocalIdBasename("", localId);

        return new LocalIdUrl(localId, basename, result);
    }
}
