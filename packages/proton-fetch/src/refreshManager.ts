import { KeyedSingleRunner } from "./keyedSingleRunner.ts";
import { requestLock } from "./requestLock.ts";

// Ensures single (once) execution per tab.
const runner = new KeyedSingleRunner();

// Poor man's refresh handler.
// Ensures no race conditions between tabs.
export async function handleRefresh(
    httpFetch: (request: Request) => Promise<Response>,
    uid: string,
): Promise<"ok" | "fail" | Response> {
    return requestLock(`refresh-${uid}`, async () => {
        const refreshResponse = await httpFetch(
            new Request(`/auth/refresh`, {
                method: "post",
                headers: {
                    "x-pm-uid": uid,
                },
            }),
        );

        if (refreshResponse.status === 200) return "ok";
        if (refreshResponse.status >= 400 && refreshResponse.status < 500)
            return "fail";

        return refreshResponse;
    });
}

export async function refreshOnce(
    httpFetch: Parameters<typeof handleRefresh>[0],
    uid: Parameters<typeof handleRefresh>[1],
) {
    return runner.run(uid, () => handleRefresh(httpFetch, uid));
}

export function getRefresh(uid: string) {
    return runner.get(uid);
}
