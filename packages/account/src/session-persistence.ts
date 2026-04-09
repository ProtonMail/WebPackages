import { SessionDb, type SessionDbDto } from "./session-db.ts";
import { SessionMem, type SessionMemDto } from "./session-mem.ts";
import { generateClientKey, getClientKey } from "./client-key.ts";
import { decryptBlob, encryptBlob } from "./session-blob-crypto.ts";
import type { SaveSessionParams } from "./interface.ts";

interface GetClientKeyDto {
    ClientKey: string;
}

export interface SessionDto {
    sessionDbDto: SessionDbDto;
    keyPassword: string;
    clientKey: string;
}

export const SessionErrorCode = {
    Network: 0,
    Decryption: 1,
    SessionExpired: 2,
    SessionNotFound: 3,
} as const;
export type SessionErrorCode =
    (typeof SessionErrorCode)[keyof typeof SessionErrorCode];

export class SessionError extends Error {
    public code: SessionErrorCode;
    public sessionDbDto: SessionDbDto | null;
    public status: number;
    public json: unknown;
    public originalError: unknown;
    constructor(
        code: SessionErrorCode,
        sessionDbDto: SessionDbDto | null,
        status: number,
        json: unknown,
        originalError: unknown,
    ) {
        super("Session error occurred");
        this.name = "SessionError";
        this.code = code;
        this.sessionDbDto = sessionDbDto;
        this.status = status;
        this.json = json;
        this.originalError = originalError;
    }
}

export class SessionAuthError extends SessionError {}

export class SessionPersistence {
    private fetch: typeof window.fetch;
    private sessionDb: SessionDb;
    private sessionMem: SessionMem;

    constructor({
        fetch,
        sessionDb = new SessionDb(),
        sessionMem = new SessionMem(),
    }: {
        fetch: typeof window.fetch;
        sessionDb?: SessionDb;
        sessionMem?: SessionMem;
    }) {
        this.fetch = fetch;
        this.sessionDb = sessionDb;
        this.sessionMem = sessionMem;
    }

    public async getSessionFromMemory(
        localId?: number,
    ): Promise<SessionDto | undefined> {
        const memSession = await this.sessionMem.load(localId);

        if (memSession) {
            const sessionDbDto = await this.sessionDb.load(memSession.localId);
            if (sessionDbDto) {
                const accountSessionDto: SessionDto = {
                    sessionDbDto,
                    keyPassword: memSession.keyPassword,
                    clientKey: memSession.clientKey,
                };
                return accountSessionDto;
            }
        }
    }

    public async getSessionFromStorage(
        sessionDbDto: SessionDbDto,
    ): Promise<SessionDto> {
        const response = await this.fetch(
            new Request("/auth/v4/sessions/local/key", {
                method: "get",
                headers: {
                    "x-pm-uid": sessionDbDto.data.uid,
                },
            }),
        );
        if (response.status === 401) {
            // TODO: Was a refresh attempted?
            await this.sessionDb.delete(sessionDbDto).catch(() => {});
            throw new SessionAuthError(
                SessionErrorCode.SessionExpired,
                sessionDbDto,
                response.status,
                "",
                null,
            );
        }
        const json = (await response.json().catch(() => {})) as
            | GetClientKeyDto
            | undefined;
        if (response.status !== 200 || typeof json?.ClientKey !== "string") {
            throw new SessionError(
                SessionErrorCode.Network,
                sessionDbDto,
                response.status,
                json,
                null,
            );
        }
        try {
            const clientKey = await getClientKey(json.ClientKey);
            const keyPassword = await decryptBlob(
                clientKey,
                sessionDbDto.data.payload,
            );
            const sessionDto: SessionDto = {
                sessionDbDto,
                keyPassword,
                clientKey: json.ClientKey,
            };
            return sessionDto;
        } catch (error) {
            await this.sessionDb.delete(sessionDbDto).catch(() => {});
            throw new SessionAuthError(
                SessionErrorCode.Decryption,
                sessionDbDto,
                response.status,
                json,
                error,
            );
        }
    }

    private async useSession(sessionDto: SessionDto) {
        const now = Date.now();
        const memorySessionDto: SessionMemDto = {
            localId: sessionDto.sessionDbDto.data.localId,
            keyPassword: sessionDto.keyPassword,
            clientKey: sessionDto.clientKey,
        };
        await Promise.all([
            this.sessionDb.setLastUsed(sessionDto.sessionDbDto, now),
            this.sessionMem.save(memorySessionDto),
        ]);
    }

    public async saveSession(data: SaveSessionParams): Promise<SessionDto> {
        const { serializedData, key } = await generateClientKey();

        let response: Response;
        try {
            response = await this.fetch(
                new Request("/auth/v4/sessions/local/key", {
                    method: "put",
                    headers: {
                        "x-pm-uid": data.uid,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({ Key: serializedData }),
                }),
            );
        } catch (error) {
            throw new SessionError(
                SessionErrorCode.Network,
                null,
                0,
                "",
                error,
            );
        }
        const json = response.json().catch(() => {});
        if (response.status === 401) {
            throw new SessionAuthError(
                SessionErrorCode.SessionExpired,
                null,
                response.status,
                json,
                null,
            );
        }
        if (response.status !== 200) {
            throw new SessionError(
                SessionErrorCode.Network,
                null,
                response.status,
                json,
                null,
            );
        }
        const now = Date.now();
        const sessionDbDto: SessionDbDto = {
            data: {
                localId: data.localId,
                uid: data.uid,
                userId: data.userId,
                persistent: data.persistent,
                trusted: data.trusted,
                payload: await encryptBlob(key, data.keyPassword),
            },
            meta: {
                persistedAt: now,
                usedAt: now,
            },
        };
        await this.sessionDb.save(sessionDbDto);
        const sessionDto: SessionDto = {
            sessionDbDto: sessionDbDto,
            keyPassword: data.keyPassword,
            clientKey: serializedData,
        };
        await this.useSession(sessionDto);
        return sessionDto;
    }

    public async getSession(localId: number | undefined): Promise<SessionDto> {
        const memoryAccountSessionDto =
            await this.getSessionFromMemory(localId);
        if (memoryAccountSessionDto) {
            await this.useSession(memoryAccountSessionDto);
            return memoryAccountSessionDto;
        }
        const sessionDbDto = await (localId === undefined
            ? this.sessionDb.getLastUsed()
            : this.sessionDb.load(localId));
        if (sessionDbDto) {
            const sessionDto = await this.getSessionFromStorage(sessionDbDto);
            await this.useSession(sessionDto);
            return sessionDto;
        }
        throw new SessionAuthError(
            SessionErrorCode.SessionNotFound,
            null,
            0,
            null,
            null,
        );
    }
}
