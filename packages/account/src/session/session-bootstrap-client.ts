import { parseErrorBody } from "@protontech/fetch/errors.ts";
import {
    type SessionPersistence,
    type SessionDto,
    SessionAuthError,
    SessionErrorCode,
    SessionError,
} from "./session-persistence.ts";
import {
    type AuthorizeCallbackParameters,
    type AuthorizeClient,
    AuthorizeState,
    AuthorizeUnprocessableError,
    AuthorizeError,
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
    type: "authenticated";
    session: SessionDto;
    /**
     * What `getSession` was given when it requested the fork, if this session
     * comes from one
     */
    data: T | null;
}

export interface SessionBootstrapErrorResult {
    type: "unauthorized";
    /** Where to send the user to get a session: navigate to it in this tab */
    authorizeUrl: URL;
}

export type SessionBootstrapResult<T> =
    SessionBootstrapSuccessResult<T> | SessionBootstrapErrorResult;

export interface SessionBootstrapParameters<T> {
    url: URL;
    /** The session to get, e.g. from the URL. The last used one otherwise. */
    localId?: number;
    /**
     * Kept in this tab if the user has to go through account, and returned
     * with the session once back
     */
    data: T;
}

const getResumeReason = (code: SessionErrorCode) => {
    if (code === SessionErrorCode.SessionExpired) {
        return "expired";
    } else if (code === SessionErrorCode.SessionNotFound) {
        return "not-found";
    } else if (code === SessionErrorCode.Decryption) {
        return "corrupted";
    }
    return undefined;
};

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
        localId,
    }: {
        authorizeCallbackParameters: AuthorizeCallbackParameters;
        localId?: number;
    }): Promise<SessionBootstrapResult<T>> {
        const { state } = authorizeCallbackParameters.dto;
        const authorizeState = AuthorizeState.fromKey<T>(state);
        try {
            const authorizeResult = await this.#authorizeClient.initialize(
                authorizeCallbackParameters,
                authorizeState.forkSecret,
            );
            const session =
                await this.#sessionPersistence.saveSession(authorizeResult);
            // Kept until now: after a transient error the fork can still be
            // pulled on reload, with the fork secret
            AuthorizeState.remove(state);
            return {
                type: "authenticated",
                session,
                data: authorizeState.data,
            };
        } catch (error) {
            if (
                error instanceof AuthorizeUnprocessableError ||
                error instanceof SessionAuthError
            ) {
                // The new fork gets its own state, carrying the data over
                const authorizeUrl = await this.#authorizeClient.authorize(
                    { type: "resume", localId },
                    authorizeState.data,
                );
                AuthorizeState.remove(state);
                return { type: "unauthorized", authorizeUrl };
            }
            throw SessionBootstrapError.from(error);
        }
    }

    async getSessionFromStorage<T>({
        localId,
        data,
    }: {
        localId?: number;
        data: T;
    }): Promise<SessionBootstrapResult<T>> {
        try {
            const session = await this.#sessionPersistence.getSession(localId);
            return { type: "authenticated", session, data: null };
        } catch (error: unknown) {
            if (error instanceof SessionAuthError) {
                const authorizeUrl = await this.#authorizeClient.authorize(
                    {
                        type: "resume",
                        localId: localId ?? error.sessionDbDto?.data.localId,
                        reason: getResumeReason(error.code),
                    },
                    data,
                );
                return { type: "unauthorized", authorizeUrl };
            }
            throw SessionBootstrapError.from(error);
        }
    }

    async getSession<T>({
        url,
        localId,
        data,
    }: SessionBootstrapParameters<T>): Promise<SessionBootstrapResult<T>> {
        const authorizeCallbackParameters =
            this.#authorizeClient.getCallbackParameters(url);

        if (authorizeCallbackParameters) {
            return this.getSessionFromCallback({
                authorizeCallbackParameters,
                localId,
            });
        }

        return this.getSessionFromStorage({ localId, data });
    }
}
