import { describe, expect, it } from "vitest";
import { getProtonAppUrl } from "./url.ts";

const location = { hostname: "spaces.proton.me", protocol: "https:", port: "" };

describe("getProtonAppUrl", () => {
    it("replaces the first label with the app subdomain", () => {
        expect(getProtonAppUrl("Mail", location)).toBe(
            "https://mail.proton.me",
        );
    });

    it("appends the session local id", () => {
        expect(getProtonAppUrl("Calendar", location, 2)).toBe(
            "https://calendar.proton.me/u/2",
        );
        expect(getProtonAppUrl("Calendar", location, 0)).toBe(
            "https://calendar.proton.me/u/0",
        );
    });

    it("keeps scientist environments", () => {
        const scientist = {
            ...location,
            hostname: "spaces.wilkins.proton.black",
        };
        expect(getProtonAppUrl("Drive", scientist, 1)).toBe(
            "https://drive.wilkins.proton.black/u/1",
        );
    });

    it("keeps hostnames without a second level", () => {
        expect(
            getProtonAppUrl("Mail", {
                hostname: "localhost",
                protocol: "http:",
                port: "",
            }),
        ).toBe("http://mail.localhost");
        expect(
            getProtonAppUrl("Mail", { ...location, hostname: "proton.me" }),
        ).toBe("https://mail.proton.me");
    });

    it("keeps the port", () => {
        const local = {
            hostname: "localhost",
            protocol: "http:",
            port: "1420",
        };
        expect(getProtonAppUrl("Pass", local, 1)).toBe(
            "http://pass.localhost:1420/u/1",
        );
    });

    it("links settings apps to the account app", () => {
        expect(getProtonAppUrl("VPN", location, 1)).toBe(
            "https://account.proton.me/u/1/vpn",
        );
        expect(getProtonAppUrl("Authenticator", location)).toBe(
            "https://account.proton.me/authenticator",
        );
    });

    it("overrides the protonvpn hostname", () => {
        const vpn = {
            hostname: "account.protonvpn.com",
            protocol: "https:",
            port: "",
        };
        expect(getProtonAppUrl("Calendar", vpn, 2)).toBe(
            "https://calendar.proton.me/u/2",
        );
    });
});
