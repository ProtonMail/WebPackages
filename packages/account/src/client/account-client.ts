import { SessionsClient } from "../sessions/sessions-client.ts";
import { SessionPersistence } from "../session/session-persistence.ts";
import {
    AuthorizeClient,
    type AuthorizeIntent,
} from "../session/authorize-client.ts";
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

export type SignOutOptions =
    /** The user signs out: the session is revoked, then signed out at account */
    | { type: "signOut"; localId: number }
    /**
     * The API no longer accepts the session: it's dropped, and the user signs
     * in again, as `email` if known
     */
    | { type: "unauthorized"; localId: number; email?: string };

export class AccountClient {
    #sessionsClient: SessionsClient;
    #sessionBootstrapClient: SessionBootstrapClient;
    #authorizeClient: AuthorizeClient;

    #fetch: typeof window.fetch;
    #sessionPersistence: SessionPersistence;
    #sessionDb: SessionDb;
    #sessionMem: SessionMem;

    constructor({
        fetch,
        cookieStorage,
        url,
        app,
        accountUrl,
        redirectUrl,
    }: {
        fetch: typeof window.fetch;
        cookieStorage: CookieStorage;
        url: URL;
        /** The app account forks sessions to */
        app: `proton-${string}`;
        /** Where account is, e.g. `https://account.proton.me` */
        accountUrl: URL;
        /** Where account sends the user back with the fork, if not the default */
        redirectUrl?: URL;
    }) {
        this.#fetch = fetch;

        this.#sessionDb = new SessionDb();
        this.#sessionMem = new SessionMem();

        this.#sessionPersistence = new SessionPersistence({
            fetch: this.#fetch,
            sessionDb: this.#sessionDb,
            sessionMem: this.#sessionMem,
        });

        this.#authorizeClient = new AuthorizeClient({
            fetch: this.#fetch,
            app,
            accountUrl,
            redirectUrl,
        });

        this.#sessionBootstrapClient = new SessionBootstrapClient({
            authorizeClient: this.#authorizeClient,
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

    /**
     * Gets the session: from the fork if `url` is account's callback, from
     * storage otherwise. If there's none, returns where to send the user to
     * get one.
     */
    getSession<T>(
        params: SessionBootstrapParameters<T>,
    ): Promise<SessionBootstrapResult<T>> {
        return this.#sessionBootstrapClient.getSession<T>(params);
    }

    getSessions(): Promise<SessionsResultDto> {
        return this.#sessionsClient.getSessions();
    }

    /**
     * Returns where to send the user for `intent`: navigate to it in this
     * tab. The fork comes back bound to a fork secret kept in this tab, with
     * `data`, which `getSession` returns.
     */
    authorize<T>(intent: AuthorizeIntent, data?: T): Promise<URL> {
        return this.#authorizeClient.authorize(intent, data ?? null);
    }

    /**
     * Like {@link AccountClient.authorize}, for links (`href`), which may be
     * opened in another tab: the fork isn't bound to a fork secret, and
     * nothing is kept in this tab. Prefer `authorize` when navigating in this
     * tab, e.g. on a plain click.
     */
    getAuthorizeLink(intent: AuthorizeIntent): URL {
        return this.#authorizeClient.getAuthorizeLink(intent);
    }

    /**
     * Signs the session out of this app, and returns where to send the user
     * next: navigate to it in this tab.
     */
    async signOut(options: SignOutOptions): Promise<URL> {
        if (options.type === "unauthorized") {
            await this.#sessionPersistence.signOutSession(options);
            return this.authorize({
                type: "reauthorize",
                email: options.email,
            });
        }
        const userId = await this.#sessionDb
            .get(options.localId)
            .then((sessionDbDto) => sessionDbDto?.data.userId)
            .catch(() => undefined);
        await this.#sessionPersistence.signOutSession(options);
        return this.authorize({
            type: "sign-out",
            userIds: userId === undefined ? [] : [userId],
        });
    }
}
