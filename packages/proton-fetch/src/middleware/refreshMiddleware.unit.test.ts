import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
    FetchLike,
    ProtonConfig,
    ProtonFetchContext,
} from "../interface.ts";
import { createRefreshMiddleware } from "./refreshMiddleware.ts";
import { getRefresh, refreshOnce } from "../refreshManager.ts";

const refreshMiddleware = createRefreshMiddleware();

vi.mock("../requestLock.ts", () => ({
    requestLock: vi.fn((_id: string, cb: () => Promise<unknown>) => cb()),
}));

vi.mock("../refreshManager.ts", () => ({
    getRefresh: vi.fn().mockReturnValue(undefined),
    refreshOnce: vi.fn().mockResolvedValue("ok"),
}));

const baseConfig: ProtonConfig = {
    url: new URL("https://api.proton.me"),
    appVersion: "web-calendar@1.0.0",
    uid: "user-123",
    locale: "en_US",
};

function makeContext(
    overrides: Partial<ProtonFetchContext> = {},
): ProtonFetchContext {
    return {
        config: baseConfig,
        createFetch: vi
            .fn()
            .mockReturnValue(
                vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
            ),
        startedAt: Date.now(),
        middlewares: [],
        ...overrides,
    };
}

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getRefresh).mockReturnValue(undefined);
    vi.mocked(refreshOnce).mockResolvedValue("ok");
});

describe("refreshMiddleware", () => {
    it("passes the request through when no refresh is pending and response is not 401", async () => {
        const terminal: FetchLike = vi
            .fn()
            .mockResolvedValue(new Response(null, { status: 200 }));
        const result = await refreshMiddleware(
            terminal,
            makeContext(),
        )(
            new Request("https://api.proton.me/test", {
                headers: { "x-pm-uid": "user-123" },
            }),
        );
        expect(result.status).toBe(200);
    });

    it("waits for a pending refresh before sending the request", async () => {
        let resolveRefresh!: (v: "ok") => void;
        const pendingRefresh = new Promise<"ok">((resolve) => {
            resolveRefresh = resolve;
        });
        vi.mocked(getRefresh).mockReturnValue(pendingRefresh);

        const terminal: FetchLike = vi
            .fn()
            .mockResolvedValue(new Response(null, { status: 200 }));

        let settled = false;
        const promise = refreshMiddleware(
            terminal,
            makeContext(),
        )(
            new Request("https://api.proton.me/test", {
                headers: { "x-pm-uid": "user-123" },
            }),
        ).then(() => {
            settled = true;
        });

        await Promise.resolve();
        expect(settled).toBe(false);
        expect(terminal).not.toHaveBeenCalled();

        resolveRefresh("ok");
        await promise;
        expect(settled).toBe(true);
    });

    it("proceeds even if the pending refresh rejects", async () => {
        vi.mocked(getRefresh).mockReturnValue(
            Promise.reject(new Error("refresh failed")),
        );
        const terminal: FetchLike = vi
            .fn()
            .mockResolvedValue(new Response(null, { status: 200 }));
        const result = await refreshMiddleware(
            terminal,
            makeContext(),
        )(
            new Request("https://api.proton.me/test", {
                headers: { "x-pm-uid": "user-123" },
            }),
        );
        expect(result.status).toBe(200);
    });

    it("does not check for pending refresh when uid is absent", async () => {
        const terminal: FetchLike = vi
            .fn()
            .mockResolvedValue(new Response(null, { status: 200 }));
        await refreshMiddleware(
            terminal,
            makeContext(),
        )(new Request("https://api.proton.me/test"));
        expect(getRefresh).not.toHaveBeenCalled();
    });

    it("calls refreshOnce on a 401 with uid header", async () => {
        const retryFetch = vi
            .fn()
            .mockResolvedValue(new Response(null, { status: 200 }));
        const terminal: FetchLike = vi
            .fn()
            .mockResolvedValue(new Response(null, { status: 401 }));
        const ctx = makeContext({
            createFetch: vi.fn().mockReturnValue(retryFetch),
        });
        await refreshMiddleware(
            terminal,
            ctx,
        )(
            new Request("https://api.proton.me/test", {
                headers: { "x-pm-uid": "user-123" },
            }),
        );
        expect(refreshOnce).toHaveBeenCalledOnce();
    });

    it("retries the request after a successful refresh", async () => {
        // The retry is re-sent downstream via `next` (the terminal), not the
        // rebuilt chain — so the terminal is hit twice: 401 then 200.
        const terminal: FetchLike = vi
            .fn()
            .mockResolvedValueOnce(new Response(null, { status: 401 }))
            .mockResolvedValueOnce(new Response(null, { status: 200 }));
        vi.mocked(refreshOnce).mockResolvedValue("ok");
        const ctx = makeContext();
        const result = await refreshMiddleware(
            terminal,
            ctx,
        )(
            new Request("https://api.proton.me/test", {
                headers: { "x-pm-uid": "user-123" },
            }),
        );
        expect(terminal).toHaveBeenCalledTimes(2);
        expect(result.status).toBe(200);
    });

    it("retries a body-less request with the same object (no clone)", async () => {
        const terminal: FetchLike = vi
            .fn()
            .mockResolvedValueOnce(new Response(null, { status: 401 }))
            .mockResolvedValueOnce(new Response(null, { status: 200 }));
        vi.mocked(refreshOnce).mockResolvedValue("ok");
        const req = new Request("https://api.proton.me/test", {
            headers: { "x-pm-uid": "user-123" },
        });

        await createRefreshMiddleware()(terminal, makeContext())(req);

        // GET has no body, so there is nothing to replay — the retry re-sends
        // the very same request object downstream.
        expect(terminal).toHaveBeenNthCalledWith(2, req);
    });

    it("returns the original 401 response when refresh fails", async () => {
        const retryFetch = vi.fn();
        const terminal: FetchLike = vi
            .fn()
            .mockResolvedValue(new Response(null, { status: 401 }));
        vi.mocked(refreshOnce).mockResolvedValue("fail");
        const ctx = makeContext({
            createFetch: vi.fn().mockReturnValue(retryFetch),
        });
        const result = await refreshMiddleware(
            terminal,
            ctx,
        )(
            new Request("https://api.proton.me/test", {
                headers: { "x-pm-uid": "user-123" },
            }),
        );
        expect(retryFetch).not.toHaveBeenCalled();
        expect(result.status).toBe(401);
    });

    it("returns the error response when refresh returns a non-ok Response", async () => {
        const networkError = new Response(null, { status: 503 });
        const terminal: FetchLike = vi
            .fn()
            .mockResolvedValue(new Response(null, { status: 401 }));
        vi.mocked(refreshOnce).mockResolvedValue(networkError);
        const ctx = makeContext({
            createFetch: vi.fn().mockReturnValue(vi.fn()),
        });
        const result = await refreshMiddleware(
            terminal,
            ctx,
        )(
            new Request("https://api.proton.me/test", {
                headers: { "x-pm-uid": "user-123" },
            }),
        );
        expect(result.status).toBe(503);
    });

    it("does not trigger refresh on 401 when uid header is absent", async () => {
        const terminal: FetchLike = vi
            .fn()
            .mockResolvedValue(new Response(null, { status: 401 }));
        const result = await refreshMiddleware(
            terminal,
            makeContext(),
        )(new Request("https://api.proton.me/test"));
        expect(refreshOnce).not.toHaveBeenCalled();
        expect(result.status).toBe(401);
    });

    it("skips refresh logic when context.refresh is true (prevents recursion)", async () => {
        const terminal: FetchLike = vi
            .fn()
            .mockResolvedValue(new Response(null, { status: 401 }));
        const ctx = makeContext({ refresh: true });
        const result = await refreshMiddleware(
            terminal,
            ctx,
        )(
            new Request("https://api.proton.me/test", {
                headers: { "x-pm-uid": "user-123" },
            }),
        );
        expect(refreshOnce).not.toHaveBeenCalled();
        expect(result.status).toBe(401);
    });

    it("passes context.refresh=true to the retry createFetch call", async () => {
        const retryFetch = vi
            .fn()
            .mockResolvedValue(new Response(null, { status: 200 }));
        const createFetch = vi.fn().mockReturnValue(retryFetch);
        const terminal: FetchLike = vi
            .fn()
            .mockResolvedValue(new Response(null, { status: 401 }));
        vi.mocked(refreshOnce).mockResolvedValue("ok");
        const ctx = makeContext({ createFetch });
        await refreshMiddleware(
            terminal,
            ctx,
        )(
            new Request("https://api.proton.me/test", {
                headers: { "x-pm-uid": "user-123" },
            }),
        );
        expect(createFetch).toHaveBeenCalledWith(
            expect.objectContaining({ refresh: true }),
        );
    });

    describe("onUnauthorized callback", () => {
        it("invokes the callback with the original request when refresh fails", async () => {
            const onUnauthorized = vi.fn();
            const terminal: FetchLike = vi
                .fn()
                .mockResolvedValue(new Response(null, { status: 401 }));
            vi.mocked(refreshOnce).mockResolvedValue("fail");
            const req = new Request("https://api.proton.me/test", {
                headers: { "x-pm-uid": "user-123" },
            });

            const result = await createRefreshMiddleware(onUnauthorized)(
                terminal,
                makeContext({ createFetch: vi.fn().mockReturnValue(vi.fn()) }),
            )(req);

            expect(onUnauthorized).toHaveBeenCalledOnce();
            expect(result.status).toBe(401);
        });

        it("does not invoke the callback when the retry after refresh still returns 401", async () => {
            const onUnauthorized = vi.fn();
            const retryFetch = vi
                .fn()
                .mockResolvedValue(new Response(null, { status: 401 }));
            const terminal: FetchLike = vi
                .fn()
                .mockResolvedValue(new Response(null, { status: 401 }));
            vi.mocked(refreshOnce).mockResolvedValue("ok");

            await createRefreshMiddleware(onUnauthorized)(
                terminal,
                makeContext({
                    createFetch: vi.fn().mockReturnValue(retryFetch),
                }),
            )(
                new Request("https://api.proton.me/test", {
                    headers: { "x-pm-uid": "user-123" },
                }),
            );

            expect(onUnauthorized).not.toHaveBeenCalled();
        });

        it("does not invoke the callback on a 401 with no uid (no refresh attempted)", async () => {
            const onUnauthorized = vi.fn();
            const terminal: FetchLike = vi
                .fn()
                .mockResolvedValue(new Response(null, { status: 401 }));

            await createRefreshMiddleware(onUnauthorized)(
                terminal,
                makeContext(),
            )(new Request("https://api.proton.me/test"));

            expect(refreshOnce).not.toHaveBeenCalled();
            expect(onUnauthorized).not.toHaveBeenCalled();
        });

        it("does not invoke the callback when the refresh retry succeeds", async () => {
            const onUnauthorized = vi.fn();
            const retryFetch = vi
                .fn()
                .mockResolvedValue(new Response(null, { status: 200 }));
            const terminal: FetchLike = vi
                .fn()
                .mockResolvedValue(new Response(null, { status: 401 }));
            vi.mocked(refreshOnce).mockResolvedValue("ok");

            await createRefreshMiddleware(onUnauthorized)(
                terminal,
                makeContext({
                    createFetch: vi.fn().mockReturnValue(retryFetch),
                }),
            )(
                new Request("https://api.proton.me/test", {
                    headers: { "x-pm-uid": "user-123" },
                }),
            );

            expect(onUnauthorized).not.toHaveBeenCalled();
        });

        it("does not invoke the callback on a non-401 response", async () => {
            const onUnauthorized = vi.fn();
            const terminal: FetchLike = vi
                .fn()
                .mockResolvedValue(new Response(null, { status: 200 }));

            await createRefreshMiddleware(onUnauthorized)(
                terminal,
                makeContext(),
            )(
                new Request("https://api.proton.me/test", {
                    headers: { "x-pm-uid": "user-123" },
                }),
            );

            expect(onUnauthorized).not.toHaveBeenCalled();
        });

        it("does not invoke the callback on the internal refresh retry (context.refresh=true)", async () => {
            const onUnauthorized = vi.fn();
            const terminal: FetchLike = vi
                .fn()
                .mockResolvedValue(new Response(null, { status: 401 }));

            await createRefreshMiddleware(onUnauthorized)(
                terminal,
                makeContext({ refresh: true }),
            )(
                new Request("https://api.proton.me/test", {
                    headers: { "x-pm-uid": "user-123" },
                }),
            );

            expect(onUnauthorized).not.toHaveBeenCalled();
        });
    });
});
