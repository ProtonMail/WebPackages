/**
 * How important a request is to the user, sent as the urgency of the
 * `priority` header (RFC 9218). Lower is more urgent.
 */
export const ServiceType = {
    /** Drives the UI and should be sent as fast as possible, e.g. sign-in or fetching uncached data. */
    Interactive: 2,
    /** Affects the user indirectly, e.g. user actions on cached data or that can be retried later. */
    Normal: 4,
    /** Can be delayed significantly, e.g. a cache refresh. */
    Background: 5,
    /** Not important for the user experience, e.g. metrics. */
    Optional: 7,
} as const;

export type ServiceType = (typeof ServiceType)[keyof typeof ServiceType];

/**
 * How a request is retried when the API answers 429 or 5xx, see
 * `createRetryMiddleware` for which requests are retried. All durations are in
 * milliseconds.
 */
export interface RetryPolicy {
    /** Retries after the first attempt, 0 to never retry. */
    maxRetries: number;
    /** Delay before the first retry. */
    minDelayMs: number;
    /** Upper bound of the delay, before jitter. Longer `Retry-After` waits are not retried. */
    maxDelayMs: number;
    /** Added to the delay after each retry. */
    delayIncrementMs: number;
    /** Multiplies the delay after each retry, after the increment. */
    delayMultiplier: number;
    /** Up to this much random time is added to each delay. */
    jitterMs: number;
}

export const defaultRetryPolicy: RetryPolicy = {
    maxRetries: 3,
    minDelayMs: 1_000,
    maxDelayMs: 30_000,
    delayIncrementMs: 0,
    delayMultiplier: 2,
    jitterMs: 3_000,
};

/** How long a whole request may take, including retries, in milliseconds. */
export const defaultTimeoutMs = 30_000;

/** Policy for a single request, overriding the defaults set on the middlewares. */
export interface RequestPolicy {
    /** Merged over the retry middleware's policy, e.g. `{ maxRetries: 0 }`. */
    retry?: Partial<RetryPolicy>;
    service?: ServiceType;
    /** Replaces `defaultTimeoutMs` for this request. */
    timeoutMs?: number;
}

/** The delay before each retry the policy allows, in milliseconds. */
export function* retryDelays(
    policy: RetryPolicy,
    random: () => number = Math.random,
): Generator<number> {
    let delay = policy.minDelayMs;
    for (let retry = 0; retry < policy.maxRetries; retry++) {
        yield delay + random() * policy.jitterMs;
        delay = Math.min(
            (delay + policy.delayIncrementMs) * policy.delayMultiplier,
            policy.maxDelayMs,
        );
    }
}
