import { describe, expect, it, vi } from "vitest";
import type {
    FetchLike,
    ProtonConfig,
    ProtonFetchContext,
} from "../interface.ts";
import { headerMiddleware } from "./headerMiddleware.ts";

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

describe("headerMiddleware", () => {
    it("adds x-pm-uid from config", async () => {
        let capturedRequest: Request | undefined;
        const terminal: FetchLike = vi
            .fn()
            .mockImplementation((req: Request) => {
                capturedRequest = req;
                return Promise.resolve(new Response(null, { status: 200 }));
            });
        await headerMiddleware(
            terminal,
            makeContext(),
        )(new Request("https://api.proton.me/test"));
        expect(capturedRequest?.headers.get("x-pm-uid")).toBe("user-123");
    });

    it("adds x-pm-appversion from config", async () => {
        let capturedRequest: Request | undefined;
        const terminal: FetchLike = vi
            .fn()
            .mockImplementation((req: Request) => {
                capturedRequest = req;
                return Promise.resolve(new Response(null, { status: 200 }));
            });
        await headerMiddleware(
            terminal,
            makeContext(),
        )(new Request("https://api.proton.me/test"));
        expect(capturedRequest?.headers.get("x-pm-appversion")).toBe(
            "web-calendar@1.0.0",
        );
    });

    it("does not overwrite an existing x-pm-uid header", async () => {
        let capturedRequest: Request | undefined;
        const terminal: FetchLike = vi
            .fn()
            .mockImplementation((req: Request) => {
                capturedRequest = req;
                return Promise.resolve(new Response(null, { status: 200 }));
            });
        await headerMiddleware(
            terminal,
            makeContext(),
        )(
            new Request("https://api.proton.me/test", {
                headers: { "x-pm-uid": "original-uid" },
            }),
        );
        expect(capturedRequest?.headers.get("x-pm-uid")).toBe("original-uid");
    });

    it("does not add x-pm-uid when uid is absent from config", async () => {
        let capturedRequest: Request | undefined;
        const terminal: FetchLike = vi
            .fn()
            .mockImplementation((req: Request) => {
                capturedRequest = req;
                return Promise.resolve(new Response(null, { status: 200 }));
            });
        const ctx = makeContext({ config: { ...baseConfig, uid: undefined } });
        await headerMiddleware(
            terminal,
            ctx,
        )(new Request("https://api.proton.me/test"));
        expect(capturedRequest?.headers.get("x-pm-uid")).toBeNull();
    });
});
