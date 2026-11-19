import type { ProtonFetchContext } from "../interface.ts";
import { defaultTimeoutMs } from "../policy.ts";

/** When the whole request, including retries, has to be done: `timeoutMs` after the fetch call. */
export const getDeadline = (context: ProtonFetchContext) =>
    context.startedAt + (context.policy?.timeoutMs ?? defaultTimeoutMs);

// It it not possible to copy a request and just change its url. It needs to be deeply cloned
// See (https://stackoverflow.com/a/34641566)
export async function copyRequest(newUrl: URL, request: Request) {
    const body = await request.arrayBuffer();
    return new Request(newUrl, {
        method: request.method,
        headers: request.headers,
        body: body.byteLength ? body : undefined,
        signal: request.signal,
        keepalive: request.keepalive,
        referrer: request.referrer,
        referrerPolicy: request.referrerPolicy,
        mode: request.mode,
        credentials: request.credentials,
        cache: request.cache,
        redirect: request.redirect,
        integrity: request.integrity,
    });
}
