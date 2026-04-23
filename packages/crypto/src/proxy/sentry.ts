// we only need type information, so we avoid actually depending on Sentry
export type SentryLogger = (
    message: string,
    captureContext?: { level?: "info"; extra?: Record<string, unknown> },
) => unknown; // the official SentryLogger returns a string, but our web-client helper returns void
