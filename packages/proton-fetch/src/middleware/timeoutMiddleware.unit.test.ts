import { describe, expect, it, vi } from "vitest";
import type {
    FetchLike,
    ProtonConfig,
    ProtonFetchContext,
} from "../interface.ts";
import { TimeoutError } from "../error.ts";
import { timeoutMiddleware } from "./timeoutMiddleware.ts";

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

describe("timeoutMiddleware", () => {
    it("attaches a timeout signal to the request passed to next", async () => {
        let capturedRequest: Request | undefined;
        const terminal: FetchLike = vi
            .fn()
            .mockImplementation((req: Request) => {
                capturedRequest = req;
                return Promise.resolve(new Response(null, { status: 200 }));
            });
        await timeoutMiddleware(
            terminal,
            makeContext(),
        )(new Request("https://api.proton.me/test"));
        expect(capturedRequest?.signal).toBeDefined();
    });

    it("passes a new Request instance to next, not the original", async () => {
        let capturedRequest: Request | undefined;
        const terminal: FetchLike = vi
            .fn()
            .mockImplementation((req: Request) => {
                capturedRequest = req;
                return Promise.resolve(new Response(null, { status: 200 }));
            });
        const original = new Request("https://api.proton.me/test");
        await timeoutMiddleware(terminal, makeContext())(original);
        expect(capturedRequest).toBeInstanceOf(Request);
        expect(capturedRequest).not.toBe(original);
    });

    it("throws TimeoutError when next rejects with DOMException TimeoutError", async () => {
        const terminal: FetchLike = vi
            .fn()
            .mockRejectedValue(
                new DOMException("The operation timed out.", "TimeoutError"),
            );
        await expect(
            timeoutMiddleware(
                terminal,
                makeContext(),
            )(new Request("https://api.proton.me/test")),
        ).rejects.toThrow(TimeoutError);
    });

    it("rethrows generic errors unchanged", async () => {
        const terminal: FetchLike = vi
            .fn()
            .mockRejectedValue(new Error("Network failure"));
        await expect(
            timeoutMiddleware(
                terminal,
                makeContext(),
            )(new Request("https://api.proton.me/test")),
        ).rejects.toThrow("Network failure");
    });

    it("throws TimeoutError for AbortError when the timeout signal has already aborted", async () => {
        const abortedController = new AbortController();
        abortedController.abort();
        vi.spyOn(AbortSignal, "timeout").mockReturnValue(
            abortedController.signal,
        );

        const terminal: FetchLike = vi
            .fn()
            .mockRejectedValue(new DOMException("Aborted", "AbortError"));
        try {
            await expect(
                timeoutMiddleware(
                    terminal,
                    makeContext(),
                )(new Request("https://api.proton.me/test")),
            ).rejects.toThrow(TimeoutError);
        } finally {
            vi.restoreAllMocks();
        }
    });

    it("rethrows AbortError unchanged when the timeout signal has not fired", async () => {
        const terminal: FetchLike = vi
            .fn()
            .mockRejectedValue(new DOMException("Aborted", "AbortError"));
        await expect(
            timeoutMiddleware(
                terminal,
                makeContext(),
            )(new Request("https://api.proton.me/test")),
        ).rejects.toThrow(DOMException);
    });
});
