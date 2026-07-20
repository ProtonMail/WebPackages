import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { SessionDb } from "./session-db.ts";
import type { SessionDbDto } from "./session-db.ts";

beforeEach(() => {
    indexedDB = new IDBFactory();
});

function makeDto(
    localId: number,
    usedAt = 1000,
    persistedAt = 500,
): SessionDbDto {
    return {
        data: {
            localId,
            uid: `uid-${localId}`,
            persistent: true,
            trusted: true,
            userId: `user-${localId}`,
            payload: new Uint8Array([1, 2, 3]),
        },
        meta: { persistedAt, usedAt },
    };
}

describe("SessionDb.save / get", () => {
    it("returns undefined for a missing localId", async () => {
        const db = new SessionDb();
        expect(await db.get(99)).toBeUndefined();
    });

    it("round-trips a saved session", async () => {
        const db = new SessionDb();
        const dto = makeDto(1);
        await db.save(dto);
        expect(await db.get(1)).toEqual(dto);
    });

    it("overwrites an existing entry on re-save", async () => {
        const db = new SessionDb();
        await db.save(makeDto(1, 1000));
        const updated = makeDto(1, 9999);
        await db.save(updated);
        expect(await db.get(1)).toEqual(updated);
    });
});

describe("SessionDb.delete", () => {
    it("removes a saved session", async () => {
        const db = new SessionDb();
        const dto = makeDto(2);
        await db.save(dto);
        await db.delete(dto);
        expect(await db.get(2)).toBeUndefined();
    });

    it("is a no-op when the session does not exist", async () => {
        const db = new SessionDb();
        // Should not throw
        await expect(db.delete(makeDto(99))).resolves.toBeUndefined();
    });
});

describe("SessionDb.getLastUsed", () => {
    it("returns undefined when the store is empty", async () => {
        const db = new SessionDb();
        expect(await db.getLastUsed()).toBeUndefined();
    });

    it("returns the session with the highest usedAt", async () => {
        const db = new SessionDb();
        await db.save(makeDto(1, 100));
        await db.save(makeDto(2, 300));
        await db.save(makeDto(3, 200));
        const last = await db.getLastUsed();
        expect(last?.data.localId).toBe(2);
    });

    it("returns the only session when there is exactly one", async () => {
        const db = new SessionDb();
        const dto = makeDto(1, 500);
        await db.save(dto);
        expect(await db.getLastUsed()).toEqual(dto);
    });
});

describe("SessionDb.setLastUsed", () => {
    it("updates usedAt and persists the change", async () => {
        const db = new SessionDb();
        const dto = makeDto(1, 1000);
        await db.save(dto);
        await db.setLastUsed(dto, 9999);
        const loaded = await db.get(1);
        expect(loaded?.meta.usedAt).toBe(9999);
    });

    it("does not mutate other meta fields", async () => {
        const db = new SessionDb();
        const dto = makeDto(1, 1000, 42);
        await db.save(dto);
        await db.setLastUsed(dto, 9999);
        const loaded = await db.get(1);
        expect(loaded?.meta.persistedAt).toBe(42);
    });

    it("makes the session appear as last used", async () => {
        const db = new SessionDb();
        await db.save(makeDto(1, 100));
        await db.save(makeDto(2, 50));
        await db.setLastUsed(makeDto(2, 50), 9999);
        const last = await db.getLastUsed();
        expect(last?.data.localId).toBe(2);
    });
});
