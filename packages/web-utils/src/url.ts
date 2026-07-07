export const PROTON_DOMAINS = [
    "protonmail.com",
    "protonmail.ch",
    "protonvpn.com",
    "protonstatus.com",
    "gdpr.eu",
    "protonvpn.net",
    "pm.me",
    "protonmailrmez3lotccipshtkleegetolb73fuirgj7r4o4vfu7ozyd.onion",
    "proton.me",
];

// Takes e.g. calendar.proton.me and returns proton.me
export const getRootDomain = (hostname: string) => {
    return hostname.slice(hostname.indexOf(".") + 1);
};

export const getHostname = (url: string) => {
    // The easy way to parse an URL, is to create <a> element.
    // @see: https://gist.github.com/jlong/2428561
    const parser = document.createElement("a");
    parser.href = url;
    return parser.hostname;
};

export const isMailTo = (url: string): boolean => {
    return url.toLowerCase().startsWith("mailto:");
};

export const isExternal = (url: string, hostname: string) => {
    try {
        const linkHostname = getHostname(url);
        if (isMailTo(url)) {
            return false;
        }
        if (isProtonDomain(linkHostname, hostname)) {
            return false;
        }
        return true;
    } catch {
        /*
         * IE11/Edge are the worst, they crash when they try to
         * parse invalid URLs,
         * ex: http://xn--rotonmail-4sg.com
         * so if it does we know it's an external link (⌐■_■)
         */
        return true;
    }
};

const isSubDomain = (hostname: string, domain: string) => {
    if (hostname === domain) {
        return true;
    }
    return hostname.endsWith(`.${domain}`);
};

export const isProtonDomain = (
    linkHostname: string,
    currentHostname: string,
) => {
    const currentDomain = getRootDomain(currentHostname);
    const allowedDomains = [...PROTON_DOMAINS, currentDomain].filter(Boolean);

    return allowedDomains.some((domain) => isSubDomain(linkHostname, domain));
};
