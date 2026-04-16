import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { getItem, setItem } from "./secure-session-storage.ts";

// Real AES-GCM crypto runs fine in Node 18+.
// Only browser globals need to be stubbed.

beforeAll(() => {
    if (!Uint8Array.fromBase64) {
        Uint8Array.fromBase64 = function (
            base64: string,
        ): Uint8Array<ArrayBuffer> {
            const binary = atob(base64);
            const bytes = new Uint8Array<ArrayBuffer>(
                new ArrayBuffer(binary.length),
            );

            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }

            return bytes;
        };
    }
    if (!Uint8Array.prototype.toBase64) {
        Uint8Array.prototype.toBase64 = function () {
            let binary = "";
            for (let i = 0; i < this.length; i++) {
                const value = this[i];
                if (value !== undefined) {
                    binary += String.fromCharCode(value);
                }
            }
            return btoa(binary);
        };
    }
});

const windowStub = { name: "" };
const sessionStorageStub = (() => {
    const data = new Map<string, string>();
    return {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => data.set(key, value),
        _clear: () => data.clear(),
    };
})();

beforeEach(() => {
    windowStub.name = "";
    sessionStorageStub._clear();
    vi.stubGlobal("window", windowStub);
    vi.stubGlobal("sessionStorage", sessionStorageStub);
});

describe("getItem", () => {
    it("returns null when the key is absent from sessionStorage", async () => {
        expect(await getItem("missing")).toBeNull();
    });

    it("returns null when window.name is empty even if a value is stored", async () => {
        await setItem("k", "secret");
        windowStub.name = "";
        expect(await getItem("k")).toBeNull();
    });

    it("returns null when window.name holds an unrelated key", async () => {
        await setItem("k", "secret");
        // Overwrite window.name with a freshly generated but unrelated key.
        await setItem("other", "different");
        // window.name now holds the key for "other", not "k".
        expect(await getItem("k")).toBeNull();
    });

    it("returns null when the ciphertext in sessionStorage is corrupted", async () => {
        await setItem("k", "secret");
        // Corrupt the stored ciphertext while keeping window.name intact.
        const goodKey = windowStub.name;
        sessionStorageStub._clear();
        sessionStorageStub.setItem("k", "bm90LXZhbGlkLWJhc2U2NA==");
        windowStub.name = goodKey;
        expect(await getItem("k")).toBeNull();
    });
});

describe("setItem / getItem round-trip", () => {
    it("recovers the original string after a save", async () => {
        await setItem("k", "hello");
        expect(await getItem("k")).toBe("hello");
    });

    it("handles an empty string value", async () => {
        await setItem("k", "");
        expect(await getItem("k")).toBe("");
    });

    it("handles a unicode value", async () => {
        const value = "cöffëë ☕ \u{1F600}";
        await setItem("k", value);
        expect(await getItem("k")).toBe(value);
    });

    it("stores each key independently", async () => {
        await setItem("a", "alpha");
        const keyForA = windowStub.name;
        await setItem("b", "beta");
        const keyForB = windowStub.name;

        windowStub.name = keyForB;
        expect(await getItem("b")).toBe("beta");

        // "a" was encrypted with keyForA; keyForB cannot decrypt it.
        windowStub.name = keyForA;
        expect(await getItem("b")).toBeNull();
    });

    it("overwrites the value when called twice with the same key", async () => {
        await setItem("k", "first");
        await setItem("k", "second");
        expect(await getItem("k")).toBe("second");
    });
});
