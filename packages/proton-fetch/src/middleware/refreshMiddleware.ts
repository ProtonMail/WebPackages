import type { MiddlewareFn } from "../interface.ts";
import { getRefresh, refreshOnce } from "../refreshManager.ts";

export type UnauthorizedListener = () => void;

/**
 * Creates the refresh middleware. On a 401 it attempts a single token refresh
 * and retries the request.
 *
 * If provided, `onUnauthorized` is invoked with the original request whenever a
 * 401 surfaces to the consumer — i.e. a genuine auth failure that the refresh
 * flow could not recover from — rather than the routine token-expiry 401s that
 * the refresh flow silently retries. The `context.refresh` guard prevents it
 * from firing on the internal retry requests spawned by the refresh flow.
 */
export const createRefreshMiddleware = (
    onUnauthorized?: UnauthorizedListener,
): MiddlewareFn => {
    return (next, context) => {
        return async (request) => {
            const uid = request.headers.get("x-pm-uid");

            // If it's the refresh call, ignore recursive requests. Without a
            // uid there's nothing to refresh, so pass straight through too.
            if (context.refresh === true || !uid) {
                return next(request);
            }

            // Hold requests for this uid while refresh is pending
            const refreshPromise = getRefresh(uid);
            if (refreshPromise) {
                await refreshPromise.catch(() => {});
            }

            // Sending the request downstream consumes its body. Only requests
            // that carry a body need a pristine copy to replay on retry after a
            // refresh; body-less requests (GET/HEAD — the common case) can be
            // re-sent as-is, so we skip the clone entirely for them.
            const retryRequest =
                request.body !== null ? request.clone() : undefined;

            const response = await next(request);

            if (response.status === 401) {
                const fetch = context.createFetch({
                    ...context,
                    startedAt: Date.now(),
                    refresh: true,
                });
                const refreshResponse = await refreshOnce(
                    fetch,
                    uid,
                    context.config.url,
                );
                // Succeeded, retry request. Re-send it downstream via `next`
                // rather than rebuilding the whole chain: the request has
                // already been processed by the outer middlewares (URL rewrite,
                // headers), so re-running them would rewrite the URL a second
                // time and re-read the body.
                if (refreshResponse === "ok") {
                    return next(retryRequest ?? request);
                }
                // Refresh failed, return 401 to consumers
                else if (refreshResponse === "fail") {
                    onUnauthorized?.();
                    return response;
                }
                // Other network error
                return refreshResponse;
            }

            return response;
        };
    };
};
