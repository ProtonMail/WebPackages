import type { MiddlewareFn } from "../interface.ts";
import {
    defaultRetryPolicy,
    type RetryPolicy,
    retryDelays,
} from "../policy.ts";
import { getDeadline } from "./utils.ts";

const idempotentMethods = new Set(["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]);

/**
 * 429 and 503 mean the request was not handled, so any method is retried.
 * Other 5xx may come after the server applied the request, so only idempotent
 * methods are retried.
 */
const isRetryable = (request: Request, response: Response) =>
    response.status === 429 ||
    response.status === 503 ||
    (response.status >= 500 && idempotentMethods.has(request.method));

/** The `Retry-After` header in milliseconds, 0 when missing or not in seconds. */
const getRetryAfter = (headers: Headers) => {
    const seconds = Number(headers.get("retry-after"));
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
};

/** Waits `ms`, or until `signal` aborts, then throws if it did. */
const wait = async (ms: number, signal: AbortSignal) => {
    await new Promise<void>((resolve) => {
        const done = () => {
            clearTimeout(timeoutId);
            signal.removeEventListener("abort", done);
            resolve();
        };
        const timeoutId = setTimeout(done, signal.aborted ? 0 : ms);
        signal.addEventListener("abort", done);
    });
    signal.throwIfAborted();
};

/** Called before each retry with the response being retried and the wait before the retry. */
export type RetryListener = (response: Response, delayMs: number) => void;

/**
 * Creates a middleware that retries requests answered with 429 or 503, or any
 * 5xx for idempotent methods (GET, HEAD, OPTIONS, PUT, DELETE), waiting
 * as `policy` says, or longer when the response has a `Retry-After` header.
 * A request can override the policy with the `policy.retry` fetch option.
 *
 * The last response is returned when the retries run out, when `Retry-After`
 * asks for more than `maxDelayMs`, or when the wait would end after the
 * request's time is up (see `timeoutMiddleware`). Network errors are not
 * retried. The wait stops when the request is aborted.
 *
 * `onRetry` gets the retried response before its body is discarded, e.g. to
 * log rate limiting or show that the server is busy.
 */
export const createRetryMiddleware = ({
    policy = defaultRetryPolicy,
    onRetry,
}: {
    policy?: RetryPolicy;
    onRetry?: RetryListener;
} = {}): MiddlewareFn => {
    return (next, context) => {
        return async (request) => {
            const requestPolicy = { ...policy, ...context.policy?.retry };
            const deadline = getDeadline(context);
            for (const policyDelay of retryDelays(requestPolicy)) {
                // Sending consumes the body, so keep the original for the next attempt.
                const response = await next(request.clone());
                if (!isRetryable(request, response)) {
                    return response;
                }
                const retryAfter = getRetryAfter(response.headers);
                const delay = Math.max(policyDelay, retryAfter);
                if (
                    retryAfter > requestPolicy.maxDelayMs ||
                    Date.now() + delay >= deadline
                ) {
                    return response;
                }
                onRetry?.(response, delay);
                await response.body?.cancel();
                await wait(delay, request.signal);
            }
            return next(request);
        };
    };
};
