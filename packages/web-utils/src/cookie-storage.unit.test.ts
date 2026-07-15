import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    CookieSameSiteAttributeEnum,
    CookieStorage,
} from "./cookie-storage.ts";

const clearAllCookies = (storage: CookieStorage) => {
    for (const cookie of storage.getCookies()) {
        const name = cookie.split("=")[0];
        if (name) {
            document.cookie = `${name}=;expires=${new Date(0).toUTCString()};path=/`;
        }
    }
};

describe("CookieStorage", () => {
    let storage: CookieStorage;

    beforeEach(() => {
        storage = new CookieStorage();
        clearAllCookies(storage);
    });

    afterEach(() => {
        clearAllCookies(storage);
    });

    describe("getCookie", () => {
        it("should return the value for a matching name", () => {
            expect(storage.getCookie("foo", "foo=bar")).toBe("bar");
        });

        it("should find a cookie among several", () => {
            expect(storage.getCookie("b", "a=1; b=2; c=3")).toBe("2");
        });

        it("should tolerate missing whitespace between cookies", () => {
            expect(storage.getCookie("b", "a=1;b=2;c=3")).toBe("2");
        });

        it("should return undefined when the name is absent", () => {
            expect(storage.getCookie("missing", "a=1; b=2")).toBeUndefined();
        });

        it("should not match on a partial name prefix", () => {
            expect(storage.getCookie("foo", "foobar=nope")).toBeUndefined();
        });

        it("should return an empty string for an empty value", () => {
            expect(storage.getCookie("foo", "foo=")).toBe("");
        });

        it("should treat regex metacharacters in the name literally", () => {
            // The old RegExp-based implementation would have matched "axb"
            // because "." is a wildcard; the literal comparison must not.
            expect(storage.getCookie("a.b", "axb=wrong; a.b=right")).toBe(
                "right",
            );
        });

        it("should safely reject a name crafted for ReDoS", () => {
            expect(storage.getCookie("(a+)+$", "foo=bar")).toBeUndefined();
        });
    });

    describe("getCookies", () => {
        it("should split and trim cookies from an explicit string", () => {
            expect(storage.getCookies("a=1; b=2 ; c=3")).toEqual([
                "a=1",
                "b=2",
                "c=3",
            ]);
        });
    });

    describe("setCookie / getCookie round-trip", () => {
        it("should store and read back a cookie value", () => {
            storage.setCookie({
                cookieName: "session",
                cookieValue: "abc123",
                path: "/",
                secure: false,
                samesite: CookieSameSiteAttributeEnum.Lax,
            });
            expect(storage.getCookie("session", document.cookie)).toBe(
                "abc123",
            );
        });
    });

    describe("deleteCookie", () => {
        it("should remove a previously set cookie", () => {
            storage.setCookie({
                cookieName: "temp",
                cookieValue: "value",
                path: "/",
                secure: false,
            });
            expect(storage.getCookie("temp", document.cookie)).toBe("value");

            storage.deleteCookie("temp");
            expect(storage.getCookie("temp", document.cookie)).toBeUndefined();
        });
    });
});
