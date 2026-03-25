import type {
    FetchLike,
    MiddlewareFn,
    ProtonConfig,
    ProtonFetchContext,
} from "./interface.ts";
import { httpFetch } from "./httpFetch.ts";
import { refreshMiddleware } from "./middleware/refreshMiddleware.ts";
import { timeoutMiddleware } from "./middleware/timeoutMiddleware.ts";
import { originMiddleware } from "./middleware/originMiddleware.ts";
import { headerMiddleware } from "./middleware/headerMiddleware.ts";

function middlewareHelper(middlewares: MiddlewareFn[]) {
    return (
        fetchFunction: FetchLike,
        context: ProtonFetchContext,
    ): FetchLike => {
        return middlewares.reduceRight(
            (acc, cur) => cur(acc, context),
            fetchFunction,
        );
    };
}

function fetchMiddlewareHelper(fetchFn: FetchLike) {
    return (context: ProtonFetchContext) => {
        return middlewareHelper(context.middlewares)(fetchFn, context);
    };
}

export class ProtonFetch {
    public config: ProtonConfig;
    private fetchFn: typeof window.fetch;
    private middlewares: MiddlewareFn[];

    constructor({
        fetchFn = httpFetch,
        config,
        middlewares = [
            originMiddleware,
            headerMiddleware,
            refreshMiddleware,
            timeoutMiddleware,
        ],
    }: {
        fetchFn?: typeof window.fetch;
        config: ProtonConfig;
        middlewares?: MiddlewareFn[];
    }) {
        this.config = config;
        this.fetchFn = fetchFn;
        this.middlewares = middlewares;
    }

    public fetch: typeof window.fetch = async (input, init) => {
        const createFetch = fetchMiddlewareHelper(this.fetchFn);
        const context: ProtonFetchContext = {
            createFetch,
            startedAt: Date.now(),
            config: this.config,
            middlewares: this.middlewares,
        };
        return createFetch(context)(new Request(input, init));
    };

    public setUid(uid: string) {
        this.config.uid = uid;
    }

    public setAppVersion(appVersion: string) {
        this.config.appVersion = appVersion;
    }
}
