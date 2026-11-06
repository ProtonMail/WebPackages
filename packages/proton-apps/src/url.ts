import { PROTON_APPS, type ProtonAppId } from "./apps.ts";

export interface AppLocation {
    hostname: string;
    protocol: string;
    port: string;
}

const VPN_HOSTNAME = "account.protonvpn.com";

/**
 * Same rules as the web clients `getAppHref`, e.g. `https://spaces.proton.me` → `https://mail.proton.me/u/1`.
 * Does not handle multi-label TLDs such as `.co.uk`.
 */
export const getProtonAppUrl = (
    id: ProtonAppId,
    location: AppLocation,
    localId?: number,
): string => {
    const { subdomain, path } = PROTON_APPS[id];
    const { hostname, protocol, port } =
        location.hostname === VPN_HOSTNAME
            ? { hostname: "proton.me", protocol: "https:", port: "" }
            : location;

    const firstDot = hostname.indexOf(".");
    const baseDomain =
        firstDot !== hostname.lastIndexOf(".")
            ? hostname.slice(firstDot + 1)
            : hostname;
    const host = `${subdomain}.${baseDomain}${port ? `:${port}` : ""}`;

    const segments = [
        host,
        localId === undefined ? undefined : `u/${localId}`,
        path,
    ].filter(Boolean);
    return `${protocol}//${segments.join("/")}`;
};
