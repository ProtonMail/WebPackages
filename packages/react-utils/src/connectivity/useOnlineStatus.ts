import { useSyncExternalStore } from "react";

import { OnlineObserver } from "./OnlineObserver.ts";

let defaultObserver: OnlineObserver | undefined;

/**
 * Lazily created module-level singleton: built on first use (never at import
 * time, so importing is side-effect free) with all option defaults and a fetch
 * that defers to the global at call time.
 */
const getDefaultObserver = () => {
    defaultObserver ??= new OnlineObserver({
        // Defer to the global so the observer can be created before the
        // app has installed its own fetch.
        fetch: (...args: Parameters<typeof window.fetch>) =>
            window.fetch(...args),
    });
    return defaultObserver;
};

/**
 * Reports connectivity as `{ isOnline, isBackOnline }`, backed by pings from
 * `observer` (see {@link OnlineObserver}). With no argument, a default observer
 * pings `DEFAULT_PING_URL` using the global fetch. Apps needing their own
 * fetch or ping URL (e.g. Electron) should create one `OnlineObserver` at app
 * level and pass it here so every consumer shares a single ping loop.
 */
export const useOnlineStatus = (
    observer: OnlineObserver = getDefaultObserver(),
) => useSyncExternalStore(observer.subscribe, observer.getSnapshot);
