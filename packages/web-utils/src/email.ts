/**
 * Canonicalization schemes for email addresses.
 * Emails sharing the same canonical form resolve to the same inbox.
 * See https://confluence.protontech.ch/display/MBE/Canonize+email+addresses
 */
export const CANONICALIZE_SCHEME = {
    DEFAULT: "default",
    PLUS: "plus",
    GMAIL: "gmail",
    PROTON: "proton",
} as const;

type CanonicalizeScheme =
    (typeof CANONICALIZE_SCHEME)[keyof typeof CANONICALIZE_SCHEME];

const PROTONMAIL_DOMAINS = [
    "protonmail.com",
    "protonmail.ch",
    "pm.me",
    "proton.me",
];

const getEmailParts = (email: string): [localPart: string, domain: string] => {
    const atIdx = email.lastIndexOf("@");
    if (atIdx === -1) {
        return [email, ""];
    }
    return [email.slice(0, atIdx), email.slice(atIdx + 1)];
};

const removePlusAlias = (localPart: string) => {
    const plusIdx = localPart.indexOf("+");
    return plusIdx === -1 ? localPart : localPart.slice(0, plusIdx);
};

export const canonicalizeEmail = (
    email: string,
    scheme: CanonicalizeScheme = CANONICALIZE_SCHEME.DEFAULT,
): string => {
    const [localPart, domain] = getEmailParts(email);
    const at = email[email.length - domain.length - 1] === "@" ? "@" : "";

    if (scheme === CANONICALIZE_SCHEME.PROTON) {
        const cleanLocalPart = removePlusAlias(localPart);
        const normalizedLocalPart = cleanLocalPart
            .replace(/[._-]/g, "")
            .toLowerCase(); // Remove dots, underscores, and hyphens
        const normalizedDomain = domain.toLowerCase();

        return `${normalizedLocalPart}${at}${normalizedDomain}`;
    }

    if (scheme === CANONICALIZE_SCHEME.GMAIL) {
        const cleanLocalPart = removePlusAlias(localPart);
        const normalizedLocalPart = cleanLocalPart
            .replace(/[.]/g, "")
            .toLowerCase(); // Remove dots
        const normalizedDomain = domain.toLowerCase();

        return `${normalizedLocalPart}${at}${normalizedDomain}`;
    }

    if (scheme === CANONICALIZE_SCHEME.PLUS) {
        const cleanLocalPart = removePlusAlias(localPart);
        const normalizedLocalPart = cleanLocalPart.toLowerCase();
        const normalizedDomain = domain.toLowerCase();

        return `${normalizedLocalPart}${at}${normalizedDomain}`;
    }

    return email.toLowerCase();
};

export const canonicalizeInternalEmail = (email: string) =>
    canonicalizeEmail(email, CANONICALIZE_SCHEME.PROTON);

/**
 * Canonicalize an email by guessing the scheme that should be applied
 * Notice that this helper will not apply the Proton scheme on custom domains;
 * Only the back-end knows about custom domains, but they also apply the default scheme in those cases.
 */
export const canonicalizeEmailByGuess = (email: string) => {
    const [, domain] = getEmailParts(email);
    const normalizedDomain = domain.toLowerCase();
    if (PROTONMAIL_DOMAINS.includes(normalizedDomain)) {
        return canonicalizeEmail(email, CANONICALIZE_SCHEME.PROTON);
    }
    if (
        ["gmail.com", "googlemail.com", "google.com"].includes(normalizedDomain)
    ) {
        return canonicalizeEmail(email, CANONICALIZE_SCHEME.GMAIL);
    }
    if (
        [
            "hotmail.com",
            "hotmail.co.uk",
            "hotmail.fr",
            "outlook.com",
            "yandex.ru",
            "mail.ru",
        ].includes(normalizedDomain)
    ) {
        return canonicalizeEmail(email, CANONICALIZE_SCHEME.PLUS);
    }
    return canonicalizeEmail(email, CANONICALIZE_SCHEME.DEFAULT);
};

const validateLocalPart = (localPart: string) => {
    // remove comments first
    const match = /(^\(.+?\))?([^()]*)(\(.+?\)$)?/.exec(localPart);
    if (!match) {
        return false;
    }
    const uncommentedPart = match[2];
    if (uncommentedPart && /^".+"$/.test(uncommentedPart)) {
        // case of a quoted string
        // The only characters non-allowed are \ and " unless preceded by a backslash
        const quotedText = uncommentedPart.slice(1, -1);
        const chunks = quotedText
            .split('\\"')
            .map((chunk) => chunk.split("\\\\"))
            .flat();
        return !chunks.some((chunk) => /"|\\/.test(chunk));
    }
    return !/[^a-zA-Z0-9!#$%&'*+/=?^_`{|}~.-]|^\.|\.$|\.\./.test(
        uncommentedPart ?? "",
    );
};

export const matchesEmailDomainPreferredSyntax = (domain: string): boolean => {
    const domainRegex =
        /^((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+([a-zA-Z]{2,}[0-9]*|xn--[a-zA-Z\-0-9]+)))$/;
    return domainRegex.test(domain); // nosemgrep
};

/**
 * Validate the domain of an email string according to the preferred name syntax of the RFC https://tools.ietf.org/html/rfc1034.
 * Actually almost anything is allowed as domain name https://tools.ietf.org/html/rfc2181#section-11, but we stick
 * to the preferred one, allowing underscores which are common in the wild.
 * See also https://en.wikipedia.org/wiki/Email_address#Domain
 */
export const validateDomain = (domain: string) => {
    if (domain.length > 255) {
        return false;
    }
    if (matchesEmailDomainPreferredSyntax(domain)) {
        return true;
    }
    const dnsLabels = domain.toLowerCase().split(".").filter(Boolean);
    if (dnsLabels.length < 2) {
        return false;
    }
    const topLevelDomain = dnsLabels.pop();
    if (!/^[a-z0-9]+$/.test(topLevelDomain ?? "")) {
        return false;
    }
    return !dnsLabels.some((label) => {
        return /[^a-z0-9-_]|^-|-$/.test(label);
    });
};

export const isNoReplyEmail = (email: string) => {
    const normalizedEmail = canonicalizeEmailByGuess(email);
    const [localPart] = getEmailParts(normalizedEmail);
    const normalizedLocalPart = localPart.replace(/[._-]/g, ""); // Remove dots, underscores, and hyphens
    return (
        normalizedLocalPart.includes("noreply") ||
        normalizedLocalPart.includes("donotreply")
    );
};

/**
 * Validate an email string according to the RFC https://tools.ietf.org/html/rfc5322;
 * see also https://en.wikipedia.org/wiki/Email_address
 */
export const validateEmailAddress = (email: string) => {
    const [localPart, domain] = getEmailParts(email);
    if (!localPart || !domain) {
        return false;
    }
    return validateLocalPart(localPart) && validateDomain(domain);
};
