# @protontech/fetch

## 2.0.0

### Major Changes

- c34245a: Remove the default middlewares from ProtonFetch. `middlewares` is now required and the `onUnauthorized` option is removed; pass `createRefreshMiddleware(onUnauthorized)` in `middlewares` instead. `createRefreshMiddleware` now requires the `onUnauthorized` listener. The previous defaults were `[originMiddleware, headerMiddleware, createRefreshMiddleware(onUnauthorized), timeoutMiddleware]`.

### Minor Changes

- 4b96ee6: Add request policies: createRetryMiddleware retries 429 and 503 responses, and other 5xx responses to idempotent methods, with exponential backoff, jitter and `Retry-After`, and reports each retry to an optional `onRetry` listener. createPriorityMiddleware sends the service type as the `priority` header. Both take a default and can be overridden per request with the new `policy` fetch option, e.g. `fetch(url, { policy: { retry: { maxRetries: 0 }, service: ServiceType.Interactive, timeoutMs: 10_000 } })`. `RetryPolicy`, `ServiceType`, `defaultRetryPolicy` and `defaultTimeoutMs` are exported from `@protontech/fetch/policy.ts`.

    timeoutMiddleware now limits the whole request, including retries, to `timeoutMs` (default 30s) from the fetch call, and `policy.timeoutMs` overrides it per request. The retry middleware returns the last response instead of waiting past that time. The token refresh uses its own policy (`refreshPolicy`: interactive, 15s) rather than the policy of the request that got the 401, since every request of the session waits on it.

- c34245a: Add createServerTimeMiddleware to report the server time from the x-pm-date or Date response header, and getServerTime to read it from any Headers

### Patch Changes

- 4b96ee6: Aborting a request now cancels it: originMiddleware kept the caller's abort signal out of the request it sends on, so only the timeout could cancel a request.

## 1.1.2

### Patch Changes

- 57c7203: Only treat 400, 401 and 422 refresh responses as a failed refresh

## 1.1.1

### Patch Changes

- 4f6d734: Fix unauthorized handler

## 1.1.0

### Minor Changes

- aa3e772: Add in app account switcher

## 1.0.4

### Patch Changes

- 48e84aa: Update to new lint config

## 1.0.3

### Patch Changes

- 1954e67: Again (was already published)

## 1.0.2

### Patch Changes

- 9ca66e7: Add support for setting locale so that x-pm-locale header is passed
