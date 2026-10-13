import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PING_URL, OnlineObserver } from "./OnlineObserver.ts";
import { useOnlineStatus } from "./useOnlineStatus.ts";

const respondWith = (status: number) =>
    vi.fn((_input: URL | RequestInfo, _init?: RequestInit) =>
        Promise.resolve(new Response(null, { status })),
    );

let navigatorOnLine = true;

// A browser does this on a connectivity change: navigator.onLine flips
// first, then the window event fires.
const goOffline = () => {
    navigatorOnLine = false;
    act(() => {
        window.dispatchEvent(new Event("offline"));
    });
};

const goOnline = () => {
    navigatorOnLine = true;
    act(() => {
        window.dispatchEvent(new Event("online"));
    });
};

describe("useOnlineStatus", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        navigatorOnLine = true;
        vi.spyOn(navigator, "onLine", "get").mockImplementation(
            () => navigatorOnLine,
        );
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("reflects the observer's initial snapshot", () => {
        const observer = new OnlineObserver({ fetch: respondWith(200) });
        const { result } = renderHook(() => useOnlineStatus(observer));

        expect(result.current).toEqual({ isOnline: true, isBackOnline: false });
    });

    it("re-renders when the status goes offline and back online", async () => {
        const fetchMock = respondWith(200);
        const observer = new OnlineObserver({
            fetch: fetchMock,
            offlineDelay: 1000,
            retryInterval: 1000,
            backOnlineDuration: 500,
        });
        const { result } = renderHook(() => useOnlineStatus(observer));

        goOffline();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1000); // debounce elapses
        });
        expect(result.current.isOnline).toBe(false);

        goOnline();
        expect(result.current.isOnline).toBe(true);
        expect(result.current.isBackOnline).toBe(true);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(500); // back-online ping
        });
        expect(result.current.isBackOnline).toBe(false);
    });

    it("unsubscribes on unmount, tearing down the pings", async () => {
        const fetchMock = respondWith(200);
        const observer = new OnlineObserver({
            fetch: fetchMock,
            offlineDelay: 1000,
            retryInterval: 1000,
        });
        const { unmount } = renderHook(() => useOnlineStatus(observer));

        goOffline();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000); // debounce + first ping
        });
        const pingCount = fetchMock.mock.calls.length;
        expect(pingCount).toBeGreaterThan(0);

        unmount();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(60000);
        });
        expect(fetchMock).toHaveBeenCalledTimes(pingCount); // retries stopped
    });

    it("shares one ping loop between two hooks on the same observer", async () => {
        const fetchMock = respondWith(200);
        const observer = new OnlineObserver({
            fetch: fetchMock,
            offlineDelay: 1000,
            retryInterval: 1000,
        });
        renderHook(() => useOnlineStatus(observer));
        renderHook(() => useOnlineStatus(observer));

        goOffline();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1000); // debounce elapses
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1000); // one tick, one ping
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("without an argument, pings DEFAULT_PING_URL via the global fetch", async () => {
        // The default observer is a lazily created module singleton, so start
        // from a fresh module graph for each run of this test.
        vi.resetModules();
        const fetchMock = respondWith(200);
        vi.stubGlobal("fetch", fetchMock);
        try {
            const { useOnlineStatus: useDefaultOnlineStatus } =
                await import("./useOnlineStatus.ts");
            const { result } = renderHook(() => useDefaultOnlineStatus());

            expect(result.current).toEqual({
                isOnline: true,
                isBackOnline: false,
            });
            expect(fetchMock).not.toHaveBeenCalled();

            goOffline();
            await act(async () => {
                await vi.advanceTimersByTimeAsync(5000); // debounce elapses
            });
            await act(async () => {
                await vi.advanceTimersByTimeAsync(5000); // first retry tick
            });

            expect(result.current.isOnline).toBe(false);
            expect(fetchMock).toHaveBeenCalled();
            const request = fetchMock.mock.calls[0]?.[0] as Request;
            expect(request).toBeInstanceOf(Request);
            expect(new URL(request.url).pathname).toBe(DEFAULT_PING_URL);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
