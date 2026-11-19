import { afterEach, describe, expect, it, vi } from "vitest";
import type {
    FetchLike,
    ProtonConfig,
    ProtonFetchContext,
} from "../interface.ts";
import { defaultRetryPolicy, type RequestPolicy } from "../policy.ts";
import {
    createRetryMiddleware,
    type RetryListener,
} from "./retryMiddleware.ts";

const baseConfig: ProtonConfig = {
    url: new URL("https://api.proton.me"),
    appVersion: "web-calendar@1.0.0",
    locale: "en_US",
};

const makeContext = (policy?: RequestPolicy): ProtonFetchContext => ({
    config: baseConfig,
    createFetch: vi.fn(),
    startedAt: Date.now(),
    middlewares: [],
    policy,
});

const noDelay = { ...defaultRetryPolicy, minDelayMs: 0, jitterMs: 0 };

const respondWith = (...responses: Response[]) => {
    const next = vi.fn<FetchLike>();
    responses.forEach((response) => next.mockResolvedValueOnce(response));
    return next;
};

const send = (
    next: FetchLike,
    {
        policy = noDelay,
        onRetry,
        requestPolicy,
        request = new Request("https://api.proton.me/test"),
    }: {
        policy?: typeof noDelay;
        onRetry?: RetryListener;
        requestPolicy?: RequestPolicy;
        request?: Request;
    } = {},
) =>
    createRetryMiddleware({ policy, onRetry })(
        next,
        makeContext(requestPolicy),
    )(request);

afterEach(() => {
    vi.useRealTimers();
});

describe("createRetryMiddleware", () => {
    it.each([200, 400, 401, 422])("does not retry a %i", async (status) => {
        const next = respondWith(new Response(null, { status }));
        const response = await send(next);
        expect(response.status).toBe(status);
        expect(next).toHaveBeenCalledOnce();
    });

    it.each([429, 500, 503])("retries a %i", async (status) => {
        const next = respondWith(
            new Response(null, { status }),
            new Response(null, { status: 200 }),
        );
        const response = await send(next);
        expect(response.status).toBe(200);
        expect(next).toHaveBeenCalledTimes(2);
    });

    it.each([
        ["POST", 500, 1],
        ["PATCH", 502, 1],
        ["POST", 429, 2],
        ["POST", 503, 2],
        ["put", 500, 2],
        ["delete", 500, 2],
    ])(
        "sends a %s answered with %i %i time(s)",
        async (method, status, calls) => {
            const next = respondWith(
                new Response(null, { status }),
                new Response(null, { status: 200 }),
            );
            await send(next, {
                request: new Request("https://api.proton.me/test", { method }),
            });
            expect(next).toHaveBeenCalledTimes(calls);
        },
    );

    it("returns the last response after maxRetries retries", async () => {
        const next = vi
            .fn<FetchLike>()
            .mockImplementation(() =>
                Promise.resolve(new Response(null, { status: 503 })),
            );
        const response = await send(next);
        expect(response.status).toBe(503);
        expect(next).toHaveBeenCalledTimes(defaultRetryPolicy.maxRetries + 1);
    });

    it("sends the body on every attempt", async () => {
        const bodies: string[] = [];
        const next = vi.fn<FetchLike>().mockImplementation(async (request) => {
            bodies.push(await request.text());
            return new Response(null, {
                status: bodies.length < 3 ? 503 : 200,
            });
        });
        await send(next, {
            request: new Request("https://api.proton.me/test", {
                method: "POST",
                body: "payload",
            }),
        });
        expect(bodies).toEqual(["payload", "payload", "payload"]);
    });

    it("lets a request override the policy", async () => {
        const next = respondWith(new Response(null, { status: 503 }));
        const response = await send(next, {
            requestPolicy: { retry: { maxRetries: 0 } },
        });
        expect(response.status).toBe(503);
        expect(next).toHaveBeenCalledOnce();
    });

    it("waits the policy delay between attempts", async () => {
        vi.useFakeTimers();
        const next = respondWith(
            new Response(null, { status: 503 }),
            new Response(null, { status: 200 }),
        );
        const pending = send(next, {
            policy: { ...defaultRetryPolicy, jitterMs: 0 },
        });
        await vi.advanceTimersByTimeAsync(999);
        expect(next).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(1);
        expect(next).toHaveBeenCalledTimes(2);
        expect((await pending).status).toBe(200);
    });

    it("waits for Retry-After when it is longer than the policy delay", async () => {
        vi.useFakeTimers();
        const next = respondWith(
            new Response(null, {
                status: 429,
                headers: { "retry-after": "5" },
            }),
            new Response(null, { status: 200 }),
        );
        const pending = send(next);
        await vi.advanceTimersByTimeAsync(4_999);
        expect(next).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(1);
        expect((await pending).status).toBe(200);
    });

    it("returns the response when Retry-After is longer than maxDelayMs", async () => {
        const next = respondWith(
            new Response(null, {
                status: 429,
                headers: { "retry-after": "31" },
            }),
        );
        const response = await send(next);
        expect(response.status).toBe(429);
        expect(next).toHaveBeenCalledOnce();
    });

    it("returns the response when the wait would end after the request's time is up", async () => {
        const next = respondWith(new Response(null, { status: 503 }));
        const response = await send(next, {
            policy: { ...defaultRetryPolicy, jitterMs: 0 },
            requestPolicy: { timeoutMs: 1_000 },
        });
        expect(response.status).toBe(503);
        expect(next).toHaveBeenCalledOnce();
    });

    it("calls onRetry with the retried response and the wait", async () => {
        vi.useFakeTimers();
        const onRetry = vi.fn<RetryListener>();
        const rateLimited = new Response(null, {
            status: 429,
            headers: { "retry-after": "2" },
        });
        const next = respondWith(
            rateLimited,
            new Response(null, { status: 200 }),
        );
        const pending = send(next, {
            policy: { ...defaultRetryPolicy, jitterMs: 0 },
            onRetry,
        });
        await vi.advanceTimersByTimeAsync(2_000);
        await pending;
        expect(onRetry).toHaveBeenCalledExactlyOnceWith(rateLimited, 2_000);
    });

    it("does not call onRetry when it returns the response", async () => {
        const onRetry = vi.fn<RetryListener>();
        await send(
            respondWith(
                new Response(null, {
                    status: 429,
                    headers: { "retry-after": "31" },
                }),
            ),
            { onRetry },
        );
        expect(onRetry).not.toHaveBeenCalled();
    });

    it("stops waiting when the request is aborted", async () => {
        vi.useFakeTimers();
        const controller = new AbortController();
        const next = respondWith(new Response(null, { status: 503 }));
        const pending = send(next, {
            policy: defaultRetryPolicy,
            request: new Request("https://api.proton.me/test", {
                signal: controller.signal,
            }),
        });
        const assertion = expect(pending).rejects.toThrow("cancelled");
        await vi.advanceTimersByTimeAsync(0);
        controller.abort(new Error("cancelled"));
        await assertion;
        expect(next).toHaveBeenCalledOnce();
    });
});
