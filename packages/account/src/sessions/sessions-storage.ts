import {
    type StoredSessionDto,
    type SwitcherAccessType,
    SwitcherAccessTypeEnum,
} from "./interface.ts";
import type { CookieStorage } from "@protontech/web-utils/cookie-storage.ts";

const cookieName = "iaas";

const fromItem = (value: unknown): StoredSessionDto | undefined => {
    if (Number.isInteger(value)) {
        return {
            localId: Number(value),
            accessType: SwitcherAccessTypeEnum.Self,
        };
    }
    if (
        typeof value === "object" &&
        value !== null &&
        "l" in value &&
        "a" in value
    ) {
        return {
            localId: Number(value.l),
            accessType: value.a as SwitcherAccessType,
        };
    }
};

const from = (value: string | undefined): StoredSessionDto[] | undefined => {
    try {
        if (!value) {
            return;
        }
        const str = new TextDecoder().decode(
            Uint8Array.fromBase64(value, { alphabet: "base64url" }),
        );
        const parsedValue: unknown = JSON.parse(str);
        if (!Array.isArray(parsedValue)) {
            return;
        }
        const parsedArray = parsedValue
            .map(fromItem)
            .filter((value) => !!value);
        if (parsedArray.length) {
            return parsedArray;
        }
    } catch {
        return;
    }
};

export class SessionsStorage {
    #cookieStorage: CookieStorage;
    #domain: string;

    constructor({
        cookieStorage,
        domain,
    }: {
        cookieStorage: CookieStorage;
        domain: string;
    }) {
        this.#cookieStorage = cookieStorage;
        this.#domain = domain;
    }

    #syncToCookie(cookieValue: string) {
        this.#cookieStorage.setCookie({
            cookieName,
            cookieValue,
            cookieDomain: this.#domain,
            path: "/",
            expirationDate: "max",
        });
    }

    read() {
        const cookieValue = this.#cookieStorage.getCookie(cookieName);
        return from(cookieValue);
    }

    /**
     * The purpose of this function is to extend the lifetime of the iaas cookie.
     * It rewrites whatever value it currently has so that the expiration increases.
     * This is important because browsers cap the maximum expiration of a cookie, where
     * certain browsers like brave or safari cap them at 7 days.
     */
    update() {
        const cookieValue = this.#cookieStorage.getCookie(cookieName);
        if (!cookieValue) {
            return false;
        }
        this.#syncToCookie(cookieValue);
        return true;
    }
}
