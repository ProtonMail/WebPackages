import { describe, expect, it } from "vitest";
import {
    getHostname,
    getRootDomain,
    isExternal,
    isMailTo,
    isProtonDomain,
} from "./url.ts";

const windowHostname = "calendar.proton.me";

describe("getRootDomain", () => {
    it("should strip the first subdomain label", () => {
        expect(getRootDomain("calendar.proton.me")).toBe("proton.me");
    });

    it("should return the input when there is no subdomain", () => {
        expect(getRootDomain("proton.me")).toBe("me");
    });
});

describe("getHostname", () => {
    it("should extract the hostname from a full URL", () => {
        expect(getHostname("https://mail.proton.me/u/0/inbox")).toBe(
            "mail.proton.me",
        );
    });
});

describe("isMailTo", () => {
    it("should detect a mailto link", () => {
        expect(isMailTo("mailto:user@proton.me")).toBe(true);
    });

    it("should be case-insensitive", () => {
        expect(isMailTo("MAILTO:user@proton.me")).toBe(true);
    });

    it("should reject a non-mailto URL", () => {
        expect(isMailTo("https://proton.me")).toBe(false);
    });
});

describe("isExternal", () => {
    it("should treat a proton subdomain as internal", () => {
        expect(isExternal("https://mail.proton.me", windowHostname)).toBe(
            false,
        );
    });

    it("should treat an unknown domain as external", () => {
        expect(isExternal("https://example.com", windowHostname)).toBe(true);
    });

    it("should treat a mailto link as not external", () => {
        expect(isExternal("mailto:user@proton.me", windowHostname)).toBe(false);
    });
});

describe("isProtonDomain", () => {
    it("should recognise known proton domains", () => {
        expect(isProtonDomain("mail.protonmail.com", windowHostname)).toBe(
            true,
        );
        expect(isProtonDomain("proton.me", windowHostname)).toBe(true);
    });

    it("should recognise subdomains of the current host", () => {
        expect(isProtonDomain("account.proton.me", windowHostname)).toBe(true);
    });

    it("should reject unrelated domains", () => {
        expect(isProtonDomain("example.com", windowHostname)).toBe(false);
    });
});
