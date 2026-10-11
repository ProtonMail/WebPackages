import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    SessionBootstrapClient,
    SessionBootstrapError,
} from "./session-bootstrap-client.ts";
import {
    SessionError,
    SessionAuthError,
    SessionErrorCode,
    type SessionDto,
    type SessionPersistence,
} from "./session-persistence.ts";
import {
    AuthorizeError,
    AuthorizeState,
    AuthorizeUnprocessableError,
    AuthorizeClient,
    type AuthorizeCallbackParameters,
} from "./authorize-client.ts";
import { generateForkSecret } from "./fork-secret.ts";
import type { SessionDbDto } from "./session-db.ts";
import type { SaveSessionParams } from "./interface.ts";

// The fork secret's crypto has its own tests, here only where it's kept matters
vi.mock("./fork-secret.ts", () => ({ generateForkSecret: vi.fn() }));

// AuthorizeState and the authorize paths stay real, on this sessionStorage
let storage: Map<string, string>;

beforeEach(() => {
    vi.mocked(generateForkSecret).mockReset().mockResolvedValue({
        forkSecret: "fork-secret",
        forkChallenge: "fork-challenge",
    });
    storage = new Map();
    vi.stubGlobal("sessionStorage", {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

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

function makeSessionDto(localId = 1): SessionDto {
    return {
        sessionDbDto: makeDbDto(localId),
        keyPassword: "kp",
        clientKey: "ck",
    };
}

function makeSaveParams(localId = 1): SaveSessionParams {
    return {
        localId,
        uid: `uid-${localId}`,
        userId: `user-${localId}`,
        persistent: true,
        trusted: false,
        keyPassword: "kp",
    };
}

function makeCallbackParams(state = "state-key"): AuthorizeCallbackParameters {
    return { dto: { state } } as unknown as AuthorizeCallbackParameters;
}

function makeClient() {
    // Requests forks for real, pulling them is mocked
    const realAuthorizeClient = new AuthorizeClient({
        fetch: () => Promise.reject(new Error("no fetch")),
        app: "proton-calendar",
        accountUrl: new URL("https://account.proton.me"),
    });
    const authorizeClient = {
        getCallbackParameters: vi.fn<AuthorizeClient["getCallbackParameters"]>(
            () => null,
        ),
        initialize: vi.fn<AuthorizeClient["initialize"]>(),
        authorize: vi.fn<AuthorizeClient["authorize"]>((intent, data) =>
            realAuthorizeClient.authorize(intent, data),
        ),
    };
    const sessionPersistence = {
        getSession: vi.fn<SessionPersistence["getSession"]>(),
        saveSession: vi.fn<SessionPersistence["saveSession"]>(),
    };
    const client = new SessionBootstrapClient({
        authorizeClient: authorizeClient as unknown as AuthorizeClient,
        sessionPersistence: sessionPersistence as unknown as SessionPersistence,
    });
    return { client, authorizeClient, sessionPersistence };
}

/** The authorize state the redirect requests its fork under */
function getRedirectState(authorizeUrl: URL) {
    const state = authorizeUrl.searchParams.get("state");
    if (!state) {
        throw new Error("expected a state");
    }
    return { state, authorizeState: AuthorizeState.fromKey(state) };
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    throw new Error("Expected promise to reject, but it resolved");
}

describe("getSessionFromCallback", () => {
    it("returns an authenticated result on success", async () => {
        const { client, authorizeClient, sessionPersistence } = makeClient();
        const authorizeResult = makeSaveParams();
        const session = makeSessionDto();
        authorizeClient.initialize.mockResolvedValue(authorizeResult);
        sessionPersistence.saveSession.mockResolvedValue(session);
        const state = new AuthorizeState({ returnTo: "/inbox" }).write();
        const authorizeCallbackParameters = makeCallbackParams(state);

        const result = await client.getSessionFromCallback({
            authorizeCallbackParameters,
        });

        if (result.type !== "authenticated") {
            throw new Error("expected authenticated result");
        }
        expect(result.session).toBe(session);
        expect(result.data).toEqual({ returnTo: "/inbox" });
        expect(authorizeClient.initialize).toHaveBeenCalledWith(
            authorizeCallbackParameters,
            undefined,
        );
        expect(sessionPersistence.saveSession).toHaveBeenCalledWith(
            authorizeResult,
        );
    });

    it("proves the fork with the fork secret kept in its state", async () => {
        const { client, authorizeClient, sessionPersistence } = makeClient();
        authorizeClient.initialize.mockResolvedValue(makeSaveParams());
        sessionPersistence.saveSession.mockResolvedValue(makeSessionDto());
        const state = new AuthorizeState(null, "fork-secret").write();
        const authorizeCallbackParameters = makeCallbackParams(state);

        await client.getSessionFromCallback({
            authorizeCallbackParameters,
        });

        expect(authorizeClient.initialize).toHaveBeenCalledWith(
            authorizeCallbackParameters,
            "fork-secret",
        );
    });

    it("forgets the authorize state once the session is saved", async () => {
        const { client, authorizeClient, sessionPersistence } = makeClient();
        const state = new AuthorizeState(null, "fork-secret").write();
        authorizeClient.initialize.mockResolvedValue(makeSaveParams());
        sessionPersistence.saveSession.mockImplementation(() => {
            // Still needed if saving the session fails
            expect(storage.size).toBe(1);
            return Promise.resolve(makeSessionDto());
        });

        await client.getSessionFromCallback({
            authorizeCallbackParameters: makeCallbackParams(state),
        });

        expect(storage.size).toBe(0);
    });

    it("keeps the authorize state when the fork can't be pulled for now", async () => {
        const { client, authorizeClient } = makeClient();
        const state = new AuthorizeState(null, "fork-secret").write();
        authorizeClient.initialize.mockRejectedValue(
            new AuthorizeError(503, {}),
        );

        await expect(
            client.getSessionFromCallback({
                authorizeCallbackParameters: makeCallbackParams(state),
            }),
        ).rejects.toBeInstanceOf(SessionBootstrapError);

        // A reload pulls the same fork again, which needs the fork secret
        expect(AuthorizeState.fromKey(state).forkSecret).toBe("fork-secret");
    });

    it.each([
        [
            "the fork can't be pulled",
            () => Promise.reject(new AuthorizeUnprocessableError(422, {})),
            () => Promise.resolve(makeSessionDto()),
        ],
        [
            "the session can't be saved",
            () => Promise.resolve(makeSaveParams()),
            () =>
                Promise.reject(
                    new SessionAuthError(
                        SessionErrorCode.SessionExpired,
                        null,
                        401,
                        null,
                        null,
                    ),
                ),
        ],
    ])(
        "requests a new fork under a new authorize state when %s",
        async (_, initialize, saveSession) => {
            const { client, authorizeClient, sessionPersistence } =
                makeClient();
            authorizeClient.initialize.mockImplementation(initialize);
            sessionPersistence.saveSession.mockImplementation(saveSession);
            const previousState = new AuthorizeState(
                { returnTo: "/inbox" },
                "previous-fork-secret",
            ).write();

            const result = await client.getSessionFromCallback({
                authorizeCallbackParameters: makeCallbackParams(previousState),
            });

            if (result.type !== "unauthorized") {
                throw new Error("expected unauthorized result");
            }
            expect(result.authorizeUrl.pathname).toBe("/authorize");
            const { state, authorizeState } = getRedirectState(
                result.authorizeUrl,
            );
            expect(state).not.toBe(previousState);
            expect(authorizeState).toEqual(
                new AuthorizeState({ returnTo: "/inbox" }, "fork-secret"),
            );
            expect(result.authorizeUrl.searchParams.get("forkChallenge")).toBe(
                "fork-challenge",
            );
            expect([...storage.keys()]).toEqual([`authorize-state-${state}`]);
        },
    );

    it("resumes the session it was given for the new fork", async () => {
        const { client, authorizeClient } = makeClient();
        authorizeClient.initialize.mockRejectedValue(
            new AuthorizeUnprocessableError(422, {}),
        );

        const result = await client.getSessionFromCallback({
            authorizeCallbackParameters: makeCallbackParams(),
            localId: 4,
        });

        if (result.type !== "unauthorized") {
            throw new Error("expected unauthorized result");
        }
        expect(result.authorizeUrl.searchParams.get("u")).toBe("4");
        expect(result.authorizeUrl.searchParams.has("t")).toBe(false);
    });

    it("wraps a network AuthorizeError in a SessionBootstrapError", async () => {
        const { client, authorizeClient } = makeClient();
        authorizeClient.initialize.mockRejectedValue(
            new AuthorizeError(500, { Error: "boom", Code: 500 }),
        );

        const error = await captureRejection(
            client.getSessionFromCallback({
                authorizeCallbackParameters: makeCallbackParams(),
            }),
        );

        expect(error).toBeInstanceOf(SessionBootstrapError);
        expect((error as Error).name).toBe("SessionBootstrapError");
        expect((error as Error).message).toContain("Network error (500)");
        expect((error as Error).message).toContain("boom");
        expect((error as Error).cause).toBeInstanceOf(AuthorizeError);
    });

    it("rethrows errors that are neither auth nor network failures", async () => {
        const { client, authorizeClient } = makeClient();
        const original = new Error("unexpected");
        authorizeClient.initialize.mockRejectedValue(original);

        const error = await captureRejection(
            client.getSessionFromCallback({
                authorizeCallbackParameters: makeCallbackParams(),
            }),
        );

        expect(error).toBe(original);
    });
});

describe("getSessionFromStorage", () => {
    it("returns an authenticated result from the persisted session", async () => {
        const { client, sessionPersistence } = makeClient();
        const session = makeSessionDto(5);
        sessionPersistence.getSession.mockResolvedValue(session);

        const result = await client.getSessionFromStorage({
            localId: 5,
            data: { foo: 1 },
        });

        if (result.type !== "authenticated") {
            throw new Error("expected authenticated result");
        }
        expect(result.session).toBe(session);
        expect(result.data).toBeNull();
        expect(sessionPersistence.getSession).toHaveBeenCalledWith(5);
    });

    it.each([
        [SessionErrorCode.SessionExpired, "expired"],
        [SessionErrorCode.SessionNotFound, "not-found"],
        [SessionErrorCode.Decryption, "corrupted"],
    ])("maps auth error code %i to reason '%s'", async (code, reason) => {
        const { client, sessionPersistence } = makeClient();
        sessionPersistence.getSession.mockRejectedValue(
            new SessionAuthError(code, null, 0, null, null),
        );

        const result = await client.getSessionFromStorage({
            localId: 5,
            data: { foo: 1 },
        });

        if (result.type !== "unauthorized") {
            throw new Error("expected unauthorized result");
        }
        expect(result.authorizeUrl.searchParams.get("reason")).toBe(reason);
    });

    it("binds the fork to a fork secret kept with the authorize state data", async () => {
        const { client, sessionPersistence } = makeClient();
        sessionPersistence.getSession.mockRejectedValue(
            new SessionAuthError(
                SessionErrorCode.SessionExpired,
                null,
                0,
                null,
                null,
            ),
        );

        const result = await client.getSessionFromStorage({
            data: { returnTo: "/inbox" },
        });

        if (result.type !== "unauthorized") {
            throw new Error("expected unauthorized result");
        }
        expect(getRedirectState(result.authorizeUrl).authorizeState).toEqual(
            new AuthorizeState({ returnTo: "/inbox" }, "fork-secret"),
        );
        expect(result.authorizeUrl.searchParams.get("forkChallenge")).toBe(
            "fork-challenge",
        );
    });

    it("leaves the fork unbound when the fork secret can't be created", async () => {
        const { client, sessionPersistence } = makeClient();
        sessionPersistence.getSession.mockRejectedValue(
            new SessionAuthError(
                SessionErrorCode.SessionExpired,
                null,
                0,
                null,
                null,
            ),
        );
        vi.mocked(generateForkSecret).mockRejectedValue(
            new Error("NotSupportedError"),
        );

        const result = await client.getSessionFromStorage({
            data: { returnTo: "/inbox" },
        });

        if (result.type !== "unauthorized") {
            throw new Error("expected unauthorized result");
        }
        expect(getRedirectState(result.authorizeUrl).authorizeState).toEqual(
            new AuthorizeState({ returnTo: "/inbox" }, undefined),
        );
        expect(result.authorizeUrl.searchParams.has("forkChallenge")).toBe(
            false,
        );
    });

    it("uses localId for the redirect when given", async () => {
        const { client, sessionPersistence } = makeClient();
        sessionPersistence.getSession.mockRejectedValue(
            new SessionAuthError(
                SessionErrorCode.SessionExpired,
                makeDbDto(9),
                0,
                null,
                null,
            ),
        );

        const result = await client.getSessionFromStorage({
            localId: 5,
            data: null,
        });

        if (result.type !== "unauthorized") {
            throw new Error("expected unauthorized result");
        }
        expect(result.authorizeUrl.searchParams.get("u")).toBe("5");
    });

    it("falls back to the error's session localId for the redirect", async () => {
        const { client, sessionPersistence } = makeClient();
        sessionPersistence.getSession.mockRejectedValue(
            new SessionAuthError(
                SessionErrorCode.SessionExpired,
                makeDbDto(9),
                0,
                null,
                null,
            ),
        );

        const result = await client.getSessionFromStorage({
            data: null,
        });

        if (result.type !== "unauthorized") {
            throw new Error("expected unauthorized result");
        }
        expect(result.authorizeUrl.searchParams.get("u")).toBe("9");
    });

    it("wraps a network SessionError in a SessionBootstrapError", async () => {
        const { client, sessionPersistence } = makeClient();
        sessionPersistence.getSession.mockRejectedValue(
            new SessionError(
                SessionErrorCode.Network,
                null,
                503,
                { Error: "down" },
                null,
            ),
        );

        const error = await captureRejection(
            client.getSessionFromStorage({
                data: null,
            }),
        );

        expect(error).toBeInstanceOf(SessionBootstrapError);
        expect((error as Error).message).toContain("Network error (503)");
    });

    it("rethrows errors that are neither auth nor network failures", async () => {
        const { client, sessionPersistence } = makeClient();
        const original = new Error("unexpected");
        sessionPersistence.getSession.mockRejectedValue(original);

        const error = await captureRejection(
            client.getSessionFromStorage({
                data: null,
            }),
        );

        expect(error).toBe(original);
    });
});

describe("getSession", () => {
    it("routes to the callback flow when the URL has callback params", async () => {
        const { client, authorizeClient, sessionPersistence } = makeClient();
        authorizeClient.getCallbackParameters.mockReturnValue(
            makeCallbackParams("state-key"),
        );
        authorizeClient.initialize.mockResolvedValue(makeSaveParams());
        sessionPersistence.saveSession.mockResolvedValue(makeSessionDto());

        const result = await client.getSession({
            url: new URL("https://app.example/login"),
            data: null,
        });

        expect(result.type).toBe("authenticated");
        expect(authorizeClient.initialize).toHaveBeenCalled();
        expect(sessionPersistence.getSession).not.toHaveBeenCalled();
    });

    it("routes to the storage flow when there are no callback params", async () => {
        const { client, authorizeClient, sessionPersistence } = makeClient();
        authorizeClient.getCallbackParameters.mockReturnValue(null);
        sessionPersistence.getSession.mockResolvedValue(makeSessionDto(7));

        const result = await client.getSession({
            url: new URL("https://app.example/"),
            localId: 7,
            data: null,
        });

        expect(result.type).toBe("authenticated");
        expect(authorizeClient.initialize).not.toHaveBeenCalled();
        expect(sessionPersistence.getSession).toHaveBeenCalledWith(7);
    });
});
