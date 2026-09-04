import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
    FetchLike,
    ProtonConfig,
    ProtonFetchContext,
} from "./interface.ts";
import { createRefreshMiddleware } from "./middleware/refreshMiddleware.ts";

// These tests deliberately run the middleware against the *real* refreshManager
// — the per-file mocks in refreshMiddleware.unit.test.ts stub refreshOnce out,
// so nothing there covers how a status from /auth/refresh actually flows
// through to the consumer. Only the lock is stubbed; it is infrastructure.
vi.mock("./requestLock.ts", () => ({
    requestLock: vi.fn((_id: string, cb: () => Promise<unknown>) => cb()),
}));

const uid = "user-123";

const baseConfig: ProtonConfig = {
    url: new URL("https://api.proton.me"),
    appVersion: "web-calendar@1.0.0",
    uid,
    locale: "en_US",
};

// Builds a context whose createFetch returns the fetch used for the internal
// /auth/refresh call, so a test can control what that endpoint responds with.
function makeContext(refreshFetch: FetchLike): ProtonFetchContext {
    return {
        config: baseConfig,
        createFetch: vi.fn().mockReturnValue(refreshFetch),
        startedAt: Date.now(),
        middlewares: [],
    };
}

function makeRequest() {
    return new Request("https://api.proton.me/test", {
        headers: { "x-pm-uid": uid },
    });
}

describe("refresh flow against a real refreshManager", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // The guard the 401 branch in handleRefresh exists for: a 401 from
    // /auth/refresh means the session is gone, so it has to terminate the flow.
    // Were it to surface as a Response, the consumer would receive a 401 as the
    // result of its own request and a retry-on-401 layer above would refresh
    // again, get the same 401, and spin.
    it("ends the flow on a 401 from /auth/refresh rather than handing back a retriable response", async () => {
        const onUnauthorized = vi.fn();
        const refreshFetch = vi
            .fn()
            .mockResolvedValue(new Response(null, { status: 401 }));
        // The consumer's own request 401s, which is what triggers the refresh.
        const terminal: FetchLike = vi
            .fn()
            .mockResolvedValue(
                new Response(null, { status: 401, statusText: "original" }),
            );

        const result = await createRefreshMiddleware(onUnauthorized)(
            terminal,
            makeContext(refreshFetch),
        )(makeRequest());

        // Exactly one refresh attempt, and no retry of the original request.
        expect(refreshFetch).toHaveBeenCalledOnce();
        expect(terminal).toHaveBeenCalledOnce();
        // The consumer gets its own response back, not the refresh Response —
        // the latter is what a retry loop would feed on.
        expect(result.statusText).toBe("original");
        expect(onUnauthorized).toHaveBeenCalledOnce();
    });

    // The counterpart: statuses outside 400/401/422 are not a rejected refresh,
    // so they pass through as a Response and leave the session alone.
    it("surfaces a 429 from /auth/refresh as a Response without signalling unauthorized", async () => {
        const onUnauthorized = vi.fn();
        const refreshFetch = vi
            .fn()
            .mockResolvedValue(
                new Response(null, { status: 429, statusText: "refresh" }),
            );
        const terminal: FetchLike = vi
            .fn()
            .mockResolvedValue(
                new Response(null, { status: 401, statusText: "original" }),
            );

        const result = await createRefreshMiddleware(onUnauthorized)(
            terminal,
            makeContext(refreshFetch),
        )(makeRequest());

        expect(result.status).toBe(429);
        expect(result.statusText).toBe("refresh");
        expect(onUnauthorized).not.toHaveBeenCalled();
    });

    // A 5xx is the server failing, not the session being rejected, so it takes
    // the same pass-through path as a 429: no "fail", no unauthorized signal,
    // and the session survives for a later attempt.
    it("surfaces a 503 from /auth/refresh as a Response without signalling unauthorized", async () => {
        const onUnauthorized = vi.fn();
        const refreshFetch = vi
            .fn()
            .mockResolvedValue(
                new Response(null, { status: 503, statusText: "refresh" }),
            );
        const terminal: FetchLike = vi
            .fn()
            .mockResolvedValue(
                new Response(null, { status: 401, statusText: "original" }),
            );

        const result = await createRefreshMiddleware(onUnauthorized)(
            terminal,
            makeContext(refreshFetch),
        )(makeRequest());

        expect(result.status).toBe(503);
        expect(result.statusText).toBe("refresh");
        // The original request is not retried — there is no new session yet.
        expect(terminal).toHaveBeenCalledOnce();
        expect(onUnauthorized).not.toHaveBeenCalled();
    });

    it("retries the original request once when /auth/refresh succeeds", async () => {
        const onUnauthorized = vi.fn();
        const refreshFetch = vi
            .fn()
            .mockResolvedValue(new Response(null, { status: 200 }));
        const terminal: FetchLike = vi
            .fn()
            .mockResolvedValueOnce(new Response(null, { status: 401 }))
            .mockResolvedValueOnce(new Response(null, { status: 200 }));

        const result = await createRefreshMiddleware(onUnauthorized)(
            terminal,
            makeContext(refreshFetch),
        )(makeRequest());

        expect(refreshFetch).toHaveBeenCalledOnce();
        expect(terminal).toHaveBeenCalledTimes(2);
        expect(result.status).toBe(200);
        expect(onUnauthorized).not.toHaveBeenCalled();
    });
});
