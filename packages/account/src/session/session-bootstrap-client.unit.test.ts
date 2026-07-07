import { describe, it, expect, vi } from "vitest";
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
    AuthorizeUnprocessableError,
    type AuthorizeClient,
    type AuthorizeCallbackParameters,
    type AuthorizeParametersOptions,
} from "./authorize-client.ts";
import type { SessionDbDto } from "./session-db.ts";
import type { SaveSessionParams } from "./interface.ts";

// Replace only AuthorizeState (its real write()/fromKey() depend on sessionStorage
// and the Stage-3 Uint8Array base64 helpers). Everything else in the module —
// the error classes, AuthorizeClient.generateAuthorizePath, AuthorizeParameters —
// stays real so the produced authorize paths are exercised for real.
const { MockAuthorizeState } = vi.hoisted(() => {
    class MockAuthorizeState {
        data: unknown;
        constructor(data: unknown) {
            this.data = data;
        }
        // Stand-in for the persisted key: encodes the data so tests can assert
        // it flows into the redirect.
        write(): string {
            return JSON.stringify(this.data);
        }
        static fromKey(key: string): MockAuthorizeState {
            return new MockAuthorizeState({ restoredFrom: key });
        }
    }
    return { MockAuthorizeState };
});

vi.mock("./authorize-client.ts", async (importOriginal) => {
    const actual =
        await importOriginal<typeof import("./authorize-client.ts")>();
    return { ...actual, AuthorizeState: MockAuthorizeState };
});

const baseParams: Omit<AuthorizeParametersOptions, "state"> = {
    app: "proton-account",
};

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
    const authorizeClient = {
        getCallbackParameters: vi.fn<AuthorizeClient["getCallbackParameters"]>(
            () => null,
        ),
        initialize: vi.fn<AuthorizeClient["initialize"]>(),
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

function parseAuthorizePath(path: string): URLSearchParams {
    return new URLSearchParams(path.split("?")[1] ?? "");
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
        const authorizeCallbackParameters = makeCallbackParams("state-key");

        const result = await client.getSessionFromCallback({
            authorizeParameters: baseParams,
            authorizeCallbackParameters,
        });

        if (result.type !== "authenticated") {
            throw new Error("expected authenticated result");
        }
        expect(result.session).toBe(session);
        // AuthorizeState.fromKey (mocked) restores state derived from the key.
        expect(result.authorizeState?.data).toEqual({
            restoredFrom: "state-key",
        });
        expect(authorizeClient.initialize).toHaveBeenCalledWith(
            authorizeCallbackParameters,
        );
        expect(sessionPersistence.saveSession).toHaveBeenCalledWith(
            authorizeResult,
        );
    });

    it("returns unauthorized when authorize is unprocessable", async () => {
        const { client, authorizeClient } = makeClient();
        authorizeClient.initialize.mockRejectedValue(
            new AuthorizeUnprocessableError(422, {}),
        );

        const result = await client.getSessionFromCallback({
            authorizeParameters: baseParams,
            authorizeCallbackParameters: makeCallbackParams("state-key"),
        });

        if (result.type !== "unauthorized") {
            throw new Error("expected unauthorized result");
        }
        expect(result.authorizePath.startsWith("/authorize")).toBe(true);
        expect(parseAuthorizePath(result.authorizePath).get("state")).toBe(
            "state-key",
        );
    });

    it("returns unauthorized when saving the session is rejected as auth error", async () => {
        const { client, authorizeClient, sessionPersistence } = makeClient();
        authorizeClient.initialize.mockResolvedValue(makeSaveParams());
        sessionPersistence.saveSession.mockRejectedValue(
            new SessionAuthError(
                SessionErrorCode.SessionExpired,
                null,
                401,
                null,
                null,
            ),
        );

        const result = await client.getSessionFromCallback({
            authorizeParameters: baseParams,
            authorizeCallbackParameters: makeCallbackParams("state-key"),
        });

        expect(result.type).toBe("unauthorized");
    });

    it("wraps a network AuthorizeError in a SessionBootstrapError", async () => {
        const { client, authorizeClient } = makeClient();
        authorizeClient.initialize.mockRejectedValue(
            new AuthorizeError(500, { Error: "boom", Code: 500 }),
        );

        const error = await captureRejection(
            client.getSessionFromCallback({
                authorizeParameters: baseParams,
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
                authorizeParameters: baseParams,
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
            authorizeParameters: { ...baseParams, localId: 5 },
            authorizeStateData: { foo: 1 },
        });

        if (result.type !== "authenticated") {
            throw new Error("expected authenticated result");
        }
        expect(result.session).toBe(session);
        expect(result.authorizeState).toBeNull();
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
            authorizeParameters: { ...baseParams, localId: 5 },
            authorizeStateData: { foo: 1 },
        });

        if (result.type !== "unauthorized") {
            throw new Error("expected unauthorized result");
        }
        expect(parseAuthorizePath(result.authorizePath).get("reason")).toBe(
            reason,
        );
    });

    it("encodes the authorize state into the redirect for later restoration", async () => {
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
        const authorizeStateData = { returnTo: "/inbox" };

        const result = await client.getSessionFromStorage({
            authorizeParameters: baseParams,
            authorizeStateData,
        });

        if (result.type !== "unauthorized") {
            throw new Error("expected unauthorized result");
        }
        // The mocked AuthorizeState.write() returns the serialized state data,
        // so the redirect's `state` param reflects what was stored.
        expect(parseAuthorizePath(result.authorizePath).get("state")).toBe(
            JSON.stringify(authorizeStateData),
        );
    });

    it("uses authorizeParameters.localId for the redirect when present", async () => {
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
            authorizeParameters: { ...baseParams, localId: 5 },
            authorizeStateData: null,
        });

        if (result.type !== "unauthorized") {
            throw new Error("expected unauthorized result");
        }
        expect(parseAuthorizePath(result.authorizePath).get("u")).toBe("5");
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
            authorizeParameters: baseParams,
            authorizeStateData: null,
        });

        if (result.type !== "unauthorized") {
            throw new Error("expected unauthorized result");
        }
        expect(parseAuthorizePath(result.authorizePath).get("u")).toBe("9");
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
                authorizeParameters: baseParams,
                authorizeStateData: null,
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
                authorizeParameters: baseParams,
                authorizeStateData: null,
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
            authorizeParameters: baseParams,
            authorizeStateData: null,
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
            authorizeParameters: { ...baseParams, localId: 7 },
            authorizeStateData: null,
        });

        expect(result.type).toBe("authenticated");
        expect(authorizeClient.initialize).not.toHaveBeenCalled();
        expect(sessionPersistence.getSession).toHaveBeenCalledWith(7);
    });
});
