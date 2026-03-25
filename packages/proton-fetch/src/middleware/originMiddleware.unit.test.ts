import { describe, expect, it, vi } from "vitest";
import type {
    FetchLike,
    ProtonConfig,
    ProtonFetchContext,
} from "../interface.ts";
import { originMiddleware } from "./originMiddleware.ts";

const baseConfig: ProtonConfig = {
    url: new URL("https://api.proton.me"),
    appVersion: "web-calendar@1.0.0",
    uid: "user-123",
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

describe("originMiddleware", () => {
    const configWithPath: ProtonConfig = {
        ...baseConfig,
        url: new URL("https://api.proton.me/api"),
    };

    it("rewrites the request URL to the configured origin and path", async () => {
        let capturedRequest: Request | undefined;
        const terminal: FetchLike = vi
            .fn()
            .mockImplementation((req: Request) => {
                capturedRequest = req;
                return Promise.resolve(new Response(null, { status: 200 }));
            });
        await originMiddleware(
            terminal,
            makeContext({ config: configWithPath }),
        )(new Request("https://placeholder.local/events"));
        expect(capturedRequest?.url).toBe("https://api.proton.me/api/events");
    });

    it("preserves query parameters", async () => {
        let capturedRequest: Request | undefined;
        const terminal: FetchLike = vi
            .fn()
            .mockImplementation((req: Request) => {
                capturedRequest = req;
                return Promise.resolve(new Response(null, { status: 200 }));
            });
        await originMiddleware(
            terminal,
            makeContext({ config: configWithPath }),
        )(new Request("https://placeholder.local/events?page=2"));
        expect(capturedRequest?.url).toBe(
            "https://api.proton.me/api/events?page=2",
        );
    });

    it("preserves the original request method and headers", async () => {
        let capturedRequest: Request | undefined;
        const terminal: FetchLike = vi
            .fn()
            .mockImplementation((req: Request) => {
                capturedRequest = req;
                return Promise.resolve(new Response(null, { status: 200 }));
            });
        await originMiddleware(
            terminal,
            makeContext({ config: configWithPath }),
        )(
            new Request("https://placeholder.local/events", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ key: "value" }),
            }),
        );
        expect(capturedRequest?.method).toBe("POST");
        expect(capturedRequest?.headers.get("content-type")).toBe(
            "application/json",
        );
    });
});
