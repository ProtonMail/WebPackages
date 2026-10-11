# @protontech/account

## 4.0.0

### Major Changes

- a313c3c: Bind session forks to a fork secret, and configure `AccountClient` once, sending the user to account by intent.

    Forks the app requests are bound to a fork secret kept in the tab: account only gets its SHA-256 as `forkChallenge`, and `getSession` presents the secret as `x-pm-fork-secret` when pulling the fork. A leaked selector is then not enough to pull it.

    Breaking changes:

    - `new AccountClient(...)` takes the app's `app`, `accountUrl` (where account is) and optional `redirectUrl` once, instead of every call.
    - `getSession({ url, localId, data })` replaces `authorizeParameters` and `authorizeStateData`. It resolves to `{ type: "authenticated", session, data }`, with the `data` given when the fork was requested, or to `{ type: "unauthorized", authorizeUrl }`, a `URL` on account to navigate to. `secretBoundFork` is gone: forks are always bound, or unbound if the secret can't be created.
    - `authorize(intent, data?)` requests a fork for `"switch"`, `"add-account"`, `"sign-out"` or `"reauthorize"`, and resolves to the URL to navigate to in this tab. `getAuthorizeLink(intent)` returns an unbound URL for links (`href`), which may be opened in another tab.
    - `signOut({ type: "signOut" | "unauthorized", localId, email? })` resolves to the URL to send the user to next, signing them out at account or in again, instead of `"ok" | "fail"`.
    - For apps that manage sessions themselves, `AuthorizeClient` takes the same `app`, `accountUrl` and `redirectUrl`, and has the same `authorize` and `getAuthorizeLink`, instead of the static `generateAuthorizePath`. `SessionBootstrapClient.getSession` changes like `AccountClient.getSession`. `AuthorizeClient.initialize` takes the fork secret of the callback's state: `AuthorizeState.fromKey(state).forkSecret`, which is removed with `AuthorizeState.remove(state)` once the session is saved. `./session/session-db.ts`, `./session/session-mem.ts` and `./sessions/interface.ts` are now exported too, so everything `AccountClient` is built from is.
    - What's kept in `sessionStorage` while the user is at account moved to `authorize-state-` keys, so a sign-in in progress while the app updates loses its `data`. It's removed once `getSession` no longer needs it.

## 3.0.4

### Patch Changes

- Updated dependencies [7238ac4]
    - @protontech/web-utils@0.1.0

## 3.0.3

### Patch Changes

- Updated dependencies [e592f83]
- Updated dependencies [e592f83]
- Updated dependencies [e592f83]
    - @protontech/web-utils@0.0.4

## 3.0.2

### Patch Changes

- Updated dependencies [b4c32f5]
    - @protontech/web-utils@0.0.3

## 3.0.1

### Patch Changes

- acf481c: Fix fallback in bootstrap
- Updated dependencies [4f6d734]
    - @protontech/fetch@1.1.1

## 3.0.0

### Minor Changes

- aa3e772: Add in app account switcher

### Patch Changes

- Updated dependencies [aa3e772]
    - @protontech/fetch@1.1.0
    - @protontech/web-utils@0.0.2

## 2.0.0

### Minor Changes

- 07d34bf: Move session functionality into their own exports

### Patch Changes

- 6103406: Migrate crypto package from web-clients monorepo.
  Breaking change: existing `exports` paths have been updated too.
- Updated dependencies [6103406]
- Updated dependencies [f75de3d]
- Updated dependencies [ebd250e]
    - @protontech/crypto@2.0.0
    - @protontech/fetch@1.0.4

## 1.0.8

### Patch Changes

- 48e84aa: Update to new lint config
- Updated dependencies [48e84aa]
    - @protontech/fetch@1.0.4
    - @protontech/crypto@1.0.2
