import { describe, it, expect, vi } from "vitest";
import { SessionMem } from "./session-mem.ts";

const getStore = () => {
    const map = new Map<string, string>();
    return {
        getItem: async (key: string) => map.get(key) ?? null,
        setItem: async (key: string, value: string) => {
            map.set(key, value);
        },
        clearItem: vi.fn(async (key: string) => {
            map.delete(key);
        }),
    };
};

function makeDto(localId: number, keyPassword = "kp", clientKey = "ck") {
    return { localId, keyPassword, clientKey };
}

describe("SessionMem.load", () => {
    it("returns undefined when storage is empty", async () => {
        const mem = new SessionMem(getStore());
        expect(await mem.load(1)).toBeUndefined();
    });

    it("returns the session when localId matches", async () => {
        const mem = new SessionMem(getStore());
        const dto = makeDto(1);
        await mem.save(dto);
        expect(await mem.load(1)).toEqual(dto);
    });

    it("returns the session when localId is undefined", async () => {
        const mem = new SessionMem(getStore());
        const dto = makeDto(1);
        await mem.save(dto);
        expect(await mem.load(undefined)).toEqual(dto);
    });

    it("returns undefined when localId does not match the stored session", async () => {
        const mem = new SessionMem(getStore());
        await mem.save(makeDto(1));
        expect(await mem.load(99)).toBeUndefined();
    });

    it("returns undefined when the stored value is not valid JSON", async () => {
        const store = getStore();
        await store.setItem("session", "not-json{{{");
        const mem = new SessionMem(store);
        expect(await mem.load(undefined)).toBeUndefined();
    });

    it("calls clearItem to evict corrupted data", async () => {
        const store = getStore();
        await store.setItem("session", "not-json{{{");
        const mem = new SessionMem(store);
        await mem.load(undefined);
        expect(store.clearItem).toHaveBeenCalledWith("session");
    });
});

describe("SessionMem.save", () => {
    it("overwrites the previous session", async () => {
        const mem = new SessionMem(getStore());
        await mem.save(makeDto(1, "old-kp", "old-ck"));
        const next = makeDto(2, "new-kp", "new-ck");
        await mem.save(next);
        expect(await mem.load(2)).toEqual(next);
        expect(await mem.load(1)).toBeUndefined();
    });
});
