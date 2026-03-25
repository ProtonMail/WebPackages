import type { MiddlewareFn } from "../interface.ts";
import { copyRequest } from "./utils.ts";

export const originMiddleware: MiddlewareFn = (next, context) => {
    return async (request) => {
        const url = new URL(request.url);
        const newUrl = new URL(
            `${context.config.url.pathname}${url.pathname.replace("/api", "")}${url.search}`,
            context.config.url.origin,
        );
        const copiedRequest = await copyRequest(newUrl, request);
        const originRequest = new Request(copiedRequest, {
            mode: "cors",
            credentials: "include",
            redirect: "follow",
        });
        originRequest.headers.set(
            "accept",
            "application/vnd.protonmail.v1+json",
        );
        return next(originRequest);
    };
};
