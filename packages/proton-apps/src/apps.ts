/** Product names returned by `GET /core/v4/users/apps`, used as app ids. */
export type ProtonAppId =
    | "Mail"
    | "Calendar"
    | "VPN"
    | "Drive"
    | "Docs"
    | "Sheets"
    | "Pass"
    | "Wallet"
    | "Lumo"
    | "Meet"
    | "Authenticator"
    | "Spaces";

export interface ProtonApp {
    id: ProtonAppId;
    /** Full brand name, never translated */
    name: string;
    shortName: string;
    altName?: string;
    subdomain: string;
    /** Path within the subdomain, for apps reached through account settings */
    path?: string;
    isNew?: boolean;
    isHiddenFromAppSwitcher?: boolean;
}

/** Declared in app switcher display order. */
export const PROTON_APPS: Readonly<Record<ProtonAppId, ProtonApp>> = {
    Mail: {
        id: "Mail",
        name: "Proton Mail",
        shortName: "Mail",
        subdomain: "mail",
    },
    Calendar: {
        id: "Calendar",
        name: "Proton Calendar",
        shortName: "Calendar",
        subdomain: "calendar",
    },
    VPN: {
        id: "VPN",
        name: "Proton VPN",
        shortName: "VPN",
        subdomain: "account",
        path: "vpn",
    },
    Drive: {
        id: "Drive",
        name: "Proton Drive",
        shortName: "Drive",
        subdomain: "drive",
    },
    Docs: {
        id: "Docs",
        name: "Proton Docs",
        shortName: "Docs",
        subdomain: "docs",
    },
    Sheets: {
        id: "Sheets",
        name: "Proton Sheets",
        shortName: "Sheets",
        subdomain: "sheets",
        isNew: true,
    },
    Pass: {
        id: "Pass",
        name: "Proton Pass",
        shortName: "Pass",
        subdomain: "pass",
    },
    Wallet: {
        id: "Wallet",
        name: "Proton Wallet",
        shortName: "Wallet",
        subdomain: "wallet",
    },
    Lumo: {
        id: "Lumo",
        name: "Lumo",
        shortName: "Lumo",
        altName: "Lumo AI",
        subdomain: "lumo",
        isNew: true,
    },
    Meet: {
        id: "Meet",
        name: "Proton Meet",
        shortName: "Meet",
        subdomain: "meet",
        isNew: true,
    },
    Authenticator: {
        id: "Authenticator",
        name: "Proton Authenticator",
        shortName: "Authenticator",
        subdomain: "account",
        path: "authenticator",
        isHiddenFromAppSwitcher: true,
    },
    Spaces: {
        id: "Spaces",
        name: "Proton Spaces",
        shortName: "Spaces",
        subdomain: "spaces",
        isNew: true,
    },
};

export const isProtonAppId = (value: string): value is ProtonAppId =>
    Object.hasOwn(PROTON_APPS, value);

/**
 * Apps shown to everyone, e.g. as a fallback or for a logged-out switcher.
 * Excludes Spaces, which is whitelist-only: see `getAppSwitcherApps`.
 */
export const APP_SWITCHER_APPS: readonly ProtonApp[] = Object.values(
    PROTON_APPS,
).filter(
    ({ id, isHiddenFromAppSwitcher }) =>
        !isHiddenFromAppSwitcher && id !== "Spaces",
);

/**
 * Unknown product names are ignored, the `current` app is always kept.
 * Spaces is only added when the API returns it (or it is the `current` app).
 */
export const getAppSwitcherApps = (
    allowedProducts: readonly string[],
    current?: ProtonAppId,
): ProtonApp[] => {
    const allowed = new Set(allowedProducts.filter(isProtonAppId));
    const apps = APP_SWITCHER_APPS.filter(
        ({ id }) => id === current || allowed.has(id),
    );
    if (current === "Spaces" || allowed.has("Spaces")) {
        apps.push(PROTON_APPS.Spaces);
    }
    return apps;
};
