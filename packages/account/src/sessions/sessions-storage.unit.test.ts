import { describe, it, expect } from "vitest";
import { SessionsStorage } from "./sessions-storage.ts";
import type { CookieStorage } from "@protontech/web-utils/cookie-storage.ts";

const read = (items: unknown) => {
    const value = new TextEncoder()
        .encode(JSON.stringify(items))
        .toBase64({ alphabet: "base64url", omitPadding: true });
    const cookieStorage = {
        getCookie: () => value,
    } as unknown as CookieStorage;
    return new SessionsStorage({ cookieStorage, domain: "proton.me" }).read();
};

describe("SessionsStorage.read", () => {
    it("reads the local id from both item shapes, ignoring the legacy access type", () => {
        expect(read([1, { l: 2, a: 1 }, { l: 3 }])).toEqual([
            { localId: 1 },
            { localId: 2 },
            { localId: 3 },
        ]);
    });

    it("drops items without an integer local id", () => {
        expect(read([{ l: "2" }, { a: 1 }, 1.5, null, 4])).toEqual([
            { localId: 4 },
        ]);
    });

    it("returns undefined when nothing is readable", () => {
        expect(read([{ a: 1 }])).toBeUndefined();
        expect(read({ l: 1 })).toBeUndefined();
    });
});
