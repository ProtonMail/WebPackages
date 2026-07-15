import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "fake-indexeddb/auto";
import {
    SessionPersistence,
    SessionError,
    SessionAuthError,
    SessionErrorCode,
} from "./session-persistence.ts";
import { SessionDb, type SessionDbDto } from "./session-db.ts";
import { SessionMem } from "./session-mem.ts";
import { generateClientKey, getClientKey } from "./client-key.ts";
import { encryptBlob, decryptBlob } from "./session-blob-crypto.ts";

// The crypto helpers have their own concerns; SessionPersistence is only
// responsible for orchestration and error handling, so stub them out.
vi.mock("./client-key.ts", () => ({
    generateClientKey: vi.fn(),
    getClientKey: vi.fn(),
    getParsedClientKey: vi.fn(),
}));
vi.mock("./session-blob-crypto.ts", () => ({
    encryptBlob: vi.fn(),
    decryptBlob: vi.fn(),
}));

/**
 * Node's global `Request` rejects relative URLs. SessionPersistence builds
 * relative `Request`s and passes them straight to the injected `fetch`, so a
 * faithful shim backed by the real `Headers` is enough here.
 */
class FakeRequest {
    url: string;
    method: string;
    headers: Headers;
    body: BodyInit | null | undefined;
    constructor(input: string, init: RequestInit = {}) {
        this.url = input;
        this.method = init.method ?? "GET";
        this.headers = new Headers(init.headers ?? {});
        this.body = init.body;
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

/** In-memory replacement for the secure session storage backing SessionMem. */
function makeMemStore() {
    const map = new Map<string, string>();
    return {
        getItem: vi.fn((key: string): Promise<string | null> =>
            Promise.resolve(map.get(key) ?? null),
        ),
        setItem: vi.fn((key: string, data: string): Promise<void> => {
            map.set(key, data);
            return Promise.resolve();
        }),
        clearItem: vi.fn((key: string): Promise<void> => {
            map.delete(key);
            return Promise.resolve();
        }),
    };
}

function jsonResponse(status: number, body?: unknown): Promise<Response> {
    return Promise.resolve(
        new Response(body === undefined ? null : JSON.stringify(body), {
            status,
        }),
    );
}

/**
 * Captures the rejection of a promise. Needed because `SessionAuthError`
 * inherits `SessionError`'s constructor and so reports `name === "SessionError"`
 * — only `instanceof` distinguishes the two.
 */
async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    throw new Error("Expected promise to reject, but it resolved");
}

function setup(fetchImpl?: (request: Request) => Promise<Response>) {
    const sessionDb = new SessionDb();
    const sessionMem = new SessionMem(makeMemStore());
    const fetch = vi.fn<(request: Request) => Promise<Response>>(
        fetchImpl ?? (() => jsonResponse(200)),
    );
    const persistence = new SessionPersistence({
        fetch: fetch as unknown as typeof window.fetch,
        sessionDb,
        sessionMem,
    });
    return { persistence, sessionDb, sessionMem, fetch };
}

beforeEach(() => {
    // eslint-disable-next-line no-global-assign
    indexedDB = new IDBFactory();
    vi.stubGlobal("Request", FakeRequest);

    vi.mocked(generateClientKey).mockResolvedValue({
        serializedData: "serialized-client-key",
        key: {} as CryptoKey,
    });
    vi.mocked(getClientKey).mockResolvedValue({} as CryptoKey);
    vi.mocked(encryptBlob).mockResolvedValue(new Uint8Array([9, 9, 9]));
    vi.mocked(decryptBlob).mockResolvedValue("decrypted-key-password");
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

describe("SessionError naming", () => {
    it("reports the concrete subclass name", () => {
        const base = new SessionError(
            SessionErrorCode.Network,
            null,
            0,
            null,
            null,
        );
        const auth = new SessionAuthError(
            SessionErrorCode.SessionExpired,
            null,
            401,
            null,
            null,
        );

        expect(base.name).toBe("SessionError");
        expect(auth.name).toBe("SessionAuthError");
        expect(auth).toBeInstanceOf(SessionError);
    });
});

describe("getSessionFromMemory", () => {
    it("returns the session when it exists in memory and the DB", async () => {
        const { persistence, sessionDb, sessionMem } = setup();
        await sessionDb.save(makeDbDto(1));
        await sessionMem.save({
            localId: 1,
            keyPassword: "kp",
            clientKey: "ck",
        });

        const result = await persistence.getSessionFromMemory(1);

        expect(result?.sessionDbDto.data.localId).toBe(1);
        expect(result?.keyPassword).toBe("kp");
        expect(result?.clientKey).toBe("ck");
    });

    it("returns undefined when memory is empty", async () => {
        const { persistence, sessionDb } = setup();
        await sessionDb.save(makeDbDto(1));

        expect(await persistence.getSessionFromMemory(1)).toBeUndefined();
    });

    it("returns undefined when the memory session has no DB entry", async () => {
        const { persistence, sessionMem } = setup();
        await sessionMem.save({
            localId: 1,
            keyPassword: "kp",
            clientKey: "ck",
        });

        expect(await persistence.getSessionFromMemory(1)).toBeUndefined();
    });
});

describe("getSessionFromStorage", () => {
    it("decrypts and returns the session on success", async () => {
        const { persistence, fetch } = setup(() =>
            jsonResponse(200, { ClientKey: "network-client-key" }),
        );
        const dto = makeDbDto(1);

        const result = await persistence.getSessionFromStorage(dto);

        expect(result.keyPassword).toBe("decrypted-key-password");
        expect(result.clientKey).toBe("network-client-key");
        expect(result.sessionDbDto).toBe(dto);
        // The uid is forwarded to the key endpoint.
        const request = fetch.mock.calls[0]?.[0];
        expect(request?.url).toContain("/auth/v4/sessions/local/key");
        expect(request?.headers.get("x-pm-uid")).toBe("uid-1");
    });

    it("deletes the session and throws SessionExpired on 401", async () => {
        const { persistence, sessionDb } = setup(() => jsonResponse(401));
        const dto = makeDbDto(1);
        await sessionDb.save(dto);

        const error = await captureRejection(
            persistence.getSessionFromStorage(dto),
        );
        expect(error).toBeInstanceOf(SessionAuthError);
        expect((error as SessionError).code).toBe(
            SessionErrorCode.SessionExpired,
        );
        expect(await sessionDb.get(1)).toBeUndefined();
    });

    it("throws a Network error on a non-200 response", async () => {
        const { persistence } = setup(() => jsonResponse(500, {}));

        const error = await captureRejection(
            persistence.getSessionFromStorage(makeDbDto(1)),
        );
        expect(error).toBeInstanceOf(SessionError);
        expect((error as SessionError).code).toBe(SessionErrorCode.Network);
    });

    it("throws a Network error when the ClientKey is missing", async () => {
        const { persistence } = setup(() => jsonResponse(200, {}));

        const error = await captureRejection(
            persistence.getSessionFromStorage(makeDbDto(1)),
        );
        expect(error).toBeInstanceOf(SessionError);
        expect((error as SessionError).code).toBe(SessionErrorCode.Network);
    });

    it("deletes the session and throws Decryption when decryption fails", async () => {
        const { persistence, sessionDb } = setup(() =>
            jsonResponse(200, { ClientKey: "network-client-key" }),
        );
        vi.mocked(decryptBlob).mockRejectedValueOnce(new Error("bad key"));
        const dto = makeDbDto(1);
        await sessionDb.save(dto);

        const error = await captureRejection(
            persistence.getSessionFromStorage(dto),
        );
        expect(error).toBeInstanceOf(SessionAuthError);
        expect((error as SessionError).code).toBe(SessionErrorCode.Decryption);
        expect(await sessionDb.get(1)).toBeUndefined();
    });
});

describe("saveSession", () => {
    const params = {
        localId: 1,
        uid: "uid-1",
        userId: "user-1",
        persistent: true,
        trusted: false,
        keyPassword: "the-key-password",
    };

    it("persists the session to the DB and memory on success", async () => {
        const { persistence, sessionDb, sessionMem, fetch } = setup(() =>
            jsonResponse(200, {}),
        );

        const result = await persistence.saveSession(params);

        expect(result.keyPassword).toBe("the-key-password");
        expect(result.clientKey).toBe("serialized-client-key");
        expect(await sessionDb.get(1)).toBeDefined();
        expect(await sessionMem.get(1)).toMatchObject({
            localId: 1,
            keyPassword: "the-key-password",
            clientKey: "serialized-client-key",
        });
        const request = fetch.mock.calls[0]?.[0];
        expect(request?.method).toBe("put");
        expect(request?.headers.get("x-pm-uid")).toBe("uid-1");
    });

    it("throws a Network error when the request rejects", async () => {
        const { persistence } = setup(() =>
            Promise.reject(new Error("offline")),
        );

        const error = await captureRejection(persistence.saveSession(params));
        expect(error).toBeInstanceOf(SessionError);
        expect((error as SessionError).code).toBe(SessionErrorCode.Network);
    });

    it("throws SessionExpired on 401", async () => {
        const { persistence } = setup(() => jsonResponse(401, {}));

        const error = await captureRejection(persistence.saveSession(params));
        expect(error).toBeInstanceOf(SessionAuthError);
        expect((error as SessionError).code).toBe(
            SessionErrorCode.SessionExpired,
        );
    });

    it("throws a Network error on other non-200 responses", async () => {
        const { persistence } = setup(() => jsonResponse(500, {}));

        const error = await captureRejection(persistence.saveSession(params));
        expect(error).toBeInstanceOf(SessionError);
        expect((error as SessionError).code).toBe(SessionErrorCode.Network);
    });
});

describe("getSession", () => {
    it("returns the memory session without hitting the network", async () => {
        const { persistence, sessionDb, sessionMem, fetch } = setup();
        await sessionDb.save(makeDbDto(1));
        await sessionMem.save({
            localId: 1,
            keyPassword: "kp",
            clientKey: "ck",
        });

        const result = await persistence.getSession(1);

        expect(result.keyPassword).toBe("kp");
        expect(fetch).not.toHaveBeenCalled();
    });

    it("falls back to storage for a known localId and caches it in memory", async () => {
        const { persistence, sessionDb, sessionMem } = setup(() =>
            jsonResponse(200, { ClientKey: "network-client-key" }),
        );
        await sessionDb.save(makeDbDto(1));

        const result = await persistence.getSession(1);

        expect(result.keyPassword).toBe("decrypted-key-password");
        // useSession stored it in memory for next time.
        expect(await sessionMem.get(1)).toMatchObject({ localId: 1 });
    });

    it("uses the last-used session when no localId is given", async () => {
        const { persistence, sessionDb } = setup(() =>
            jsonResponse(200, { ClientKey: "network-client-key" }),
        );
        await sessionDb.save(makeDbDto(7));

        const result = await persistence.getSession(undefined);

        expect(result.sessionDbDto.data.localId).toBe(7);
    });

    it("throws SessionNotFound when there is no session anywhere", async () => {
        const { persistence } = setup();

        const error = await captureRejection(persistence.getSession(1));
        expect(error).toBeInstanceOf(SessionAuthError);
        expect((error as SessionError).code).toBe(
            SessionErrorCode.SessionNotFound,
        );
    });
});

describe("signOutSession", () => {
    it("returns 'fail' when the session is not in the DB", async () => {
        const { persistence, fetch } = setup();

        expect(
            await persistence.signOutSession({ localId: 99, type: "signOut" }),
        ).toBe("fail");
        expect(fetch).not.toHaveBeenCalled();
    });

    it("clears local state and returns 'ok' when the server accepts a signOut", async () => {
        const { persistence, sessionDb, sessionMem, fetch } = setup(() =>
            jsonResponse(200),
        );
        await sessionDb.save(makeDbDto(1));
        await sessionMem.save({
            localId: 1,
            keyPassword: "kp",
            clientKey: "ck",
        });

        expect(
            await persistence.signOutSession({ localId: 1, type: "signOut" }),
        ).toBe("ok");
        expect(await sessionDb.get(1)).toBeUndefined();
        expect(await sessionMem.get(1)).toBeUndefined();
        const request = fetch.mock.calls[0]?.[0];
        expect(request?.method).toBe("DELETE");
        expect(request?.headers.get("x-pm-uid")).toBe("uid-1");
    });

    it("clears local state without a network call for an unauthorized sign-out", async () => {
        const { persistence, sessionDb, sessionMem, fetch } = setup();
        await sessionDb.save(makeDbDto(1));
        await sessionMem.save({
            localId: 1,
            keyPassword: "kp",
            clientKey: "ck",
        });

        expect(
            await persistence.signOutSession({
                localId: 1,
                type: "unauthorized",
            }),
        ).toBe("ok");
        expect(await sessionDb.get(1)).toBeUndefined();
        expect(await sessionMem.get(1)).toBeUndefined();
        expect(fetch).not.toHaveBeenCalled();
    });

    it("returns 'ok' on a non-200 signOut response once local state is removed", async () => {
        const { persistence, sessionDb } = setup(() => jsonResponse(500));
        await sessionDb.save(makeDbDto(1));

        // The server revocation is best-effort; the session is already gone
        // locally, which is what consumers care about.
        expect(
            await persistence.signOutSession({ localId: 1, type: "signOut" }),
        ).toBe("ok");
        expect(await sessionDb.get(1)).toBeUndefined();
    });

    it("returns 'ok' even when the signOut request throws", async () => {
        const { persistence, sessionDb } = setup(() =>
            Promise.reject(new Error("offline")),
        );
        await sessionDb.save(makeDbDto(1));

        // A network failure on the best-effort revocation must not report the
        // sign-out as failed once local teardown has completed.
        expect(
            await persistence.signOutSession({ localId: 1, type: "signOut" }),
        ).toBe("ok");
        expect(await sessionDb.get(1)).toBeUndefined();
    });
});
