export interface ServerTimeWithUpdateTimestamp {
    serverTime: Date,
    /**
     * Local time when the corresponding serverTime update was fetched;
     * this info is useful to detect a stale server time, e.g. when the
     * device wakes up from sleep and processes network responses received
     * before it went to sleep
     */
    serverTimeUpdatedAt: Date
};

let serverTimeWithTimestamp: ServerTimeWithUpdateTimestamp | null = null;

/**
 * If `updateServerTime()` was never called, then the device time is returned.
 * See `wasServerTimeEverUpdated()` to check whether the device time is being used.
 */
export const serverTime = () => serverTimeWithTimestamp?.serverTime ?? new Date();
/**
 * If `updateServerTime()` was never called, then the device time is returned for both `serverTime` and
 * `serverTimeUpdatedAt`.
 * See `wasServerTimeEverUpdated()` to check whether the device time is being used.
 */
export const serverTimeWithUpdateTimestamp = (): ServerTimeWithUpdateTimestamp => (serverTimeWithTimestamp ?
    { ...serverTimeWithTimestamp } :
    { serverTime: new Date(), serverTimeUpdatedAt: new Date() }
);

/**
 * @param serverTime
 * @param serverTimeUpdatedAt see `updateServerTimeWithUpdateTimestamp()`
 * @returns same as `serverTime()`
 */
export const updateServerTime = (serverTime: Date, serverTimeUpdatedAt: Date = new Date()) => {
    if (serverTimeWithTimestamp === null || serverTime >= serverTimeWithTimestamp.serverTime) {
        // always keep the update timestamp associated with the new server time,
        // instead of storing the "max" `updatedAt`, to avoid issues in case the local clock is adjusted,
        // potentially breaking staleness check logic.
        serverTimeWithTimestamp = { serverTime, serverTimeUpdatedAt };
    }
    return serverTimeWithTimestamp.serverTime;
};

/**
 * @param serverTime
 * @param serverTimeUpdatedAt local time when the serverTime update was fetched. This info is
 * stored for stale server time detection  e.g. when the device wakes up from sleep.
 * It should typically be the time the network request was issued rather than resolved,
 * so the server time is never considered fresher than it is.
 * @returns same as `serverTimeWithUpdateTimestamp()`
 */
export const updateServerTimeWithUpdateTimestamp = (serverTime: Date, serverTimeUpdatedAt: Date) => {
    updateServerTime(serverTime, serverTimeUpdatedAt);
    return serverTimeWithUpdateTimestamp();
};

/**
 * If `updateServerTime()` is never called, then `serverTime()` returns the device time.
 * This helper is for debugging purposes and returns whether the serverTime is indeed being used.
 */
export const wasServerTimeEverUpdated = () => serverTimeWithTimestamp !== null;
