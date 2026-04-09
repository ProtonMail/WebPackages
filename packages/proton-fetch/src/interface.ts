export interface ProtonConfig {
    url: URL;
    appVersion: string;
    locale: string;
    uid?: string;
}

export interface ProtonFetchContext {
    config: ProtonConfig;
    createFetch: (context: ProtonFetchContext) => FetchLike;
    startedAt: number;
    middlewares: MiddlewareFn[];
    // eslint-disable-next-line
    [key: string]: any;
}

export type FetchResponse = ReturnType<typeof fetch>;
export type FetchLike = (request: Request) => FetchResponse;
export type MiddlewareFn = (
    next: FetchLike,
    context: ProtonFetchContext,
) => FetchLike;

export interface Options {
    middlewares?: MiddlewareFn[];
    fetchFn?: FetchLike;
}
