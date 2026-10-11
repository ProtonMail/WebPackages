import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "fake-indexeddb/auto";
import type { CookieStorage } from "@protontech/web-utils/cookie-storage.ts";
import { AccountClient } from "./account-client.ts";
import { AuthorizeState } from "../session/authorize-client.ts";
import { SessionDb } from "../session/session-db.ts";
import { serializeUsers } from "../session/signout-parameters.ts";
import { generateForkSecret } from "../session/fork-secret.ts";

// The fork secret's crypto has its own tests
vi.mock("../session/fork-secret.ts", () => ({ generateForkSecret: vi.fn() }));

/** Node's global `Request` rejects the relative URLs the API is called with */
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
    vi.stubGlobal("Request", FakeRequest);
    indexedDB = new IDBFactory();
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
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const makeAccountClient = () => {
    const fetch = vi.fn<(request: Request) => Promise<Response>>(() =>
        Promise.resolve(new Response(null, { status: 200 })),
    );
    const accountClient = new AccountClient({
        fetch: fetch as unknown as typeof window.fetch,
        cookieStorage: {} as CookieStorage,
        url: new URL("https://calendar.proton.me/u/0/"),
        app: "proton-calendar",
        accountUrl: new URL("https://account.proton.me"),
        redirectUrl: new URL("https://calendar.proton.me/"),
    });
    return { accountClient, fetch };
};

const saveSession = (localId: number) =>
    new SessionDb().save({
        data: {
            localId,
            uid: `uid-${localId}`,
            persistent: true,
            trusted: true,
            userId: `user-${localId}`,
            payload: new Uint8Array([1, 2, 3]),
        },
        meta: { persistedAt: 500, usedAt: 1000 },
    });

const getUsers = (url: URL) =>
    new URLSearchParams(url.hash.slice(1)).get("sessions");

describe("AccountClient.authorize", () => {
    it("requests a fork for the app, bound to a fork secret kept with the data", async () => {
        const { accountClient } = makeAccountClient();

        const url = await accountClient.authorize(
            { type: "add-account" },
            { returnTo: "/inbox" },
        );

        expect(`${url.origin}${url.pathname}`).toBe(
            "https://account.proton.me/authorize",
        );
        expect(url.searchParams.get("app")).toBe("proton-calendar");
        expect(url.searchParams.get("redirectUrl")).toBe(
            "https://calendar.proton.me/",
        );
        expect(url.searchParams.get("t")).toBe("3");
        expect(url.searchParams.get("forkChallenge")).toBe("fork-challenge");
        expect(
            AuthorizeState.fromKey(url.searchParams.get("state") ?? ""),
        ).toEqual(new AuthorizeState({ returnTo: "/inbox" }, "fork-secret"));
    });
});

describe("AccountClient.getAuthorizeLink", () => {
    it("links to account for the app, without binding the fork", () => {
        const { accountClient } = makeAccountClient();

        const url = accountClient.getAuthorizeLink({ type: "switch" });

        expect(`${url.origin}${url.pathname}`).toBe(
            "https://account.proton.me/authorize",
        );
        expect(url.searchParams.get("app")).toBe("proton-calendar");
        expect(url.searchParams.get("t")).toBe("1");
        expect(url.searchParams.has("forkChallenge")).toBe(false);
        expect(storage.size).toBe(0);
    });
});

describe("AccountClient.signOut", () => {
    it("revokes the session and signs its user out at account", async () => {
        const { accountClient, fetch } = makeAccountClient();
        await saveSession(4);

        const url = await accountClient.signOut({
            type: "signOut",
            localId: 4,
        });

        expect(await new SessionDb().get(4)).toBeUndefined();
        const request = fetch.mock.calls[0]?.[0];
        expect(request?.method).toBe("DELETE");
        expect(request?.headers.get("x-pm-uid")).toBe("uid-4");
        expect(url.searchParams.get("reason")).toBe("signout");
        expect(url.searchParams.get("t")).toBe("1");
        expect(getUsers(url)).toBe(serializeUsers(["user-4"]));
        // Account forks the session the user picks next back to this tab
        expect(url.searchParams.get("forkChallenge")).toBe("fork-challenge");
        expect(
            AuthorizeState.fromKey(url.searchParams.get("state") ?? ""),
        ).toEqual(new AuthorizeState(null, "fork-secret"));
    });

    it("still signs out at account without the session", async () => {
        const { accountClient } = makeAccountClient();

        const url = await accountClient.signOut({
            type: "signOut",
            localId: 4,
        });

        expect(url.searchParams.get("reason")).toBe("signout");
        expect(getUsers(url)).toBeNull();
    });

    it.each([
        ["with", "user@proton.me", "3"],
        ["without", undefined, "1"],
    ])(
        "drops an unauthorized session and signs in again %s its email",
        async (_, email, forkType) => {
            const { accountClient, fetch } = makeAccountClient();
            await saveSession(4);

            const url = await accountClient.signOut({
                type: "unauthorized",
                localId: 4,
                email,
            });

            expect(await new SessionDb().get(4)).toBeUndefined();
            // The API no longer accepts it anyway
            expect(fetch).not.toHaveBeenCalled();
            expect(url.searchParams.get("reason")).toBe("expired");
            expect(url.searchParams.get("t")).toBe(forkType);
            expect(url.searchParams.get("email")).toBe(email ?? null);
            // Not resumed, it may not be the same user
            expect(url.searchParams.has("u")).toBe(false);
            expect(
                AuthorizeState.fromKey(url.searchParams.get("state") ?? ""),
            ).toEqual(new AuthorizeState(null, "fork-secret"));
        },
    );
});
