import { parseErrorBody } from "@protontech/fetch/errors.ts";
import {
    SessionPersistence,
    type SessionDto,
    SessionAuthError,
    SessionErrorCode,
    SessionError,
} from "./session-persistence.ts";
import {
    AuthorizeClient,
    AuthorizeState,
    AuthorizeParameters,
    type AuthorizeParametersOptions,
    AuthorizeUnprocessableError,
    AuthorizeError,
    AuthorizeCallbackParameters,
} from "./authorize-client.ts";

export class SessionBootstrapError extends Error {
    private constructor(message: string, cause: unknown) {
        super(message, { cause });
        this.name = "SessionBootstrapError";
    }

    static from(error: unknown): SessionBootstrapError {
        if (
            (error instanceof SessionError &&
                error.code === SessionErrorCode.Network) ||
            error instanceof AuthorizeError
        ) {
            const description = parseErrorBody(error.json).message;
            const message = `Network error (${error.status})${description ? `\n${description}` : ""}`;
            return new SessionBootstrapError(message, error);
        }

        throw error;
    }
}
export interface SessionBootstrapSuccessResult<T> {
    session: SessionDto;
    authorizeState: AuthorizeState<T> | null;
    type: "authenticated";
}

export interface SessionBootstrapErrorResult {
    type: "unauthorized";
    authorizePath: string;
}

export type SessionBootstrapResult<T> =
    | SessionBootstrapSuccessResult<T>
    | SessionBootstrapErrorResult;

export interface SessionBootstrapParameters<T> {
    url: URL;
    authorizeParameters: Omit<AuthorizeParametersOptions, "state">;
    authorizeStateData: T;
}

export class SessionBootstrapClient {
    #authorizeClient: AuthorizeClient;
    #sessionPersistence: SessionPersistence;

    constructor({
        authorizeClient,
        sessionPersistence,
    }: {
        authorizeClient: AuthorizeClient;
        sessionPersistence: SessionPersistence;
    }) {
        this.#authorizeClient = authorizeClient;
        this.#sessionPersistence = sessionPersistence;
    }

    async getSessionFromCallback<T>({
        authorizeCallbackParameters,
        authorizeParameters,
    }: {
        authorizeParameters: Omit<AuthorizeParametersOptions, "state">;
        authorizeCallbackParameters: AuthorizeCallbackParameters;
    }): Promise<SessionBootstrapResult<T>> {
        try {
            const authorizeState = AuthorizeState.fromKey<T>(
                authorizeCallbackParameters.dto.state,
            );
            const authorizeResult = await this.#authorizeClient.initialize(
                authorizeCallbackParameters,
            );
            const result =
                await this.#sessionPersistence.saveSession(authorizeResult);
            return {
                type: "authenticated",
                session: result,
                authorizeState,
            };
        } catch (error) {
            if (
                error instanceof AuthorizeUnprocessableError ||
                error instanceof SessionAuthError
            ) {
                const authorizePath = AuthorizeClient.generateAuthorizePath(
                    new AuthorizeParameters({
                        ...authorizeParameters,
                        state: authorizeCallbackParameters.dto.state,
                    }),
                );
                return {
                    type: "unauthorized",
                    authorizePath,
                };
            }
            throw SessionBootstrapError.from(error);
        }
    }

    async getSessionFromStorage<T>({
        authorizeParameters,
        authorizeStateData,
    }: {
        authorizeParameters: Omit<AuthorizeParametersOptions, "state">;
        authorizeStateData: T;
    }): Promise<SessionBootstrapResult<T>> {
        try {
            const result = await this.#sessionPersistence.getSession(
                authorizeParameters.localId,
            );
            return {
                type: "authenticated",
                session: result,
                authorizeState: null,
            };
        } catch (error: unknown) {
            if (error instanceof SessionAuthError) {
                const authorizeState = new AuthorizeState<T>(
                    authorizeStateData,
                );
                const key = authorizeState.write();
                const authorizePath = AuthorizeClient.generateAuthorizePath(
                    new AuthorizeParameters({
                        ...authorizeParameters,
                        state: key,
                        reason: (function reasonFromCode(
                            code: SessionErrorCode,
                        ) {
                            if (code === SessionErrorCode.SessionExpired) {
                                return "expired";
                            } else if (
                                code === SessionErrorCode.SessionNotFound
                            ) {
                                return "not-found";
                            } else if (code === SessionErrorCode.Decryption) {
                                return "corrupted";
                            }
                            return undefined;
                        })(error.code),
                        localId:
                            authorizeParameters.localId ??
                            error.sessionDbDto?.data.localId,
                    }),
                );
                return {
                    type: "unauthorized",
                    authorizePath,
                };
            }
            throw SessionBootstrapError.from(error);
        }
    }

    async getSession<T>({
        url,
        authorizeParameters,
        authorizeStateData,
    }: SessionBootstrapParameters<T>): Promise<SessionBootstrapResult<T>> {
        const authorizeCallbackParameters =
            this.#authorizeClient.getCallbackParameters(url);

        if (authorizeCallbackParameters) {
            return this.getSessionFromCallback({
                authorizeParameters,
                authorizeCallbackParameters,
            });
        }

        return this.getSessionFromStorage({
            authorizeParameters,
            authorizeStateData,
        });
    }
}
