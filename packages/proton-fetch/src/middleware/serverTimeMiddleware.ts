import type { MiddlewareFn } from "../interface.ts";

export type ServerTimeListener = (
    serverTime: Date,
    requestIssuedAt: Date,
) => void;

const getValidDate = (header: string | null) => {
    if (!header) {
        return;
    }
    const date = new Date(header);
    return Number.isNaN(date.getTime()) ? undefined : date;
};

/**
 * The server time of a response: the custom `x-pm-date` header when valid,
 * otherwise the standard `Date` header. `undefined` when neither is valid.
 */
export const getServerTime = (headers: Headers) =>
    getValidDate(headers.get("x-pm-date")) ?? getValidDate(headers.get("date"));

/**
 * Creates a middleware that reports the server time of every response, see
 * `getServerTime`. Responses without a valid date are passed through without
 * a report.
 *
 * `requestIssuedAt` is the local time the request was sent, so a stale server
 * time can be spotted when a response is processed after the device wakes up.
 * The arguments match `updateServerTime` from `@protontech/crypto`, which can
 * be passed directly.
 */
export const createServerTimeMiddleware = (
    onServerTime: ServerTimeListener,
): MiddlewareFn => {
    return (next) => {
        return async (request) => {
            const requestIssuedAt = new Date();
            const response = await next(request);
            const serverTime = getServerTime(response.headers);
            if (serverTime) {
                onServerTime(serverTime, requestIssuedAt);
            }
            return response;
        };
    };
};
