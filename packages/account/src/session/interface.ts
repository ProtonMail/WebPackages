import type { SessionAccessTypeMask } from "../sessions/access-type.ts";

export const AccountAuthorizeVersion = 2;

export const AccountAuthorizeType = {
    switch: "1",
    signup: "2",
    login: "3",
};

export interface SaveSessionParams {
    localId: number;
    uid: string;
    userId: string;
    persistent: boolean;
    trusted: boolean;
    accessTypeMask: SessionAccessTypeMask;
    keyPassword: string;
}
