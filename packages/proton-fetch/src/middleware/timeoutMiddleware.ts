import type { MiddlewareFn } from "../interface.ts";
import { TimeoutError } from "../error.ts";
import { getDeadline } from "./utils.ts";

interface TimeoutEntry {
    signal: AbortSignal;
    cleanup: () => void;
}

const timeoutMap = new Map<symbol, TimeoutEntry>();

function createTimeoutEntry(timeout: number): TimeoutEntry {
    if (typeof AbortSignal?.timeout === "function") {
        return {
            signal: AbortSignal.timeout(timeout),
            cleanup: () => {},
        };
    }
    const controller = new AbortController();
    const cleanTimeout = () => {
        clearTimeout(timeoutId);
    };
    const cleanup = () => {
        controller.signal.removeEventListener("abort", cleanTimeout);
        cleanTimeout();
    };
    const timeoutSignal = controller.signal;
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    timeoutSignal.addEventListener("abort", cleanTimeout, {
        once: true,
    });
    return {
        signal: timeoutSignal,
        cleanup,
    };
}

/**
 * Fails the request with a `TimeoutError` once its time is up: `timeoutMs`
 * (default 30s, overridable with the `policy.timeoutMs` fetch option) after the
 * fetch call. The time is shared by all retries, so each attempt only gets what
 * is left.
 */
export const timeoutMiddleware: MiddlewareFn = (next, context) => {
    return async (request) => {
        const timeout = createTimeoutEntry(
            Math.max(getDeadline(context) - Date.now(), 0),
        );
        const id = Symbol("timeout");
        timeoutMap.set(id, timeout);
        const timeoutRequest = new Request(request, {
            signal: AbortSignal.any(
                [request.signal, timeout.signal].filter(Boolean),
            ),
        });
        try {
            return await next(timeoutRequest);
        } catch (error) {
            if (
                error instanceof DOMException &&
                error.name === "TimeoutError"
            ) {
                throw new TimeoutError("signal timed out");
            }
            if (error instanceof DOMException && error.name === "AbortError") {
                const timeoutEntry = timeoutMap.get(id);
                if (timeoutEntry?.signal?.aborted) {
                    throw new TimeoutError("signal timed out");
                }
            }
            throw error;
        } finally {
            const timeoutEntry = timeoutMap.get(id);
            if (timeoutEntry) {
                timeoutEntry.cleanup();
                timeoutMap.delete(id);
            }
        }
    };
};
