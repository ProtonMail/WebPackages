import { SessionsClient } from "../sessions/sessions-client.ts";
import { SessionPersistence } from "../session/session-persistence.ts";
import { AuthorizeClient } from "../session/authorize-client.ts";
import { SessionDb } from "../session/session-db.ts";
import { SessionsStorage } from "../sessions/sessions-storage.ts";
import { SessionMem } from "../session/session-mem.ts";
import {
    SessionBootstrapClient,
    type SessionBootstrapParameters,
    type SessionBootstrapResult,
} from "../session/session-bootstrap-client.ts";
import type { CookieStorage } from "@protontech/web-utils/cookie-storage.ts";
import { getRootDomain } from "@protontech/web-utils/url.ts";
import type { SessionsResultDto } from "../sessions/interface.ts";

export class AccountClient {
    #sessionsClient: SessionsClient;
    #sessionBootstrapClient: SessionBootstrapClient;

    #fetch: typeof window.fetch;
    #sessionPersistence: SessionPersistence;
    #sessionDb: SessionDb;
    #sessionMem: SessionMem;

    constructor({
        fetch,
        cookieStorage,
        url,
    }: {
        fetch: typeof window.fetch;
        cookieStorage: CookieStorage;
        url: URL;
    }) {
        this.#fetch = fetch;

        this.#sessionDb = new SessionDb();
        this.#sessionMem = new SessionMem();

        this.#sessionPersistence = new SessionPersistence({
            fetch: this.#fetch,
            sessionDb: this.#sessionDb,
            sessionMem: this.#sessionMem,
        });

        const authorizeClient = new AuthorizeClient({
            fetch: this.#fetch,
        });

        this.#sessionBootstrapClient = new SessionBootstrapClient({
            authorizeClient,
            sessionPersistence: this.#sessionPersistence,
        });

        this.#sessionsClient = new SessionsClient({
            fetch,
            sessionDb: this.#sessionDb,
            sessionsStorage: new SessionsStorage({
                cookieStorage,
                domain: getRootDomain(url.hostname),
            }),
        });
    }

    getSession<T>(
        params: SessionBootstrapParameters<T>,
    ): Promise<SessionBootstrapResult<T>> {
        return this.#sessionBootstrapClient.getSession<T>(params);
    }

    getSessions(): Promise<SessionsResultDto> {
        return this.#sessionsClient.getSessions();
    }

    signOut(args: {
        localId: number;
        type: "unauthorized" | "signOut";
    }): Promise<"ok" | "fail"> {
        return this.#sessionPersistence.signOutSession(args);
    }
}
