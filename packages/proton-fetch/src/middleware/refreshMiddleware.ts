import type { MiddlewareFn } from "../interface.ts";
import { getRefresh, refreshOnce } from "../refreshManager.ts";

export const refreshMiddleware: MiddlewareFn = (next, context) => {
    return async (request) => {
        const uid = request.headers.get("x-pm-uid");

        // If it's the refresh call, ignore recursive requests
        const isRefresh = context.refresh === true;

        // Hold requests for this uid while refresh is pending
        if (uid && !isRefresh) {
            const refreshPromise = getRefresh(uid);
            if (refreshPromise) {
                await refreshPromise.catch(() => {});
            }
        }

        const response = await next(request);

        if (response.status === 401 && uid && !isRefresh) {
            const fetch = context.createFetch({
                ...context,
                startedAt: Date.now(),
                refresh: true,
            });
            const refreshResponse = await refreshOnce(fetch, uid);
            // Succeeded, retry request.
            if (refreshResponse === "ok") {
                return fetch(request);
            }
            // Refresh failed, return 401 to consumers
            else if (refreshResponse === "fail") {
                return response;
            }
            // Other network error
            return refreshResponse;
        }

        return response;
    };
};
