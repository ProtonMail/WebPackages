import { importKey } from "@protontech/crypto/subtle/aesGcm.ts";
import {
    AccountAuthorizeType,
    AccountAuthorizeVersion,
    type SaveSessionParams,
} from "./interface.ts";
import {
    decryptPayload,
    type PayloadResult,
} from "./authorize-payload-crypto.ts";
import { serializeUsers } from "./signout-parameters.ts";
import { generateForkSecret } from "./fork-secret.ts";

export const AccountAuthorizeQueryParameters = {
    App: "app",
    State: "state",
    Base64Key: "sk",
    Version: "v",
    LocalID: "u",
    ForkType: "t",
    Persistent: "p",
    Trusted: "tr",
    Prompt: "prompt",
    Independent: "independent",
    PayloadType: "pt",
    Source: "source",
    Selector: "selector",
    PayloadVersion: "pv",
    PromptType: "promptType",
    PromptBypass: "promptBypass",
    Plan: "plan",
    PartnerId: "partnerId",
    UnauthenticatedReturnUrl: "uru",
    RedirectUrl: "redirectUrl",
    Email: "email",
    ForkChallenge: "forkChallenge",
};

export type ForkPayloadVersion = 1 | 2 | 3;

export interface AuthorizeParametersOptions {
    app: `proton-${string}`;
    state?: string;
    forkType?: keyof typeof AccountAuthorizeType;
    forkVersion?: number;
    payloadType?: "offline";
    payloadVersion?: ForkPayloadVersion;
    reason?: "signout" | "expired" | "not-found" | "corrupted";
    unauthenticatedReturnUrl?: string;
    redirectUrl?: string;
    localId?: number;
    email?: string;
    users?: string[];
    /** Binds the fork to a fork secret, see {@link AuthorizeClient.authorize} */
    forkChallenge?: string;
}

/** Why the app sends the user to account, which forks a session back to it */
export type AuthorizeIntent =
    /** Lets the user pick an account, or sign in to another one */
    | { type: "switch" }
    /** Signs in to another account */
    | { type: "add-account" }
    /** Signs `userIds` out at account, then lets the user pick an account */
    | { type: "sign-out"; userIds: string[] }
    /**
     * The session is gone: signs in again, as `email` if known, otherwise
     * letting the user pick, since it may not be the same user
     */
    | { type: "reauthorize"; email?: string };

/**
 * `getSession`'s own: resumes the session `localId` at account if it's still
 * there, otherwise lets account decide
 */
export interface ResumeIntent {
    type: "resume";
    localId?: number;
    reason?: "expired" | "not-found" | "corrupted";
}

type IntentParameters = Omit<
    AuthorizeParametersOptions,
    "app" | "redirectUrl" | "state" | "forkChallenge"
>;

const getIntentParameters = (
    intent: AuthorizeIntent | ResumeIntent,
): IntentParameters => {
    switch (intent.type) {
        case "switch":
            return { forkType: "switch" };
        case "add-account":
            return { forkType: "login" };
        case "sign-out":
            return {
                forkType: "switch",
                reason: "signout",
                users: intent.userIds,
            };
        case "reauthorize":
            return {
                forkType: intent.email === undefined ? "switch" : "login",
                reason: "expired",
                email: intent.email,
            };
        case "resume":
            return { localId: intent.localId, reason: intent.reason };
    }
};

export class AuthorizeParameters {
    #options: AuthorizeParametersOptions;

    constructor(options: AuthorizeParametersOptions) {
        this.#options = options;
        this.#options.payloadVersion = options.payloadVersion ?? 3;
    }

    serialize() {
        const searchParams = new URLSearchParams();
        const options = this.#options;

        searchParams.append(AccountAuthorizeQueryParameters.App, options.app);

        if (options.state !== undefined) {
            searchParams.append(
                AccountAuthorizeQueryParameters.State,
                options.state,
            );
        }
        searchParams.append(
            AccountAuthorizeQueryParameters.Version,
            `${AccountAuthorizeVersion}`,
        );

        if (options.localId !== undefined) {
            searchParams.append(
                AccountAuthorizeQueryParameters.LocalID,
                `${options.localId}`,
            );
        }

        const forkType = (() => {
            if (options.forkType !== undefined) {
                return AccountAuthorizeType[options.forkType];
            }
        })();
        if (forkType !== undefined) {
            searchParams.append(
                AccountAuthorizeQueryParameters.ForkType,
                forkType,
            );
        }
        if (options.payloadType !== undefined) {
            searchParams.append(
                AccountAuthorizeQueryParameters.PayloadType,
                options.payloadType,
            );
        }
        if (options.payloadVersion !== undefined) {
            searchParams.append(
                AccountAuthorizeQueryParameters.PayloadVersion,
                `${options.payloadVersion}`,
            );
        }
        if (options.reason !== undefined) {
            searchParams.append("reason", options.reason);
        }
        if (options?.unauthenticatedReturnUrl) {
            searchParams.append(
                AccountAuthorizeQueryParameters.UnauthenticatedReturnUrl,
                options.unauthenticatedReturnUrl,
            );
        }
        if (options?.redirectUrl) {
            searchParams.append(
                AccountAuthorizeQueryParameters.RedirectUrl,
                options.redirectUrl,
            );
        }
        if (options.email !== undefined) {
            searchParams.append("email", options.email);
        }
        if (options.forkChallenge !== undefined) {
            searchParams.append(
                AccountAuthorizeQueryParameters.ForkChallenge,
                options.forkChallenge,
            );
        }
        const hashParams = new URLSearchParams();
        if (options.users !== undefined && options.users.length > 0) {
            hashParams.append("sessions", serializeUsers(options.users));
        }

        return `?${searchParams.toString()}${hashParams.size > 0 ? `#${hashParams.toString()}` : ""}`;
    }
}

const generateStateKey = () =>
    crypto
        .getRandomValues(new Uint8Array(32))
        .toBase64({ alphabet: "base64url", omitPadding: true });

// Not `authorize-`, which held the bare data: those entries, from a sign-in
// that was in progress when the app was updated, are ignored instead of
// misread.
const getAuthorizeStateKey = (key: string) => `authorize-state-${key}`;

interface AuthorizeStateDto<T> {
    data: T | null;
    forkSecret?: string;
}

/**
 * What this tab keeps for a fork it requested, under the fork's state: the
 * app's data, and the fork secret if the fork is bound to one. Every fork
 * request writes a new one.
 *
 * It stays until the session is set up ({@link AuthorizeState.remove}), so
 * that after a transient error the fork can still be pulled on reload.
 */
export class AuthorizeState<T> {
    data: T | null;
    /**
     * Proves this tab requested the fork, see
     * {@link AuthorizeClient.authorize}. Pass it to
     * {@link AuthorizeClient.initialize}.
     */
    forkSecret: string | undefined;

    constructor(data: T | null, forkSecret?: string) {
        this.data = data;
        this.forkSecret = forkSecret;
    }

    /** Keeps this state in this tab, and returns its key: the fork's state. */
    write() {
        const key = generateStateKey();
        const dto: AuthorizeStateDto<T> = {
            data: this.data,
            forkSecret: this.forkSecret,
        };
        // The fork secret is stored in plain text on purpose, unlike
        // secure-session-storage.ts: sessionStorage may be written to disk for
        // session restore, but the secret is single-use and worthless once the
        // fork is pulled or has expired (10 minutes). The selector and payload
        // key it protects are in the callback URL, and so in the history,
        // anyway. States of forks that never come back to /login stay until
        // the tab is closed.
        sessionStorage.setItem(getAuthorizeStateKey(key), JSON.stringify(dto));
        return key;
    }

    static fromKey<T>(key: string): AuthorizeState<T> {
        try {
            const json = sessionStorage.getItem(getAuthorizeStateKey(key));
            if (!json) {
                return new AuthorizeState<T>(null);
            }
            const dto = JSON.parse(json) as Partial<
                AuthorizeStateDto<T>
            > | null;
            return new AuthorizeState<T>(
                dto?.data ?? null,
                typeof dto?.forkSecret === "string"
                    ? dto.forkSecret
                    : undefined,
            );
        } catch {
            return new AuthorizeState<T>(null);
        }
    }

    /** Forgets the state kept under `key`, once it's no longer needed. */
    static remove(key: string) {
        try {
            sessionStorage.removeItem(getAuthorizeStateKey(key));
        } catch {
            // Nothing to forget without sessionStorage
        }
    }
}

export const AuthorizeCallbackQueryParameters = {
    State: "state",
    Base64Key: "sk",
    ForkType: "t",
    Persistent: "p",
    Trusted: "tr",
    PayloadType: "pt",
    Selector: "selector",
    PayloadVersion: "pv",
};

interface AuthorizeCallbackParametersDto {
    state: string;
    selector: string;
    key: Uint8Array<ArrayBuffer>;
    persistent: boolean;
    trusted: boolean;
    payloadVersion: 1 | 2 | 3;
    payloadType: "offline" | "default";
}

export class AuthorizeCallbackParameters {
    dto: AuthorizeCallbackParametersDto;

    constructor(dto: AuthorizeCallbackParametersDto) {
        this.dto = dto;
    }

    static parse(searchParams: URLSearchParams) {
        try {
            const selector =
                searchParams.get(AuthorizeCallbackQueryParameters.Selector) ??
                "";
            const state =
                searchParams.get(AuthorizeCallbackQueryParameters.State) ?? "";
            const base64StringKey =
                searchParams.get(AuthorizeCallbackQueryParameters.Base64Key) ??
                "";
            const persistent =
                searchParams.get(AuthorizeCallbackQueryParameters.Persistent) ??
                "";
            const trusted =
                searchParams.get(AuthorizeCallbackQueryParameters.Trusted) ??
                "";
            const payloadVersion =
                searchParams.get(
                    AuthorizeCallbackQueryParameters.PayloadVersion,
                ) ?? "";
            const payloadType =
                searchParams.get(
                    AuthorizeCallbackQueryParameters.PayloadType,
                ) ?? "";

            const key = base64StringKey.length
                ? Uint8Array.fromBase64(base64StringKey, {
                      alphabet: "base64url",
                  })
                : undefined;

            if (!selector || !key) {
                return null;
            }

            return new AuthorizeCallbackParameters({
                state,
                selector,
                key,
                persistent: persistent === "1",
                trusted: trusted === "1",
                payloadVersion: payloadVersion === "3" ? 3 : 1,
                payloadType:
                    payloadType === "offline" ? payloadType : "default",
            });
        } catch {
            return null;
        }
    }
}

interface GetForkSelectorDto {
    Payload: string;
    LocalID: number;
    UID: string;
    AccessToken: string;
    RefreshToken: string;
    ExpiresIn: number;
    TokenType: string;
    UserID: string;
    Scopes: string[];
}

interface PostCookiesDto {
    UID: string;
    RefreshToken: string;
    State: string;
    RedirectURI?: string;
    Persistent: number;
    ResponseType: string;
    GrantType: string;
}

export class AuthorizeError extends Error {
    status: number;
    json: unknown;

    constructor(status: number, json: unknown) {
        super("Something went wrong authorizing the user");
        this.name = "AuthorizeError";
        this.status = status;
        this.json = json;
    }
}

export class AuthorizeUnprocessableError extends AuthorizeError {}

export interface AuthorizeClientOptions {
    fetch: typeof window.fetch;
    /** The app account forks sessions to */
    app: `proton-${string}`;
    /** Where account is, e.g. `https://account.proton.me` */
    accountUrl: URL;
    /** Where account sends the user back with the fork, if not the default */
    redirectUrl?: URL;
}

export class AuthorizeClient {
    #fetch: typeof window.fetch;
    #app: `proton-${string}`;
    #accountUrl: URL;
    #redirectUrl: URL | undefined;

    constructor({
        fetch,
        app,
        accountUrl,
        redirectUrl,
    }: AuthorizeClientOptions) {
        this.#fetch = fetch;
        this.#app = app;
        this.#accountUrl = accountUrl;
        this.#redirectUrl = redirectUrl;
    }

    getCallbackParameters(url: URL) {
        if (url.pathname === "/login") {
            const hashParameters = new URLSearchParams(url.hash.slice(1));
            return AuthorizeCallbackParameters.parse(hashParameters);
        }
        return null;
    }

    #getAuthorizeUrl(
        parameters: IntentParameters &
            Pick<AuthorizeParametersOptions, "state" | "forkChallenge">,
    ) {
        const authorizeParameters = new AuthorizeParameters({
            ...parameters,
            app: this.#app,
            redirectUrl: this.#redirectUrl?.toString(),
        });
        return new URL(
            `/authorize${authorizeParameters.serialize()}`,
            this.#accountUrl,
        );
    }

    /**
     * Requests a fork for this tab to pull: navigate to the URL in this tab.
     *
     * The fork is bound to a new fork secret: account only gets its SHA-256,
     * and the secret is kept in this tab with `data`, in a new
     * {@link AuthorizeState} whose key is the fork's state. `getSession`
     * presents the secret when it pulls the fork, and returns `data`.
     *
     * If the secret can't be created, the fork is left unbound rather than
     * failing the sign-in. If nothing can be kept in this tab, the same goes
     * for `data`.
     */
    async authorize<T>(
        intent: AuthorizeIntent | ResumeIntent,
        data: T | null = null,
    ): Promise<URL> {
        const fork = await generateForkSecret().catch(() => undefined);
        let state: string;
        try {
            state = new AuthorizeState(data, fork?.forkSecret).write();
        } catch {
            return this.#getAuthorizeUrl(getIntentParameters(intent));
        }
        return this.#getAuthorizeUrl({
            ...getIntentParameters(intent),
            state,
            forkChallenge: fork?.forkChallenge,
        });
    }

    /**
     * Like {@link AuthorizeClient.authorize}, for links that may be opened in
     * another tab, which wouldn't have the fork secret: the fork isn't bound,
     * and nothing is kept in this tab.
     */
    getAuthorizeLink(intent: AuthorizeIntent): URL {
        return this.#getAuthorizeUrl(getIntentParameters(intent));
    }

    /**
     * Pulls the fork and sets up its session. `forkSecret` proves this client
     * requested the fork, when it's bound to one (see
     * {@link AuthorizeClient.authorize}): pass {@link AuthorizeState.forkSecret}
     * of the callback's state, and {@link AuthorizeState.remove} it once the
     * session is saved.
     */
    async initialize(
        authorizeCallbackParameters: AuthorizeCallbackParameters,
        forkSecret?: string,
    ): Promise<SaveSessionParams> {
        const getForkResponse = await this.#fetch(
            new Request(
                `/auth/v4/sessions/forks/${authorizeCallbackParameters.dto.selector}`,
                {
                    method: "get",
                    headers: forkSecret
                        ? { "x-pm-fork-secret": forkSecret }
                        : undefined,
                },
            ),
        );
        const getForkSelectorDto = (await getForkResponse
            .json()
            .catch(() => {})) as GetForkSelectorDto | undefined;
        if (
            getForkResponse.status !== 200 ||
            typeof getForkSelectorDto?.UID !== "string"
        ) {
            if (getForkResponse.status >= 400 && getForkResponse.status < 500) {
                throw new AuthorizeUnprocessableError(
                    getForkResponse.status,
                    getForkSelectorDto,
                );
            }
            throw new AuthorizeError(
                getForkResponse.status,
                getForkSelectorDto,
            );
        }

        let payloadResult: PayloadResult;
        try {
            payloadResult = await decryptPayload(
                await importKey(authorizeCallbackParameters.dto.key),
                getForkSelectorDto.Payload,
                authorizeCallbackParameters.dto.payloadVersion,
            );
        } catch {
            throw new AuthorizeUnprocessableError(
                getForkResponse.status,
                getForkSelectorDto,
            );
        }

        const cookiesData: PostCookiesDto = {
            UID: getForkSelectorDto.UID,
            RefreshToken: getForkSelectorDto.RefreshToken,
            Persistent: Number(authorizeCallbackParameters.dto.persistent),
            State: "test", // Needed?
            RedirectURI: "https://protonmail.com",
            ResponseType: "token",
            GrantType: "refresh_token",
        };
        const postCookiesResponse = await this.#fetch(
            new Request(`/core/v4/auth/cookies`, {
                method: "POST",
                body: JSON.stringify(cookiesData),
                headers: {
                    "x-pm-uid": getForkSelectorDto.UID,
                    Authorization: `Bearer ${getForkSelectorDto.AccessToken}`,
                    "content-type": "application/json",
                },
            }),
        );
        if (postCookiesResponse.status !== 200) {
            if (
                postCookiesResponse.status >= 400 &&
                postCookiesResponse.status < 500
            ) {
                throw new AuthorizeUnprocessableError(
                    postCookiesResponse.status,
                    {},
                );
            }
            throw new AuthorizeError(postCookiesResponse.status, {});
        }

        return {
            localId: getForkSelectorDto.LocalID,
            userId: getForkSelectorDto.UserID,
            uid: getForkSelectorDto.UID,
            persistent: authorizeCallbackParameters.dto.persistent,
            trusted: authorizeCallbackParameters.dto.trusted,
            keyPassword: payloadResult.keyPassword,
        };
    }
}
