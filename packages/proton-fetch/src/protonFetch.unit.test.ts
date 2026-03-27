import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MiddlewareFn, ProtonConfig } from "./interface.ts";
import { ProtonFetch } from "./protonFetch.ts";
import { getRefresh, refreshOnce } from "./refreshManager.ts";

vi.mock("./requestLock.ts", () => ({
    requestLock: vi.fn((_id: string, cb: () => Promise<unknown>) => cb()),
}));

vi.mock("./refreshManager.ts", () => ({
    getRefresh: vi.fn().mockReturnValue(undefined),
    refreshOnce: vi.fn().mockResolvedValue("ok"),
}));

const baseConfig: ProtonConfig = {
    url: new URL("https://api.proton.me"),
    appVersion: "web-calendar@1.0.0",
    uid: "user-123",
    locale: "en_US",
};

beforeEach(() => {
    vi.resetAllMocks();
});

// ─────────────────────────────────────────────
// ProtonFetch class
// ─────────────────────────────────────────────
describe("ProtonFetch", () => {
    beforeEach(() => {
        vi.mocked(getRefresh).mockReturnValue(undefined);
        vi.mocked(refreshOnce).mockResolvedValue("ok");
    });

    it("stores config on the instance", () => {
        const pf = new ProtonFetch({ config: baseConfig });
        expect(pf.config).toEqual(baseConfig);
    });

    it("setUid updates config.uid", () => {
        const pf = new ProtonFetch({ config: { ...baseConfig } });
        pf.setUid("new-uid");
        expect(pf.config.uid).toBe("new-uid");
    });

    it("setAppVersion updates config.appVersion", () => {
        const pf = new ProtonFetch({ config: { ...baseConfig } });
        pf.setAppVersion("web-calendar@2.0.0");
        expect(pf.config.appVersion).toBe("web-calendar@2.0.0");
    });

    it("calls the custom fetchFn", async () => {
        const fetchFn = vi
            .fn()
            .mockResolvedValue(new Response(null, { status: 200 }));
        const pf = new ProtonFetch({ fetchFn, config: baseConfig });
        await pf.fetch("https://api.proton.me/events");
        expect(fetchFn).toHaveBeenCalledOnce();
    });

    it("returns the response from the fetch function", async () => {
        const pf = new ProtonFetch({
            fetchFn: vi
                .fn()
                .mockResolvedValue(new Response(null, { status: 204 })),
            config: baseConfig,
        });
        const response = await pf.fetch("https://api.proton.me/events");
        expect(response.status).toBe(204);
    });

    it("adds x-pm-uid header via headerMiddleware", async () => {
        let capturedRequest: Request | undefined;
        const pf = new ProtonFetch({
            fetchFn: vi.fn().mockImplementation((req: Request) => {
                capturedRequest = req;
                return Promise.resolve(new Response(null, { status: 200 }));
            }),
            config: { ...baseConfig, uid: "my-uid" },
        });
        await pf.fetch("https://api.proton.me/events");
        expect(capturedRequest?.headers.get("x-pm-uid")).toBe("my-uid");
    });

    it("adds x-pm-appversion header via headerMiddleware", async () => {
        let capturedRequest: Request | undefined;
        const pf = new ProtonFetch({
            fetchFn: vi.fn().mockImplementation((req: Request) => {
                capturedRequest = req;
                return Promise.resolve(new Response(null, { status: 200 }));
            }),
            config: { ...baseConfig, appVersion: "web@1.0.0" },
        });
        await pf.fetch("https://api.proton.me/events");
        expect(capturedRequest?.headers.get("x-pm-appversion")).toBe(
            "web@1.0.0",
        );
    });

    it("rewrites the request URL via originMiddleware when config has a path prefix", async () => {
        let capturedRequest: Request | undefined;
        const pf = new ProtonFetch({
            fetchFn: vi.fn().mockImplementation((req: Request) => {
                capturedRequest = req;
                return Promise.resolve(new Response(null, { status: 200 }));
            }),
            config: {
                ...baseConfig,
                url: new URL("https://api.proton.me/api"),
            },
        });
        await pf.fetch("https://placeholder.local/events");
        expect(capturedRequest?.url).toBe("https://api.proton.me/api/events");
    });

    it("attaches a timeout signal via timeoutMiddleware", async () => {
        let capturedRequest: Request | undefined;
        const pf = new ProtonFetch({
            fetchFn: vi.fn().mockImplementation((req: Request) => {
                capturedRequest = req;
                return Promise.resolve(new Response(null, { status: 200 }));
            }),
            config: baseConfig,
        });
        await pf.fetch("https://api.proton.me/events");
        expect(capturedRequest?.signal).toBeDefined();
    });
});

// ─────────────────────────────────────────────
// Middleware pipeline
// ─────────────────────────────────────────────
describe("Middleware pipeline", () => {
    it("runs middlewares in order (first in array is outermost)", async () => {
        const order: string[] = [];
        const m1: MiddlewareFn = (next) => async (req) => {
            order.push("m1-before");
            const res = await next(req);
            order.push("m1-after");
            return res;
        };
        const m2: MiddlewareFn = (next) => async (req) => {
            order.push("m2-before");
            const res = await next(req);
            order.push("m2-after");
            return res;
        };
        const terminal = vi
            .fn()
            .mockResolvedValue(new Response(null, { status: 200 }));
        const pf = new ProtonFetch({
            fetchFn: terminal,
            config: baseConfig,
            middlewares: [m1, m2],
        });
        await pf.fetch("https://api.proton.me/test");
        expect(order).toEqual([
            "m1-before",
            "m2-before",
            "m2-after",
            "m1-after",
        ]);
    });

    it("passes the modified request from one middleware to the next", async () => {
        let seenByM2: Request | undefined;
        const m1: MiddlewareFn = (next) => (req) =>
            next(new Request(req, { headers: { "x-tag": "from-m1" } }));
        const m2: MiddlewareFn = (next) => (req) => {
            seenByM2 = req;
            return next(req);
        };
        const terminal = vi
            .fn()
            .mockResolvedValue(new Response(null, { status: 200 }));
        const pf = new ProtonFetch({
            fetchFn: terminal,
            config: baseConfig,
            middlewares: [m1, m2],
        });
        await pf.fetch("https://api.proton.me/test");
        expect(seenByM2?.headers.get("x-tag")).toBe("from-m1");
    });

    it("middleware can short-circuit and replace the response", async () => {
        const intercepted = new Response("intercepted", { status: 202 });
        const m1: MiddlewareFn = () => async () => intercepted;
        const terminal = vi
            .fn()
            .mockResolvedValue(new Response(null, { status: 200 }));
        const pf = new ProtonFetch({
            fetchFn: terminal,
            config: baseConfig,
            middlewares: [m1],
        });
        const result = await pf.fetch("https://api.proton.me/test");
        expect(result.status).toBe(202);
        expect(terminal).not.toHaveBeenCalled();
    });

    it("middleware can catch errors thrown by next", async () => {
        const recovered = new Response(null, { status: 503 });
        const m1: MiddlewareFn = (next) => async (req) => {
            try {
                return await next(req);
            } catch {
                return recovered;
            }
        };
        const terminal = vi
            .fn()
            .mockRejectedValue(new Error("Network failure"));
        const pf = new ProtonFetch({
            fetchFn: terminal,
            config: baseConfig,
            middlewares: [m1],
        });
        const result = await pf.fetch("https://api.proton.me/test");
        expect(result.status).toBe(503);
    });

    it("rethrows errors when no middleware catches them", async () => {
        const m1: MiddlewareFn = (next) => (req) => next(req);
        const terminal = vi
            .fn()
            .mockRejectedValue(new Error("Network failure"));
        const pf = new ProtonFetch({
            fetchFn: terminal,
            config: baseConfig,
            middlewares: [m1],
        });
        await expect(pf.fetch("https://api.proton.me/test")).rejects.toThrow(
            "Network failure",
        );
    });

    it("finally blocks in middleware run on success", async () => {
        const cleanup = vi.fn();
        const m1: MiddlewareFn = (next) => async (req) => {
            try {
                return await next(req);
            } finally {
                cleanup();
            }
        };
        const terminal = vi
            .fn()
            .mockResolvedValue(new Response(null, { status: 200 }));
        const pf = new ProtonFetch({
            fetchFn: terminal,
            config: baseConfig,
            middlewares: [m1],
        });
        await pf.fetch("https://api.proton.me/test");
        expect(cleanup).toHaveBeenCalledOnce();
    });

    it("finally blocks in middleware run when next throws", async () => {
        const cleanup = vi.fn();
        const m1: MiddlewareFn = (next) => async (req) => {
            try {
                return await next(req);
            } finally {
                cleanup();
            }
        };
        const terminal = vi.fn().mockRejectedValue(new Error("fail"));
        const pf = new ProtonFetch({
            fetchFn: terminal,
            config: baseConfig,
            middlewares: [m1],
        });
        await expect(pf.fetch("https://api.proton.me/test")).rejects.toThrow();
        expect(cleanup).toHaveBeenCalledOnce();
    });
});
