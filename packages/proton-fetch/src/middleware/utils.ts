// It it not possible to copy a request and just change its url. It needs to be deeply cloned
// See (https://stackoverflow.com/a/34641566)
export async function copyRequest(newUrl: URL, request: Request) {
    const body = await request.arrayBuffer();
    const baseInit = {
        method: request.method,
        headers: request.headers,
        referrer: request.referrer,
        referrerPolicy: request.referrerPolicy,
        mode: request.mode,
        credentials: request.credentials,
        cache: request.cache,
        redirect: request.redirect,
        integrity: request.integrity,
    };
    const init = body.byteLength
        ? {
              ...baseInit,
              body,
          }
        : baseInit;
    return new Request(newUrl, init);
}
