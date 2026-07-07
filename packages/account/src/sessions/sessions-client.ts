import { SessionsStorage } from "./sessions-storage.ts";
import {
    type LocalSessionMapResultDto,
    type LocalSessionsResponseDto,
    type SessionsResultDto,
} from "./interface.ts";
import { SessionDb, type SessionDbDto } from "../session/session-db.ts";

export const getLocalIdSessionString = (array: number[]) => {
    return array.sort().join(",");
};

export class SessionsClient {
    #fetch: typeof window.fetch;
    #sessionsStorage: SessionsStorage;
    #sessionDb: SessionDb;
    #cachedSessions: SessionsResultDto = [];

    constructor({
        fetch,
        sessionsStorage,
        sessionDb,
    }: {
        fetch: typeof window.fetch;
        sessionsStorage: SessionsStorage;
        sessionDb: SessionDb;
    }) {
        this.#fetch = fetch;
        this.#sessionsStorage = sessionsStorage;
        this.#sessionDb = sessionDb;
    }

    async getSessions() {
        const localSessions = await this.#getLocalSessions();

        const localIdSessions = getLocalIdSessionString([
            ...localSessions.keys(),
        ]);
        const cachedLocalIdSessions = getLocalIdSessionString(
            this.#cachedSessions.map((item) => item.networkSession.LocalID),
        );

        // If local sessions haven't changed compared to previously cached value, avoid calling the API.
        if (localIdSessions === cachedLocalIdSessions) {
            return this.#cachedSessions;
        }

        const networkSessions = await this.#getActiveSessionsDto();

        const filteredSessions: SessionsResultDto = [];
        for (const networkSession of networkSessions) {
            const localSession = localSessions.get(networkSession.LocalID);
            if (localSession) {
                filteredSessions.push({ networkSession, ...localSession });
            }
        }

        this.#cachedSessions = filteredSessions;

        this.#cleanupPotentiallyInactiveSessions(
            filteredSessions,
            localSessions,
        ).catch(() => {});

        return filteredSessions;
    }

    async #cleanupPotentiallyInactiveSessions(
        sessions: SessionsResultDto,
        localSessions: LocalSessionMapResultDto,
    ) {
        const activeLocalIds = new Set(
            sessions.map(({ networkSession }) => networkSession.LocalID),
        );

        // Local DB sessions that are no longer active on the network are
        // candidates for cleanup.
        const missingDbSessions: SessionDbDto[] = [];
        for (const [localId, { dbSession }] of localSessions) {
            if (dbSession && !activeLocalIds.has(localId)) {
                missingDbSessions.push(dbSession);
            }
        }

        if (!missingDbSessions.length) {
            return;
        }

        for (const missingDbSession of missingDbSessions) {
            const response = await this.#fetch(
                new Request("/auth/v4/sessions/local/key", {
                    method: "get",
                    headers: {
                        "x-pm-uid": missingDbSession.data.uid,
                    },
                }),
            );
            if (response.status === 401) {
                await this.#sessionDb.delete(missingDbSession).catch(() => {});
            }
            // A little bit of a timeout to make it safer with race conditions and avoid spamming the API
            await new Promise((resolve) => {
                setTimeout(resolve, 2_000);
            });
        }
    }

    async #getLocalSessions(): Promise<LocalSessionMapResultDto> {
        const storedSessions = this.#sessionsStorage.read() ?? [];
        const dbSessions = await this.#sessionDb.getAll();

        const merged: LocalSessionMapResultDto = new Map();

        for (const dbSession of dbSessions) {
            merged.set(dbSession.data.localId, { dbSession });
        }

        for (const storedSession of storedSessions) {
            const existing = merged.get(storedSession.localId);
            merged.set(storedSession.localId, { ...existing, storedSession });
        }

        return merged;
    }

    async #getActiveSessionsDto() {
        const localSessionsResponse = await this.#fetch(
            new Request(`/auth/v4/sessions/local`, { method: "get" }),
        );
        const localSessionsResponseDto = (await localSessionsResponse
            .json()
            .catch(() => {})) as LocalSessionsResponseDto | undefined;
        if (
            localSessionsResponse.status === 200 &&
            Array.isArray(localSessionsResponseDto?.Sessions)
        ) {
            return localSessionsResponseDto.Sessions;
        }
        return [];
    }
}
