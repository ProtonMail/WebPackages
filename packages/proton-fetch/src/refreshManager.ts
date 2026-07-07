import { KeyedSingleRunner } from "./keyedSingleRunner.ts";
import { requestLock } from "./requestLock.ts";

// Ensures single (once) execution per tab.
const runner = new KeyedSingleRunner();

// Poor man's refresh handler.
// Ensures no race conditions between tabs.
export async function handleRefresh(
    httpFetch: (request: Request) => Promise<Response>,
    uid: string,
    baseUrl: string | URL,
): Promise<"ok" | "fail" | Response> {
    return requestLock(`refresh-${uid}`, async () => {
        const refreshResponse = await httpFetch(
            // Resolve against the configured base URL so the Request can be
            // constructed even where there is no document origin to resolve a
            // relative path against (e.g. a blob worker).
            new Request(new URL("/auth/refresh", baseUrl), {
                method: "post",
                headers: {
                    "x-pm-uid": uid,
                },
            }),
        );

        // Just a little delay to ensure no issue with cookies
        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });

        if (refreshResponse.status === 200) {
            return "ok";
        }
        if (refreshResponse.status >= 400 && refreshResponse.status < 500) {
            // Try to get the json to help debugging in dev tools
            await refreshResponse.json().catch(() => {});
            return "fail";
        }

        return refreshResponse;
    });
}

export async function refreshOnce(
    httpFetch: Parameters<typeof handleRefresh>[0],
    uid: Parameters<typeof handleRefresh>[1],
    baseUrl: Parameters<typeof handleRefresh>[2],
) {
    return runner.run(uid, () => handleRefresh(httpFetch, uid, baseUrl));
}

export function getRefresh(uid: string) {
    return runner.get(uid);
}
