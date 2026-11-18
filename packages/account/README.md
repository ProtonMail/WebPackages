# @protontech/account

Gets a signed-in Proton session for a web app. The user signs in at account (`account.proton.me`), and account forks the session back to the app.

## Get a session

```ts
import { AccountClient } from "@protontech/account/client/account-client.ts";
import { LocalIdUrl } from "@protontech/account/session/local-id.ts";
import { ProtonFetch } from "@protontech/fetch/fetch.ts";
import { headerMiddleware } from "@protontech/fetch/middleware/headerMiddleware";
import { originMiddleware } from "@protontech/fetch/middleware/originMiddleware";
import { createPriorityMiddleware } from "@protontech/fetch/middleware/priorityMiddleware";
import { createRefreshMiddleware } from "@protontech/fetch/middleware/refreshMiddleware";
import { createRetryMiddleware } from "@protontech/fetch/middleware/retryMiddleware";
import { timeoutMiddleware } from "@protontech/fetch/middleware/timeoutMiddleware";
import { CookieStorage } from "@protontech/web-utils/cookie-storage.ts";
import { getRootDomain } from "@protontech/web-utils/url.ts";

const url = new URL(window.location.href);
// Splits e.g. /u/1/inbox into localId 1 and /inbox
const localIdUrl = LocalIdUrl.fromUrl(url);

// Set once getSession returns a session
let localId: number | undefined;
let signingOut = false;

// The API no longer accepts the session: drop it and sign in again
const handleSessionExpired = async () => {
    // Before getSession returns, it handles a bad session itself. A burst of
    // 401s signs out once.
    if (localId === undefined || signingOut) {
        return;
    }
    signingOut = true;
    window.location.assign(
        await accountClient.signOut({ type: "unauthorized", localId }),
    );
};

const protonFetch = new ProtonFetch({
    config: {
        url: new URL("/api", url.origin),
        appVersion: "web-myapp@1.0.0",
        locale: "en_US",
    },
    middlewares: [
        originMiddleware,
        headerMiddleware,
        // Sends how urgent the request is, as the `priority` header
        createPriorityMiddleware(),
        // Retries 429, 503, and other 5xx for idempotent methods
        createRetryMiddleware(),
        // Refreshes expired tokens, and calls handleSessionExpired when that fails
        createRefreshMiddleware(handleSessionExpired),
        timeoutMiddleware,
    ],
});

const accountClient = new AccountClient({
    fetch: protonFetch.fetch,
    cookieStorage: new CookieStorage(),
    url,
    app: "proton-myapp",
    accountUrl: new URL(
        url.hostname === "localhost"
            ? "https://account.proton.me"
            : `https://account.${getRootDomain(url.hostname)}`,
    ),
});

const result = await accountClient.getSession({
    url: localIdUrl.url,
    localId: localIdUrl.localId,
    // Comes back with the session if the user has to go through account
    data: { href: localIdUrl.url.href },
});

if (result.type === "unauthorized") {
    // No session: account signs the user in and sends them back to /login
    window.location.assign(result.authorizeUrl);
} else {
    localId = result.session.sessionDbDto.data.localId;
    protonFetch.setUid(result.session.sessionDbDto.data.uid);

    // Leave /login, back to where the user was
    // `data` only comes back from account, so on a reload stay where the user is
    const returnUrl = new URL(result.data?.href ?? localIdUrl.url.href);
    if (returnUrl.pathname === "/login") {
        // The hash holds the fork's key
        returnUrl.pathname = "/";
        returnUrl.hash = "";
    }
    returnUrl.pathname = `/u/${localId}${returnUrl.pathname}`;
    history.replaceState(null, "", returnUrl);

    // Authenticated API calls now work
    const response = await protonFetch.fetch(new Request("/core/v4/users"));
}
```

`result.session.keyPassword` unlocks the user's keys, if the app needs them.

The app must serve:

- `/api` on its own origin, proxied to the Proton API. The session lives in cookies set on that origin.
- `/login`, where account sends the user back with the fork in the URL hash. Serve the app there too, and call `getSession` as above.

`app` must be an app account knows: account uses it to find where to send the user back. On `localhost`, the example uses production account, so `/api` must proxy to the production API. Pass `redirectUrl: new URL("/", url.origin)` too, so account sends the user back to `localhost`.

### Without `/u/<localId>` URLs

`localId` is optional. Without it, `getSession` returns the last used session, and the app keeps the local ID wherever it wants, or not at all:

```ts
const url = new URL(window.location.href);

const result = await accountClient.getSession({
    url,
    data: { href: url.href },
});

if (result.type === "unauthorized") {
    window.location.assign(result.authorizeUrl);
} else {
    localId = result.session.sessionDbDto.data.localId;
    protonFetch.setUid(result.session.sessionDbDto.data.uid);

    const returnUrl = new URL(result.data?.href ?? url.href);
    if (returnUrl.pathname === "/login") {
        returnUrl.pathname = "/";
        returnUrl.hash = "";
    }
    history.replaceState(null, "", returnUrl);
}
```

Pass `localId` again to get a specific session, e.g. one the user picked.

## Sign out

```ts
const nextUrl = await accountClient.signOut({ type: "signOut", localId });
window.location.assign(nextUrl);
```

When the API no longer accepts the session, `handleSessionExpired` above signs out with `{ type: "unauthorized", localId }` instead: the session is dropped without revoking it, and the user signs in again. Pass `email` too, if the app knows it, so account signs in as the same user.

## Switch or add an account

```ts
window.location.assign(await accountClient.authorize({ type: "switch" }));
```

`{ type: "add-account" }` signs in to another account. For an `href` that may open in a new tab, use `accountClient.getAuthorizeLink(intent)`.
