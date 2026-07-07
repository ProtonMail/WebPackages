import type { SessionDbDto } from "../session/session-db.ts";

export const SwitcherAccessTypeEnum = {
    Self: 0,
    AdminAccess: 1,
    EmergencyAccess: 2,
} as const;

export type SwitcherAccessType =
    (typeof SwitcherAccessTypeEnum)[keyof typeof SwitcherAccessTypeEnum];

export interface StoredSessionDto {
    localId: number;
    accessType: SwitcherAccessType;
}

export interface LocalSessionResponseDto {
    UID: string;
    Username?: string;
    DisplayName: string;
    LocalID: number;
    UserID: string;
    PrimaryEmail?: string;
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
