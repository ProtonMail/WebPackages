import type { SessionDbDto } from "../session/session-db.ts";
import type { SessionAccessTypeMask } from "./access-type.ts";

/** The access type is read from `auth/v4/sessions/local`, not from the cookie. */
export interface StoredSessionDto {
    localId: number;
}

export interface LocalSessionResponseDto {
    UID: string;
    Username?: string;
    DisplayName: string;
    LocalID: number;
    UserID: string;
    PrimaryEmail?: string;
    AccessType: SessionAccessTypeMask;
}

export interface LocalSessionsResponseDto {
    Sessions: LocalSessionResponseDto[];
}

interface LocalSessionResultDto {
    dbSession?: SessionDbDto;
    storedSession?: StoredSessionDto;
}
export type LocalSessionMapResultDto = Map<number, LocalSessionResultDto>;

interface SessionResultDto extends LocalSessionResultDto {
    networkSession: LocalSessionResponseDto;
}
export type SessionsResultDto = SessionResultDto[];
