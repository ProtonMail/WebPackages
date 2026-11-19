import { describe, expect, it, vi } from "vitest";
import type { ProtonConfig, ProtonFetchContext } from "../interface.ts";
import { createServerTimeMiddleware } from "./serverTimeMiddleware.ts";

const baseConfig: ProtonConfig = {
    url: new URL("https://api.proton.me"),
    appVersion: "web-calendar@1.0.0",
    uid: "user-123",
    locale: "en_US",
};

function makeContext(): ProtonFetchContext {
    return {
        config: baseConfig,
        createFetch: vi.fn(),
        startedAt: Date.now(),
        middlewares: [],
    };
}

const DATE = "Tue, 17 Nov 2026 10:00:00 GMT";

const run = (headers: Record<string, string>, status = 200) => {
    const onServerTime = vi.fn();
    const response = new Response(null, { status, headers });
    const promise = createServerTimeMiddleware(onServerTime)(
        vi.fn().mockResolvedValue(response),
        makeContext(),
    )(new Request("https://api.proton.me/test"));
    return { onServerTime, promise, response };
};

describe("serverTimeMiddleware", () => {
    it("reports the Date header and returns the response unchanged", async () => {
        const { onServerTime, promise, response } = run({ Date: DATE });
        expect(await promise).toBe(response);
        expect(onServerTime).toHaveBeenCalledExactlyOnceWith(
            new Date(DATE),
            expect.any(Date),
        );
    });

    it("prefers a valid x-pm-date over Date", async () => {
        const { onServerTime, promise } = run({
            Date: DATE,
            "x-pm-date": "Tue, 17 Nov 2026 10:00:05 GMT",
        });
        await promise;
        expect(onServerTime.mock.calls[0]?.[0]).toEqual(
            new Date("Tue, 17 Nov 2026 10:00:05 GMT"),
        );
    });

    it("falls back to Date when x-pm-date is invalid", async () => {
        const { onServerTime, promise } = run({
            Date: DATE,
            "x-pm-date": "not a date",
        });
        await promise;
        expect(onServerTime.mock.calls[0]?.[0]).toEqual(new Date(DATE));
    });

    it("reports the server time of error responses too", async () => {
        const { onServerTime, promise } = run({ Date: DATE }, 422);
        expect((await promise).status).toBe(422);
        expect(onServerTime).toHaveBeenCalledOnce();
    });

    it("does not report without a valid date header", async () => {
        const { onServerTime, promise } = run({ Date: "not a date" });
        expect((await promise).status).toBe(200);
        expect(onServerTime).not.toHaveBeenCalled();
    });

    it("passes the time the request was issued, not when it resolved", async () => {
        vi.useFakeTimers({ now: new Date("2026-11-17T09:00:00Z") });
        try {
            const onServerTime = vi.fn();
            const next = vi.fn(() => {
                vi.setSystemTime(new Date("2026-11-17T09:05:00Z"));
                return Promise.resolve(
                    new Response(null, { headers: { Date: DATE } }),
                );
            });
            await createServerTimeMiddleware(onServerTime)(next, makeContext())(
                new Request("https://api.proton.me/test"),
            );
            expect(onServerTime.mock.calls[0]?.[1]).toEqual(
                new Date("2026-11-17T09:00:00Z"),
            );
        } finally {
            vi.useRealTimers();
        }
    });
});
