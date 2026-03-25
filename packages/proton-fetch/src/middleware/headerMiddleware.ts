import type { MiddlewareFn } from "../interface.ts";
import { addProtonHeadersToRequest } from "../headers.ts";

export const headerMiddleware: MiddlewareFn = (next, context) => {
    return (request) => {
        addProtonHeadersToRequest(request, context.config);
        return next(request);
    };
};
