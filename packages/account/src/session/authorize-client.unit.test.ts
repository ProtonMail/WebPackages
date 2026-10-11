import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    AuthorizeCallbackParameters,
    AuthorizeClient,
    AuthorizeParameters,
    AuthorizeState,
    AuthorizeUnprocessableError,
    type AuthorizeIntent,
} from "./authorize-client.ts";
import { generateForkSecret } from "./fork-secret.ts";

// The fork secret's crypto has its own tests, here only where it's kept matters
vi.mock("./fork-secret.ts", () => ({ generateForkSecret: vi.fn() }));

/**
 * Node's global `Request` rejects relative URLs. AuthorizeClient builds
 * relative `Request`s and passes them straight to the injected `fetch`, so a
 * faithful shim backed by the real `Headers` is enough here.
 */
class FakeRequest {
    url: string;
    method: string;
    headers: Headers;
    constructor(input: string, init: RequestInit = {}) {
        this.url = input;
        this.method = init.method ?? "GET";
        this.headers = new Headers(init.headers ?? {});
    }
}

let storage: Map<string, string>;

beforeEach(() => {
    vi.mocked(generateForkSecret).mockReset().mockResolvedValue({
        forkSecret: "fork-secret",
        forkChallenge: "fork-challenge",
    });
    storage = new Map();
    vi.stubGlobal("sessionStorage", {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
    });
    vi.stubGlobal("Request", FakeRequest);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("AuthorizeState", () => {
    it("keeps the data and fork secret under a new key", () => {
        const key = new AuthorizeState(
            { returnTo: "/inbox" },
            "fork-secret",
        ).write();

        // 32 random bytes, base64url encoded
        expect(key).toMatch(/^[\w-]{43}$/);
        expect([...storage.keys()]).toEqual([`authorize-state-${key}`]);
        expect(AuthorizeState.fromKey(key)).toEqual(
            new AuthorizeState({ returnTo: "/inbox" }, "fork-secret"),
        );
    });

    it("keeps the data of an unbound fork", () => {
        const key = new AuthorizeState({ returnTo: "/inbox" }).write();

        expect(AuthorizeState.fromKey(key)).toEqual(
            new AuthorizeState({ returnTo: "/inbox" }, undefined),
        );
    });

    it("uses a new key for every state", () => {
        const keys = [
            new AuthorizeState(null).write(),
            new AuthorizeState(null).write(),
        ];

        expect(keys[0]).not.toBe(keys[1]);
        expect(storage.size).toBe(2);
    });

    it("keeps the state until it's removed", () => {
        const key = new AuthorizeState(null, "fork-secret").write();
        const otherKey = new AuthorizeState(null, "other-fork-secret").write();

        AuthorizeState.fromKey(key);
        expect(storage.size).toBe(2);

        AuthorizeState.remove(key);
        expect([...storage.keys()]).toEqual([`authorize-state-${otherKey}`]);
        expect(AuthorizeState.fromKey(key)).toEqual(new AuthorizeState(null));
    });

    it("ignores states kept before fork secrets", () => {
        // The bare data, from a sign-in in progress when the app was updated
        storage.set("authorize-old-key", JSON.stringify({ data: "/inbox" }));

        expect(AuthorizeState.fromKey("old-key")).toEqual(
            new AuthorizeState(null),
        );
    });

    it("restores nothing from a corrupted state", () => {
        storage.set("authorize-state-state-key", "{");

        expect(AuthorizeState.fromKey("state-key")).toEqual(
            new AuthorizeState(null),
        );
    });

    it("restores nothing without sessionStorage", () => {
        vi.stubGlobal("sessionStorage", undefined);

        expect(AuthorizeState.fromKey("state-key")).toEqual(
            new AuthorizeState(null),
        );
        expect(() => AuthorizeState.remove("state-key")).not.toThrow();
    });
});

describe("AuthorizeParameters", () => {
    it("sends the fork challenge to account", () => {
        const searchParams = new URLSearchParams(
            new AuthorizeParameters({
                app: "proton-calendar",
                forkChallenge: "fork-challenge",
            }).serialize(),
        );

        expect(searchParams.get("forkChallenge")).toBe("fork-challenge");
    });

    it("leaves the fork challenge out by default", () => {
        const searchParams = new URLSearchParams(
            new AuthorizeParameters({ app: "proton-calendar" }).serialize(),
        );

        expect(searchParams.has("forkChallenge")).toBe(false);
    });
});

const makeAuthorizeClient = (
    fetch: typeof window.fetch = () => Promise.reject(new Error("no fetch")),
) =>
    new AuthorizeClient({
        fetch,
        app: "proton-calendar",
        accountUrl: new URL("https://account.proton.me"),
        redirectUrl: new URL("https://calendar.proton.me/"),
    });

describe("AuthorizeClient.authorize", () => {
    it("requests the fork at account, bound to a fork secret kept with the data", async () => {
        const url = await makeAuthorizeClient().authorize(
            { type: "switch" },
            { returnTo: "/inbox" },
        );

        expect(url.origin).toBe("https://account.proton.me");
        expect(url.pathname).toBe("/authorize");
        expect(url.searchParams.get("app")).toBe("proton-calendar");
        expect(url.searchParams.get("redirectUrl")).toBe(
            "https://calendar.proton.me/",
        );
        expect(url.searchParams.get("forkChallenge")).toBe("fork-challenge");
        const state = url.searchParams.get("state");
        expect(state).toMatch(/^[\w-]{43}$/);
        expect(AuthorizeState.fromKey(state ?? "")).toEqual(
            new AuthorizeState({ returnTo: "/inbox" }, "fork-secret"),
        );
    });

    it("uses a new state for every fork", async () => {
        const authorizeClient = makeAuthorizeClient();
        const states = [
            (
                await authorizeClient.authorize({ type: "switch" })
            ).searchParams.get("state"),
            (
                await authorizeClient.authorize({ type: "switch" })
            ).searchParams.get("state"),
        ];

        expect(states[1]).not.toBe(states[0]);
        expect([...storage.keys()]).toEqual([
            `authorize-state-${states[0]}`,
            `authorize-state-${states[1]}`,
        ]);
        expect(AuthorizeState.fromKey(states[0] ?? "")).toEqual(
            new AuthorizeState(null, "fork-secret"),
        );
    });

    it("leaves the fork unbound when the fork secret can't be created", async () => {
        vi.mocked(generateForkSecret).mockRejectedValue(
            new Error("NotSupportedError"),
        );

        const url = await makeAuthorizeClient().authorize(
            { type: "switch" },
            { returnTo: "/inbox" },
        );

        expect(url.searchParams.has("forkChallenge")).toBe(false);
        expect(
            AuthorizeState.fromKey(url.searchParams.get("state") ?? ""),
        ).toEqual(new AuthorizeState({ returnTo: "/inbox" }, undefined));
    });

    it("leaves the fork unbound when nothing can be kept in this tab", async () => {
        vi.stubGlobal("sessionStorage", {
            setItem: () => {
                throw new Error("QuotaExceededError");
            },
        });

        const url = await makeAuthorizeClient().authorize(
            { type: "sign-out", userIds: ["user-id"] },
            { returnTo: "/inbox" },
        );

        expect(url.searchParams.get("reason")).toBe("signout");
        expect(url.searchParams.has("state")).toBe(false);
        expect(url.searchParams.has("forkChallenge")).toBe(false);
    });

    it("resumes the session at account", async () => {
        const url = await makeAuthorizeClient().authorize({
            type: "resume",
            localId: 3,
            reason: "not-found",
        });

        expect(url.searchParams.get("u")).toBe("3");
        expect(url.searchParams.get("reason")).toBe("not-found");
        expect(url.searchParams.has("t")).toBe(false);
    });
});

describe("AuthorizeClient.getAuthorizeLink", () => {
    it("links to account without binding the fork nor keeping anything", () => {
        const url = makeAuthorizeClient().getAuthorizeLink({ type: "switch" });

        expect(url.origin).toBe("https://account.proton.me");
        expect(url.pathname).toBe("/authorize");
        expect(url.searchParams.get("app")).toBe("proton-calendar");
        expect(url.searchParams.has("state")).toBe(false);
        expect(url.searchParams.has("forkChallenge")).toBe(false);
        expect(generateForkSecret).not.toHaveBeenCalled();
        expect(storage.size).toBe(0);
    });

    it.each<[AuthorizeIntent, Record<string, string>]>([
        [{ type: "switch" }, { t: "1" }],
        [{ type: "add-account" }, { t: "3" }],
        [
            { type: "sign-out", userIds: ["user-id"] },
            { t: "1", reason: "signout" },
        ],
        [
            { type: "reauthorize", email: "user@proton.me" },
            { t: "3", reason: "expired", email: "user@proton.me" },
        ],
        // It may not be the same user
        [{ type: "reauthorize" }, { t: "1", reason: "expired" }],
    ])("requests %o from account as %o", (intent, parameters) => {
        const { searchParams } = makeAuthorizeClient().getAuthorizeLink(intent);

        for (const name of ["t", "reason", "email", "u"]) {
            expect(searchParams.get(name)).toBe(parameters[name] ?? null);
        }
    });

    it("signs the users out at account", () => {
        const url = makeAuthorizeClient().getAuthorizeLink({
            type: "sign-out",
            userIds: ["user-id"],
        });

        expect(new URLSearchParams(url.hash.slice(1)).has("sessions")).toBe(
            true,
        );
    });
});

describe("AuthorizeClient.initialize", () => {
    const pullFork = async (forkSecret: string | undefined) => {
        const fetch = vi.fn<(request: Request) => Promise<Response>>(() =>
            Promise.resolve(new Response(null, { status: 422 })),
        );
        const authorizeClient = makeAuthorizeClient(
            fetch as unknown as typeof window.fetch,
        );
        const authorizeCallbackParameters = new AuthorizeCallbackParameters({
            state: "state-key",
            selector: "selector",
            key: new Uint8Array(32),
            persistent: false,
            trusted: false,
            payloadVersion: 3,
            payloadType: "default",
        });

        await expect(
            authorizeClient.initialize(authorizeCallbackParameters, forkSecret),
        ).rejects.toBeInstanceOf(AuthorizeUnprocessableError);

        expect(fetch).toHaveBeenCalledTimes(1);
        const request = fetch.mock.calls[0]?.[0];
        expect(request?.url).toBe("/auth/v4/sessions/forks/selector");
        return request;
    };

    it("proves the fork with the fork secret", async () => {
        const request = await pullFork("fork-secret");

        expect(request?.headers.get("x-pm-fork-secret")).toBe("fork-secret");
    });

    it("pulls the fork without a fork secret when it has none", async () => {
        const request = await pullFork(undefined);

        expect(request?.headers.has("x-pm-fork-secret")).toBe(false);
    });
});
