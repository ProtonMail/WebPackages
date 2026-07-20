import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { SessionsClient, getLocalIdSessionString } from "./sessions-client.ts";
import { SessionDb, type SessionDbDto } from "../session/session-db.ts";
import {
    SwitcherAccessTypeEnum,
    type LocalSessionResponseDto,
    type StoredSessionDto,
} from "./interface.ts";
import type { SessionsStorage } from "./sessions-storage.ts";

/**
 * Node's global `Request` rejects relative URLs (there is no document base to
 * resolve against). The client builds relative `Request` objects and hands
 * them straight to the injected `fetch`, so a faithful shim backed by the real
 * `Headers` is enough for these unit tests.
 */
class FakeRequest {
    url: string;
    method: string;
    headers: Headers;
    constructor(input: string, init: RequestInit = {}) {
        this.url = input;
        this.method = init.method ?? "GET";
        this.headers = new Headers(init.headers ?? {});
    }
}

function makeDbDto(localId: number): SessionDbDto {
    return {
        data: {
            localId,
            uid: `uid-${localId}`,
            persistent: true,
            trusted: true,
            userId: `user-${localId}`,
            payload: new Uint8Array([1, 2, 3]),
        },
        meta: { persistedAt: 500, usedAt: 1000 },
    };
}

function makeNetworkDto(localId: number): LocalSessionResponseDto {
    return {
        UID: `uid-${localId}`,
        DisplayName: `Display ${localId}`,
        LocalID: localId,
        UserID: `user-${localId}`,
    };
}

function makeStored(localId: number): StoredSessionDto {
    return { localId, accessType: SwitcherAccessTypeEnum.Self };
}

function makeStorage(stored?: number[]): SessionsStorage {
    return {
        read: () => stored?.map(makeStored),
    } as unknown as SessionsStorage;
}

interface FetchOptions {
    network?: number[];
    listStatus?: number;
    listBody?: string;
    /** Maps a session uid (`uid-<localId>`) to the status of the key request. */
    keyStatusByUid?: Record<string, number>;
}

function makeFetch(opts: FetchOptions = {}) {
    const {
        network = [],
        listStatus = 200,
        listBody,
        keyStatusByUid = {},
    } = opts;
    return vi.fn((request: Request): Promise<Response> => {
        if (request.url.includes("/auth/v4/sessions/local/key")) {
            const uid = request.headers.get("x-pm-uid") ?? "";
            return Promise.resolve(
                new Response(null, { status: keyStatusByUid[uid] ?? 200 }),
            );
        }
        return Promise.resolve(
            new Response(
                listBody ??
                    JSON.stringify({ Sessions: network.map(makeNetworkDto) }),
                { status: listStatus },
            ),
        );
    });
}

/** Number of calls to the "list sessions" endpoint (ignores key requests). */
function listCallCount(fetchMock: ReturnType<typeof makeFetch>): number {
    return fetchMock.mock.calls.filter(
        ([request]) => !request.url.includes("/key"),
    ).length;
}

async function setupClient(opts: {
    db: number[];
    stored?: number[];
    fetch: ReturnType<typeof makeFetch>;
}) {
    const sessionDb = new SessionDb();
    for (const id of opts.db) {
        await sessionDb.save(makeDbDto(id));
    }
    const client = new SessionsClient({
        fetch: opts.fetch as unknown as typeof window.fetch,
        sessionsStorage: makeStorage(opts.stored),
        sessionDb,
    });
    return { client, sessionDb };
}

beforeEach(() => {
    indexedDB = new IDBFactory();
    vi.stubGlobal("Request", FakeRequest);
    // Skip the fire-and-forget cleanup by default so it can't affect fetch
    // counts or leave dangling work. The cleanup suite opts back in.
    vi.stubGlobal("navigator", {
        locks: { request: vi.fn(() => null) },
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("getLocalIdSessionString", () => {
    it("joins ids in ascending order", () => {
        expect(getLocalIdSessionString([3, 1, 2])).toBe("1,2,3");
    });

    it("produces the same string regardless of input order", () => {
        expect(getLocalIdSessionString([2, 1, 3])).toBe(
            getLocalIdSessionString([3, 2, 1]),
        );
    });

    it("returns an empty string when there are no ids", () => {
        expect(getLocalIdSessionString([])).toBe("");
    });
});

describe("getSessions", () => {
    it("returns sessions present both locally and on the network", async () => {
        const fetch = makeFetch({ network: [1, 2] });
        const { client } = await setupClient({
            db: [1, 2],
            stored: [1, 2],
            fetch,
        });

        const result = await client.getSessions();

        expect(result).toHaveLength(2);
        const byId = new Map(result.map((s) => [s.networkSession.LocalID, s]));
        expect(byId.get(1)?.dbSession?.data.localId).toBe(1);
        expect(byId.get(1)?.storedSession?.localId).toBe(1);
        expect(byId.get(2)?.dbSession?.data.localId).toBe(2);
        expect(byId.get(2)?.storedSession?.localId).toBe(2);
    });

    it("includes stored sessions without a DB entry", async () => {
        const fetch = makeFetch({ network: [1, 2] });
        const { client } = await setupClient({
            db: [1],
            stored: [1, 2],
            fetch,
        });

        const result = await client.getSessions();
        const byId = new Map(result.map((s) => [s.networkSession.LocalID, s]));

        expect(result).toHaveLength(2);
        expect(byId.get(2)?.storedSession?.localId).toBe(2);
        expect(byId.get(2)?.dbSession).toBeUndefined();
    });

    it("includes DB sessions without a stored counterpart", async () => {
        const fetch = makeFetch({ network: [1, 2] });
        const { client } = await setupClient({
            db: [1, 2],
            stored: [1],
            fetch,
        });

        const result = await client.getSessions();
        const byId = new Map(result.map((s) => [s.networkSession.LocalID, s]));

        expect(result).toHaveLength(2);
        expect(byId.get(2)?.dbSession?.data.localId).toBe(2);
        expect(byId.get(2)?.storedSession).toBeUndefined();
    });

    it("excludes local sessions not returned by the network", async () => {
        const fetch = makeFetch({ network: [1] });
        const { client } = await setupClient({
            db: [1, 2],
            stored: [1, 2],
            fetch,
        });

        const result = await client.getSessions();

        expect(result.map((s) => s.networkSession.LocalID)).toEqual([1]);
    });

    it("returns an empty list when the network request fails", async () => {
        const fetch = makeFetch({ network: [1], listStatus: 500 });
        const { client } = await setupClient({ db: [1], stored: [1], fetch });

        expect(await client.getSessions()).toEqual([]);
    });

    it("returns an empty list when the network body is not an array", async () => {
        const fetch = makeFetch({ listBody: "{}", listStatus: 200 });
        const { client } = await setupClient({ db: [1], stored: [1], fetch });

        expect(await client.getSessions()).toEqual([]);
    });
});

describe("getSessions caching", () => {
    it("does not hit the network again when local sessions are unchanged", async () => {
        const fetch = makeFetch({ network: [1, 2] });
        const { client } = await setupClient({
            db: [1, 2],
            stored: [1, 2],
            fetch,
        });

        const first = await client.getSessions();
        const second = await client.getSessions();

        expect(listCallCount(fetch)).toBe(1);
        expect(second).toBe(first);
    });

    it("hits the network again when local sessions change", async () => {
        const fetch = makeFetch({ network: [1, 2, 3] });
        const { client, sessionDb } = await setupClient({
            db: [1, 2],
            stored: [1, 2],
            fetch,
        });

        const first = await client.getSessions();
        expect(first.map((s) => s.networkSession.LocalID)).toEqual([1, 2]);

        // A new local session appears, so the cache key no longer matches.
        await sessionDb.save(makeDbDto(3));
        const second = await client.getSessions();

        expect(listCallCount(fetch)).toBe(2);
        expect(second.map((s) => s.networkSession.LocalID)).toEqual([1, 2, 3]);
    });
});

describe("getSessions cleanup of inactive sessions", () => {
    const realSetTimeout = globalThis.setTimeout;

    beforeEach(() => {
        // Collapse the 2s throttle between cleanup iterations to a real
        // zero-delay timer so the sequential loop finishes quickly without
        // disrupting fake-indexeddb's scheduling.
        vi.stubGlobal("setTimeout", (callback: () => void) =>
            realSetTimeout(callback, 0),
        );
    });

    /**
     * Cleanup runs as a fire-and-forget task inside getSessions, so there is no
     * promise to await. This fetch mock records key requests and lets a test
     * wait until a given number of them have been handled — at which point all
     * earlier (sequential) cleanup steps, including any DB deletions, are done.
     */
    function makeCleanupFetch(opts: {
        network: number[];
        keyStatusByUid?: Record<string, number>;
    }) {
        const keyUids: string[] = [];
        const waiters: { count: number; resolve: () => void }[] = [];
        const fetch = vi.fn((request: Request): Promise<Response> => {
            if (request.url.includes("/key")) {
                const uid = request.headers.get("x-pm-uid") ?? "";
                keyUids.push(uid);
                for (const waiter of waiters) {
                    if (keyUids.length >= waiter.count) {
                        waiter.resolve();
                    }
                }
                return Promise.resolve(
                    new Response(null, {
                        status: opts.keyStatusByUid?.[uid] ?? 200,
                    }),
                );
            }
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        Sessions: opts.network.map(makeNetworkDto),
                    }),
                    { status: 200 },
                ),
            );
        });
        const whenKeyRequests = (count: number) =>
            new Promise<void>((resolve) => {
                if (keyUids.length >= count) {
                    resolve();
                } else {
                    waiters.push({ count, resolve });
                }
            });
        return { fetch, keyUids, whenKeyRequests };
    }

    it("deletes DB sessions revoked by the network (401) and keeps the rest", async () => {
        const { fetch, keyUids, whenKeyRequests } = makeCleanupFetch({
            network: [1],
            keyStatusByUid: { "uid-2": 401, "uid-3": 200 },
        });
        const { client, sessionDb } = await setupClient({
            db: [1, 2, 3],
            stored: [1, 2, 3],
            fetch,
        });

        await client.getSessions();
        // Both inactive sessions (2 and 3) have been checked; because the loop
        // is sequential, session 2's 401-triggered deletion is already done.
        await whenKeyRequests(2);

        // Session 2 was rejected with 401 -> removed. Session 3 answered 200 and
        // session 1 is still active -> both kept.
        expect(await sessionDb.get(2)).toBeUndefined();
        expect(await sessionDb.get(3)).toBeDefined();
        expect(await sessionDb.get(1)).toBeDefined();
        expect(keyUids).toContain("uid-2");
        expect(keyUids).toContain("uid-3");
    });

    it("does not touch DB sessions that are still active on the network", async () => {
        const { fetch, keyUids } = makeCleanupFetch({ network: [1, 2] });
        const { client, sessionDb } = await setupClient({
            db: [1, 2],
            stored: [1, 2],
            fetch,
        });

        await client.getSessions();

        expect(await sessionDb.get(1)).toBeDefined();
        expect(await sessionDb.get(2)).toBeDefined();
        // Nothing was missing, so cleanup makes no key requests.
        expect(keyUids).toHaveLength(0);
    });
});
