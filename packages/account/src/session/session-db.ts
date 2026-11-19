import { type DBSchema, openDB } from "idb";
import {
    type SessionAccessTypeMask,
    selfAccessTypeMask,
} from "../sessions/access-type.ts";

interface DataDbDto {
    // Session data
    localId: number;
    uid: string;
    persistent: boolean;
    trusted: boolean;
    accessTypeMask: SessionAccessTypeMask;
    // User data
    userId: string;
    payload: Uint8Array<ArrayBuffer>; // Encrypted data
}

interface MetaDbDto {
    persistedAt: number;
    usedAt: number;
}

export interface SessionDbDto {
    data: DataDbDto;
    meta: MetaDbDto;
}

interface SessionDbSchema extends DBSchema {
    sessions: {
        value: SessionDbDto;
        key: string;
        indexes: {
            "by-used-at": number;
        };
    };
}
// Sessions saved by earlier versions have no access type
const withAccessType = (dto: SessionDbDto): SessionDbDto => ({
    ...dto,
    data: {
        ...dto.data,
        accessTypeMask: dto.data.accessTypeMask ?? selfAccessTypeMask,
    },
});

export class SessionDb {
    async #db() {
        return await openDB<SessionDbSchema>("sessions", 1, {
            upgrade(db) {
                const sessionStore = db.createObjectStore("sessions");
                sessionStore.createIndex("by-used-at", "meta.usedAt");
            },
        });
    }

    async getAll(): Promise<SessionDbDto[]> {
        const db = await this.#db();
        return (await db.getAll("sessions")).map(withAccessType);
    }

    async get(localId: number): Promise<SessionDbDto | undefined> {
        const db = await this.#db();
        const dto = await db.get("sessions", `${localId}`);
        return dto && withAccessType(dto);
    }

    async save(dto: SessionDbDto) {
        const db = await this.#db();
        await db.put("sessions", dto, `${dto.data.localId}`);
    }

    async delete(dto: SessionDbDto) {
        const db = await this.#db();
        await db.delete("sessions", `${dto.data.localId}`);
    }

    async getLastUsed(): Promise<SessionDbDto | undefined> {
        const db = await this.#db();
        const tx = db.transaction("sessions");
        const index = tx.store.index("by-used-at");
        const cursor = await index.openCursor(null, "prev");
        return cursor?.value && withAccessType(cursor.value);
    }

    async setLastUsed(sessionDbDto: SessionDbDto, date: number) {
        const updated: SessionDbDto = {
            ...sessionDbDto,
            meta: { ...sessionDbDto.meta, usedAt: date },
        };
        await this.save(updated);
    }
}
