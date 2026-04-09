import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleRefresh, refreshOnce, getRefresh } from "./refreshManager.ts";
import { requestLock } from "./requestLock.ts";

vi.mock("./requestLock", () => ({
    requestLock: vi.fn((_id: string, cb: () => Promise<unknown>) => cb()),
}));

const uid = "user-123";

function mockFetch(status: number) {
    return vi.fn().mockResolvedValue(new Response(null, { status }));
}

describe("handleRefresh", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("makes a POST to /auth/refresh with uid and appversion headers", async () => {
        const fetch = mockFetch(200);
        await handleRefresh(fetch, uid);

        expect(fetch).toHaveBeenCalledOnce();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const request: Request = fetch.mock?.calls?.[0]?.[0];
        expect(request.method).toBe("POST");
        expect(request.url).toContain("/auth/refresh");
        expect(request.headers.get("x-pm-uid")).toBe(uid);
    });

    it("acquires a lock scoped to the uid", async () => {
        await handleRefresh(mockFetch(200), uid);

        expect(requestLock).toHaveBeenCalledWith(
            `refresh-${uid}`,
            expect.any(Function),
        );
    });

    it("returns 'ok' for a 200 response", async () => {
        const result = await handleRefresh(mockFetch(200), uid);
        expect(result).toBe("ok");
    });

    it("returns 'fail' for a 400 response", async () => {
        const result = await handleRefresh(mockFetch(400), uid);
        expect(result).toBe("fail");
    });

    it("returns 'fail' for a 401 response", async () => {
        const result = await handleRefresh(mockFetch(401), uid);
        expect(result).toBe("fail");
    });

    it("returns 'fail' for a 499 response (upper 4xx boundary)", async () => {
        const result = await handleRefresh(mockFetch(499), uid);
        expect(result).toBe("fail");
    });

    it("returns the Response for a 500 error", async () => {
        const result = await handleRefresh(mockFetch(500), uid);
        expect(result).toBeInstanceOf(Response);
        expect((result as Response).status).toBe(500);
    });

    it("returns the Response for non-200, non-4xx status (e.g. 503)", async () => {
        const result = await handleRefresh(mockFetch(503), uid);
        expect(result).toBeInstanceOf(Response);
        expect((result as Response).status).toBe(503);
    });
});

describe("refreshOnce", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("runs a refresh and returns 'ok'", async () => {
        const result = await refreshOnce(mockFetch(200), uid);
        expect(result).toBe("ok");
    });

    // refreshOnce is async so each call returns a new wrapper Promise — identity
    // equality is not meaningful. The important invariant is that the underlying
    // httpFetch is only called once for concurrent requests on the same uid.
    it("deduplicates concurrent calls for the same uid (httpFetch called once)", async () => {
        let resolveHttpFetch!: (r: Response) => void;
        const pendingFetch = vi.fn(
            () =>
                new Promise<Response>((resolve) => {
                    resolveHttpFetch = resolve;
                }),
        );

        const p1 = refreshOnce(pendingFetch, "uid-dedup");
        const p2 = refreshOnce(pendingFetch, "uid-dedup");

        expect(pendingFetch).toHaveBeenCalledOnce();

        resolveHttpFetch(new Response(null, { status: 200 }));

        const [r1, r2] = await Promise.all([p1, p2]);
        expect(r1).toBe("ok");
        expect(r2).toBe("ok");
    });

    it("uses separate runners for different uids", async () => {
        let resolve1!: (r: Response) => void;
        let resolve2!: (r: Response) => void;

        const fetch1 = vi.fn(
            () =>
                new Promise<Response>((resolve) => {
                    resolve1 = resolve;
                }),
        );
        const fetch2 = vi.fn(
            () =>
                new Promise<Response>((resolve) => {
                    resolve2 = resolve;
                }),
        );

        const p1 = refreshOnce(fetch1, "uid-sep-a");
        const p2 = refreshOnce(fetch2, "uid-sep-b");

        // Each uid gets its own fetch call immediately.
        expect(fetch1).toHaveBeenCalledOnce();
        expect(fetch2).toHaveBeenCalledOnce();

        resolve1(new Response(null, { status: 200 }));
        resolve2(new Response(null, { status: 200 }));

        const [r1, r2] = await Promise.all([p1, p2]);
        expect(r1).toBe("ok");
        expect(r2).toBe("ok");
    });

    it("allows a new refresh after the previous one completes", async () => {
        const fetch = mockFetch(200);

        await refreshOnce(fetch, "uid-sequential");
        await refreshOnce(fetch, "uid-sequential");

        expect(fetch).toHaveBeenCalledTimes(2);
    });
});

describe("getRefresh", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns undefined when no refresh is running", () => {
        expect(getRefresh("unknown-uid")).toBeUndefined();
    });

    // getRefresh returns the inner runner promise, not the async wrapper from
    // refreshOnce. So we verify it is a pending Promise that resolves correctly.
    it("returns a pending promise while a refresh is in progress", async () => {
        let resolveHttpFetch!: (r: Response) => void;
        const pendingFetch = vi.fn(
            () =>
                new Promise<Response>((resolve) => {
                    resolveHttpFetch = resolve;
                }),
        );

        const refreshPromise = refreshOnce(pendingFetch, "uid-in-progress");
        const pending = getRefresh("uid-in-progress");

        expect(pending).toBeInstanceOf(Promise);

        resolveHttpFetch(new Response(null, { status: 200 }));

        expect(await pending).toBe("ok");
        expect(await refreshPromise).toBe("ok");
    });

    it("returns undefined after the refresh completes", async () => {
        await refreshOnce(mockFetch(200), "uid-done");
        expect(getRefresh("uid-done")).toBeUndefined();
    });
});
