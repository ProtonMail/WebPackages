import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PING_URL, OnlineObserver } from "./OnlineObserver.ts";

const respondWith = (status: number) =>
    vi.fn((_input: URL | RequestInfo, _init?: RequestInit) =>
        Promise.resolve(new Response(null, { status })),
    );

const rejectWith = (buildError: () => Error) =>
    vi.fn((_input: URL | RequestInfo, _init?: RequestInit) =>
        Promise.reject(buildError()),
    );

let navigatorOnLine = true;

// A browser does this on a connectivity change: navigator.onLine flips
// first, then the window event fires.
const goOffline = () => {
    navigatorOnLine = false;
    window.dispatchEvent(new Event("offline"));
};

const goOnline = () => {
    navigatorOnLine = true;
    window.dispatchEvent(new Event("online"));
};

// The observer only runs while subscribed; keep one subscriber around.
const observe = (observer: OnlineObserver) => {
    const unsubscribe = observer.subscribe(vi.fn());
    return unsubscribe;
};

describe("OnlineObserver", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        navigatorOnLine = true;
        vi.spyOn(navigator, "onLine", "get").mockImplementation(
            () => navigatorOnLine,
        );
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("getSnapshot reflects navigator.onLine, resynced on subscribe", () => {
        const observer = new OnlineObserver({ fetch: respondWith(200) });

        expect(observer.getSnapshot().isOnline).toBe(true);

        navigatorOnLine = false;
        const unsubscribe = observer.subscribe(vi.fn());
        expect(observer.getSnapshot().isOnline).toBe(false);
        unsubscribe();
    });

    it("defaults to online when navigator.onLine is unavailable", () => {
        vi.spyOn(navigator, "onLine", "get").mockImplementation(
            () => undefined as unknown as boolean,
        );

        const observer = new OnlineObserver({ fetch: respondWith(200) });

        expect(observer.getSnapshot().isOnline).toBe(true);
    });

    it("keeps the snapshot reference stable while nothing changes", () => {
        const observer = new OnlineObserver({ fetch: respondWith(200) });

        const first = observer.getSnapshot();
        expect(observer.getSnapshot()).toBe(first);

        // Same underlying value: no new snapshot object.
        goOnline();
        expect(observer.getSnapshot()).toBe(first);
    });

    it("notifies subscribers when the status changes", () => {
        const observer = new OnlineObserver({ fetch: respondWith(200) });
        const listener = vi.fn();

        observer.subscribe(listener);
        expect(listener).not.toHaveBeenCalled();

        // Going offline is debounced: no notification until `offlineDelay`.
        goOffline();
        expect(listener).not.toHaveBeenCalled();
        vi.advanceTimersByTime(5000);
        expect(listener).toHaveBeenCalledTimes(1);

        // Going back online notifies immediately.
        goOnline();
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it("notifies listeners only when the state actually changes", () => {
        const observer = new OnlineObserver({ fetch: respondWith(200) });
        const listener = vi.fn();

        observer.subscribe(listener);

        // navigator.onLine flips to false and back without a window event:
        // no notification because the observer never re-reads it.
        navigatorOnLine = false;
        vi.advanceTimersByTime(60000);
        expect(listener).not.toHaveBeenCalled();

        // A redundant repeat of an already-applied event does not notify again.
        goOffline();
        vi.advanceTimersByTime(5000);
        expect(listener).toHaveBeenCalledTimes(1);
        window.dispatchEvent(new Event("offline"));
        vi.advanceTimersByTime(60000);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it("stops notifying after unsubscribe and removes the window listeners", () => {
        const observer = new OnlineObserver({ fetch: respondWith(200) });
        const listener = vi.fn();
        const addSpy = vi.spyOn(window, "addEventListener");
        const removeSpy = vi.spyOn(window, "removeEventListener");

        const unsubscribe = observer.subscribe(listener);

        // Window listeners are attached lazily on the first subscribe.
        const handlers = ["online", "offline"].map((type) => {
            const call = addSpy.mock.calls.find(([event]) => event === type);
            expect(call, `listener for ${type}`).toBeDefined();
            return call?.[1];
        });

        unsubscribe();

        expect(removeSpy.mock.calls).toEqual(
            expect.arrayContaining([
                ["online", handlers[0]],
                ["offline", handlers[1]],
            ]),
        );

        window.dispatchEvent(new Event("offline"));
        expect(listener).not.toHaveBeenCalled();
    });

    it("keeps window listeners while other subscribers remain", () => {
        const observer = new OnlineObserver({ fetch: respondWith(200) });
        const first = vi.fn();
        const second = vi.fn();
        const removeSpy = vi.spyOn(window, "removeEventListener");

        const unsubscribeFirst = observer.subscribe(first);
        observer.subscribe(second);

        unsubscribeFirst();
        expect(removeSpy).not.toHaveBeenCalled();

        goOffline();
        vi.advanceTimersByTime(5000); // offline debounce elapses
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    });

    it("starts online without pinging", () => {
        const fetchMock = respondWith(200);
        const observer = new OnlineObserver({ fetch: fetchMock });
        observe(observer);

        expect(observer.getSnapshot()).toEqual({
            isOnline: true,
            isBackOnline: false,
        });

        vi.advanceTimersByTime(60000);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("pings the default URL while offline", () => {
        const fetchMock = respondWith(200);
        const observer = new OnlineObserver({ fetch: fetchMock });
        observe(observer);

        expect(DEFAULT_PING_URL).toBe("/tests/ping");

        goOffline();
        vi.advanceTimersByTime(5000); // debounce elapses, retries start
        vi.advanceTimersByTime(5000); // first retry tick

        expect(observer.getSnapshot().isOnline).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const request = fetchMock.mock.calls[0]?.[0] as Request;
        expect(request).toBeInstanceOf(Request);
        expect(request.method).toBe("GET");
        expect(new URL(request.url).pathname).toBe(DEFAULT_PING_URL);
    });

    it("debounces going offline by offlineDelay", () => {
        const fetchMock = respondWith(200);
        const observer = new OnlineObserver({
            fetch: fetchMock,
            offlineDelay: 3000,
        });
        observe(observer);

        goOffline();
        expect(observer.getSnapshot().isOnline).toBe(true);

        vi.advanceTimersByTime(2999);
        expect(observer.getSnapshot().isOnline).toBe(true);

        vi.advanceTimersByTime(1);
        expect(observer.getSnapshot().isOnline).toBe(false);
    });

    it("pings every retryInterval while offline and stops when back online", async () => {
        const fetchMock = respondWith(200);
        const observer = new OnlineObserver({
            fetch: fetchMock,
            retryInterval: 4000,
        });
        observe(observer);

        goOffline();
        // Debounce elapses, interval starts. Settled pings clear the pending
        // flag, so each tick can ping again.
        await vi.advanceTimersByTimeAsync(5000);
        expect(observer.getSnapshot().isOnline).toBe(false);

        await vi.advanceTimersByTimeAsync(4000);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(12000);
        expect(fetchMock).toHaveBeenCalledTimes(4);

        goOnline();
        expect(observer.getSnapshot().isOnline).toBe(true);
        const pingCount = fetchMock.mock.calls.length;

        // The back-online ping
        await vi.advanceTimersByTimeAsync(2000);
        expect(fetchMock).toHaveBeenCalledTimes(pingCount + 1);

        await vi.advanceTimersByTimeAsync(60000);
        expect(fetchMock).toHaveBeenCalledTimes(pingCount + 1); // retries stopped
    });

    it("goes offline when the back-online ping fails with a network error", async () => {
        const fetchMock = rejectWith(() => new TypeError("Failed to fetch"));
        const observer = new OnlineObserver({
            fetch: fetchMock,
            offlineDelay: 3000,
            backOnlineDuration: 2000,
        });
        observe(observer);

        goOffline();
        vi.advanceTimersByTime(3000);
        expect(observer.getSnapshot().isOnline).toBe(false);

        goOnline();
        expect(observer.getSnapshot().isBackOnline).toBe(true);

        // Confirmation ping fires and rejects.
        await vi.advanceTimersByTimeAsync(2000);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(observer.getSnapshot().isOnline).toBe(true); // still debounced

        vi.advanceTimersByTime(3000);
        expect(observer.getSnapshot().isOnline).toBe(false);
    });

    it.each([409, 503])(
        "does not mark offline when a ping responds with %i",
        async (status) => {
            const fetchMock = respondWith(status);
            const observer = new OnlineObserver({
                fetch: fetchMock,
                backOnlineDuration: 2000,
            });
            observe(observer);

            goOffline();
            vi.advanceTimersByTime(5000);
            goOnline();

            // Ping responds with the error status, then well past any offline
            // debounce.
            await vi.advanceTimersByTimeAsync(2000);
            await vi.advanceTimersByTimeAsync(60000);

            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(observer.getSnapshot().isOnline).toBe(true);
            expect(observer.getSnapshot().isBackOnline).toBe(false);
        },
    );

    it("keeps isBackOnline true for backOnlineDuration and pings once after it", async () => {
        const fetchMock = respondWith(200);
        const observer = new OnlineObserver({
            fetch: fetchMock,
            backOnlineDuration: 1500,
        });
        observe(observer);

        goOffline();
        vi.advanceTimersByTime(5000);
        expect(observer.getSnapshot().isOnline).toBe(false);

        goOnline();
        expect(observer.getSnapshot().isBackOnline).toBe(true);
        expect(fetchMock).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1500);
        expect(observer.getSnapshot().isBackOnline).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(60000);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(observer.getSnapshot().isOnline).toBe(true);
    });

    it("clears timers when the last subscriber unsubscribes", () => {
        // Like the real fetch: never settles on its own.
        const fetchMock = vi.fn(() => new Promise<Response>(() => undefined));
        const observer = new OnlineObserver({
            fetch: fetchMock,
            offlineDelay: 1000,
            retryInterval: 1000,
        });

        const unsubscribe = observe(observer);
        goOffline();
        vi.advanceTimersByTime(1000); // debounce elapses, interval starts
        vi.advanceTimersByTime(1000); // first ping
        expect(observer.getSnapshot().isOnline).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        unsubscribe();

        vi.advanceTimersByTime(60000);
        expect(fetchMock).toHaveBeenCalledTimes(1); // no retries kept running
    });

    it("shares one ping loop between multiple subscribers", async () => {
        const fetchMock = respondWith(200);
        const observer = new OnlineObserver({
            fetch: fetchMock,
            offlineDelay: 2000,
            retryInterval: 2000,
        });
        const first = vi.fn();
        const second = vi.fn();

        observer.subscribe(first);
        observer.subscribe(second);

        goOffline();
        await vi.advanceTimersByTimeAsync(2000); // debounce elapses, interval starts
        expect(observer.getSnapshot().isOnline).toBe(false);

        await vi.advanceTimersByTimeAsync(2000); // one tick, one ping
        expect(fetchMock).toHaveBeenCalledTimes(1);
        // Both consumers are woken by the same state change.
        expect(first).toHaveBeenCalled();
        expect(second).toHaveBeenCalled();
    });

    it("resyncs from navigator.onLine when resubscribing", async () => {
        const fetchMock = respondWith(200);
        const observer = new OnlineObserver({
            fetch: fetchMock,
            offlineDelay: 1000,
            retryInterval: 1000,
        });

        const unsubscribe = observe(observer);
        goOffline();
        await vi.advanceTimersByTimeAsync(2000); // offline, pinging
        expect(observer.getSnapshot().isOnline).toBe(false);

        unsubscribe();
        goOnline();
        const listener = vi.fn();
        observer.subscribe(listener);

        // Stale offline state dropped, no back-online banner on resubscribe.
        expect(observer.getSnapshot()).toEqual({
            isOnline: true,
            isBackOnline: false,
        });
        expect(listener).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(60000);
        expect(fetchMock.mock.calls.length).toBeGreaterThan(0); // it was pinging
        const pingCount = fetchMock.mock.calls.length;
        await vi.advanceTimersByTimeAsync(60000);
        expect(fetchMock).toHaveBeenCalledTimes(pingCount); // idle again, no pings
    });
});
