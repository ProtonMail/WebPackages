import { importKey } from "@protontech/crypto/aes-gcm";
import {
    AccountAuthorizeType,
    AccountAuthorizeVersion,
    type SaveSessionParams,
} from "./interface.ts";
import {
    decryptPayload,
    type PayloadResult,
} from "./authorize-payload-crypto.ts";

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
};

export type ForkPayloadVersion = 1 | 2 | 3;

export interface AuthorizeParametersOptions {
    app: `proton-${string}`;
    state?: string;
    forkType?: keyof typeof AccountAuthorizeType;
    forkVersion?: number;
    payloadType?: "offline";
    payloadVersion?: ForkPayloadVersion;
    reason?: "sign-out" | "expired" | "not-found" | "corrupted";
    unauthenticatedReturnUrl?: string;
    redirectUrl?: string;
    localId?: number;
    email?: string;
}

export class AuthorizeParameters {
    private options: AuthorizeParametersOptions;

    constructor(options: AuthorizeParametersOptions) {
        this.options = options;
        this.options.payloadVersion = options.payloadVersion ?? 3;
    }

    serialize() {
        const searchParams = new URLSearchParams();
        const options = this.options;

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

        return searchParams.toString();
    }
}

export class AuthorizeState<T> {
    public data: T | null;
    constructor(data: T | null) {
        this.data = data;
    }

    write() {
        const key = crypto
            .getRandomValues(new Uint8Array(32))
            .toBase64({ alphabet: "base64url", omitPadding: true });
        sessionStorage.setItem(`authorize-${key}`, JSON.stringify(this.data));
        return key;
    }

    static fromKey<T>(key: string): AuthorizeState<T> {
        try {
            const data = sessionStorage.getItem(`authorize-${key}`);
            if (!data) {
                return new AuthorizeState<T>(null);
            }
            const result: T = JSON.parse(data);
            return new AuthorizeState<T>(result);
        } catch {
            return new AuthorizeState<T>(null);
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
    public dto: AuthorizeCallbackParametersDto;

    constructor(dto: AuthorizeCallbackParametersDto) {
        this.dto = dto;
    }

    static parse(searchParams: URLSearchParams) {
        try {
            const selector =
                searchParams.get(AuthorizeCallbackQueryParameters.Selector) ||
                "";
            const state =
                searchParams.get(AuthorizeCallbackQueryParameters.State) || "";
            const base64StringKey =
                searchParams.get(AuthorizeCallbackQueryParameters.Base64Key) ||
                "";
            const persistent =
                searchParams.get(AuthorizeCallbackQueryParameters.Persistent) ||
                "";
            const trusted =
                searchParams.get(AuthorizeCallbackQueryParameters.Trusted) ||
                "";
            const payloadVersion =
                searchParams.get(
                    AuthorizeCallbackQueryParameters.PayloadVersion,
                ) || "";
            const payloadType =
                searchParams.get(
                    AuthorizeCallbackQueryParameters.PayloadType,
                ) || "";

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
    public status: number;
    public json: unknown;
    constructor(status: number, json: unknown) {
        super("Something went wrong authorizing the user");
        this.name = "AuthorizeError";
        this.status = status;
        this.json = json;
    }
}

export class AuthorizeUnprocessableError extends AuthorizeError {}

export class AuthorizeClient {
    private fetch: typeof window.fetch;

    constructor({ fetch }: { fetch: typeof window.fetch }) {
        this.fetch = fetch;
    }

    public getCallbackParameters(url: URL) {
        if (url.pathname === "/login") {
            const hashParameters = new URLSearchParams(url.hash.slice(1));
            return AuthorizeCallbackParameters.parse(hashParameters);
        }
        return null;
    }

    public static generateAuthorizePath(parameters: AuthorizeParameters) {
        return `/authorize?${parameters.serialize()}`;
    }

    public async initialize(
        authorizeCallbackParameters: AuthorizeCallbackParameters,
    ): Promise<SaveSessionParams> {
        const getForkResponse = await this.fetch(
            new Request(
                `/auth/v4/sessions/forks/${authorizeCallbackParameters.dto.selector}`,
                {
                    method: "get",
                },
            ),
        );
        const getForkSelectorDto: GetForkSelectorDto = await getForkResponse
            .json()
            .catch(() => {});
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
        const postCookiesResponse = await this.fetch(
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
