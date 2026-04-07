// we only need type information, so we avoid actually depending on Sentry
export type SentryLogger = (
    message: string,
    captureContext?: { level?: "info"; extra?: object },
) => string;
