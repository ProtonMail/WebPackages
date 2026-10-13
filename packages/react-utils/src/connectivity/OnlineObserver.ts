export interface OnlineStatus {
    /** Connectivity is available, debounced by `offlineDelay` when going offline. */
    isOnline: boolean;
    /** True for `backOnlineDuration` after connectivity comes back. */
    isBackOnline: boolean;
}

export interface OnlineObserverOptions {
    /** Fetch implementation used for connectivity pings, e.g. `window.fetch`. */
    fetch: typeof window.fetch;
    /** Debounce before a detected loss of connectivity is reported as offline. */
    offlineDelay?: number;
    /** Interval between pings while offline. */
    retryInterval?: number;
    /** How long `isBackOnline` stays `true` after connectivity is restored. */
    backOnlineDuration?: number;
}

export const DEFAULT_PING_URL = "/tests/ping";

const getOnlineStatus = () =>
    typeof navigator !== "undefined" && typeof navigator.onLine === "boolean"
        ? navigator.onLine
        : true;

/**
 * Framework-agnostic observer of the browser's connectivity, backed by
 * `navigator.onLine`, the window `online`/`offline` events, and pings.
 *
 * `navigator.onLine` only reports that a network interface is up, so while
 * offline the observer pings `pingUrl` every `retryInterval` to notice the
 * network coming back, and once on reconnect it pings again after
 * `backOnlineDuration` to confirm the connection actually works. A single ping
 * URL can't be cross-checked against others, so one failed ping marks
 * offline; the `offlineDelay` debounce is the guard.
 *
 * Timers, listeners and pings run only while there is at least one subscriber.
 * Create one instance per app so every consumer shares a single ping loop.
 */
export class OnlineObserver {
    private readonly fetch: typeof window.fetch;
    private readonly offlineDelay: number;
    private readonly retryInterval: number;
    private readonly backOnlineDuration: number;

    private listeners = new Set<() => void>();

    private navigatorOnline = getOnlineStatus();
    private pingOffline = false;
    /** Last `navigatorOnline && !pingOffline` seen, to detect changes. */
    private lastSafe = this.navigatorOnline;
    private isOnline = this.navigatorOnline;
    private isBackOnline = false;
    private snapshot: OnlineStatus = {
        isOnline: this.isOnline,
        isBackOnline: this.isBackOnline,
    };

    private debounceTimer = 0;
    private retryTimer = 0;
    private backOnlineTimer = 0;
    private isPinging = false;

    constructor({
        fetch,
        offlineDelay = 5000,
        retryInterval = 5000,
        backOnlineDuration = 2000,
    }: OnlineObserverOptions) {
        this.fetch = fetch;
        this.offlineDelay = offlineDelay;
        this.retryInterval = retryInterval;
        this.backOnlineDuration = backOnlineDuration;
    }

    getSnapshot = (): OnlineStatus => this.snapshot;

    subscribe = (listener: () => void): (() => void) => {
        if (this.listeners.size === 0) {
            this.start();
        }
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
            if (this.listeners.size === 0) {
                this.stop();
            }
        };
    };

    /**
     * Start observing. Resyncs from `navigator.onLine` and drops any ping
     * verdict from a previous subscription: nothing was being measured while
     * unsubscribed, so the browser hint is all there is, and adopting it
     * immediately avoids a stale offline state and a spurious back-online
     * banner on resubscribe. The snapshot is synced without notifying —
     * `subscribe` never calls its listener synchronously, and readers always
     * see the fresh snapshot. If the resync lands offline, the retry loop
     * starts right away.
     */
    private start = () => {
        window.addEventListener("online", this.handleBrowserEvent);
        window.addEventListener("offline", this.handleBrowserEvent);
        this.pingOffline = false;
        this.navigatorOnline = getOnlineStatus();
        this.lastSafe = this.navigatorOnline;
        this.isOnline = this.navigatorOnline;
        this.isBackOnline = false;
        if (!this.isOnline) {
            this.retryTimer = window.setInterval(
                this.handlePing,
                this.retryInterval,
            );
        }
        this.publish(false);
    };

    /** Tear everything down: no listeners and no timers. */
    private stop = () => {
        window.removeEventListener("online", this.handleBrowserEvent);
        window.removeEventListener("offline", this.handleBrowserEvent);
        window.clearTimeout(this.debounceTimer);
        this.clearTransition();
    };

    private handleBrowserEvent = () => {
        this.navigatorOnline = getOnlineStatus();
        this.applySafeOnline();
    };

    /**
     * Push `navigatorOnline && !pingOffline` through the debounce: going online
     * is immediate, going offline waits `offlineDelay`.
     */
    private applySafeOnline = () => {
        const safeOnline = this.navigatorOnline && !this.pingOffline;
        if (safeOnline === this.lastSafe) {
            return;
        }
        this.lastSafe = safeOnline;
        window.clearTimeout(this.debounceTimer);
        if (safeOnline) {
            this.setOnline(true);
            return;
        }
        this.debounceTimer = window.setTimeout(() => {
            this.setOnline(false);
        }, this.offlineDelay);
    };

    /** React to a change of the debounced status. */
    private setOnline = (isOnline: boolean) => {
        if (isOnline === this.isOnline) {
            return;
        }
        this.isOnline = isOnline;
        this.clearTransition();

        if (!isOnline) {
            this.retryTimer = window.setInterval(
                this.handlePing,
                this.retryInterval,
            );
            this.publish(true);
            return;
        }

        // Show the "back online" indicator for `backOnlineDuration` whenever
        // connectivity comes back, then confirm it with a single ping.
        this.isBackOnline = true;
        this.backOnlineTimer = window.setTimeout(() => {
            this.isBackOnline = false;
            this.handlePing();
            this.publish(true);
        }, this.backOnlineDuration);
        this.publish(true);
    };

    private handlePing = () => {
        // A previous ping may still be pending, so skip rather than pile up
        // pings against a host that isn't answering.
        if (this.isPinging) {
            return;
        }
        this.isPinging = true;

        this.fetch(
            new Request(DEFAULT_PING_URL, {
                method: "get",
            }),
        )
            .then((response) => {
                if (response.status >= 200) {
                    this.setPingOffline(false);
                }
            })
            .catch(() => {
                // Network failure or timeout: mark offline.
                this.setPingOffline(true);
            })
            .finally(() => {
                this.isPinging = false;
            });
    };

    private setPingOffline = (pingOffline: boolean) => {
        // Results arriving after teardown belong to a ping loop that no longer
        // exists; `start` resyncs from `navigator.onLine` on resubscribe.
        if (this.listeners.size === 0 || pingOffline === this.pingOffline) {
            return;
        }
        this.pingOffline = pingOffline;
        this.applySafeOnline();
    };

    private clearTransition = () => {
        window.clearInterval(this.retryTimer);
        window.clearTimeout(this.backOnlineTimer);
    };

    /** Publish a new snapshot; notify listeners only on an actual change. */
    private publish = (notify: boolean) => {
        if (
            this.snapshot.isOnline === this.isOnline &&
            this.snapshot.isBackOnline === this.isBackOnline
        ) {
            return;
        }
        this.snapshot = {
            isOnline: this.isOnline,
            isBackOnline: this.isBackOnline,
        };
        if (notify) {
            this.listeners.forEach((listener) => listener());
        }
    };
}
