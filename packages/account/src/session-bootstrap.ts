import { parseErrorBody } from "@protontech/fetch/errors";
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
    AuthorizeUnprocessableError,
    AuthorizeError,
} from "./authorize-client.ts";

export class SessionBootstrapError extends Error {
    public originalError: unknown;

    public title: string;
    public description: string;

    constructor(error: unknown) {
        super("Something went wrong bootstrapping the session");
        this.name = "SessionBootstrap";
        this.originalError = error;

        if (
            (error instanceof SessionError &&
                error.code === SessionErrorCode.Network) ||
            error instanceof AuthorizeError
        ) {
            this.title = `Network error (${error.status})`;
            this.description = parseErrorBody(error.json).message;
        } else {
            this.title = `Something went wrong`;
            this.description = ``;
        }
    }
}
export class SessionBootstrapAuthError extends SessionBootstrapError {
    public authorizePath: string;

    constructor(error: unknown, authorizePath: string) {
        super(error);
        this.authorizePath = authorizePath;
    }
}

export interface SessionBootstrapResult<T> {
    session: SessionDto;
    authorizeState: AuthorizeState<T> | null;
}

export async function sessionBootstrap<T>(parameters: {
    fetch: typeof window.fetch;
    url: URL;
    authorizeParameters: Omit<AuthorizeParameters["options"], "state">;
    authorizeStateData: T;
}): Promise<SessionBootstrapResult<T>> {
    const sessionPersistence = new SessionPersistence({
        fetch: parameters.fetch,
    });
    const authorizeClient = new AuthorizeClient({ fetch: parameters.fetch });

    const authorizeCallbackParameters = authorizeClient.getCallbackParameters(
        parameters.url,
    );
    if (authorizeCallbackParameters) {
        const authorizeState = AuthorizeState.fromKey<T>(
            authorizeCallbackParameters.dto.state,
        );
        try {
            const authorizeResult = await authorizeClient.initialize(
                authorizeCallbackParameters,
            );
            const result =
                await sessionPersistence.saveSession(authorizeResult);
            return {
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
                        ...parameters.authorizeParameters,
                        state: authorizeCallbackParameters.dto.state,
                    }),
                );
                throw new SessionBootstrapAuthError(error, authorizePath);
            }
            throw new SessionBootstrapError(error);
        }
    }

    try {
        const result = await sessionPersistence.getSession(
            parameters.authorizeParameters.localId,
        );
        return { session: result, authorizeState: null };
    } catch (error: unknown) {
        if (error instanceof SessionAuthError) {
            const authorizeState = new AuthorizeState<T>(
                parameters.authorizeStateData,
            );
            const key = authorizeState.write();
            const authorizePath = AuthorizeClient.generateAuthorizePath(
                new AuthorizeParameters({
                    ...parameters.authorizeParameters,
                    state: key,
                    reason: (function reasonFromCode(code: SessionErrorCode) {
                        if (code === SessionErrorCode.SessionExpired) {
                            return "expired";
                        } else if (code === SessionErrorCode.SessionNotFound) {
                            return "not-found";
                        } else if (code === SessionErrorCode.Decryption) {
                            return "corrupted";
                        }
                        return undefined;
                    })(error.code),
                    localId: error.sessionDbDto?.data.localId,
                }),
            );
            throw new SessionBootstrapAuthError(error, authorizePath);
        }

        throw new SessionBootstrapError(error);
    }
}
