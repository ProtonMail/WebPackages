/**
 * How a session accesses an account, mirroring `AccessType` in AccountInternalBundle.
 * The flags are not mutually exclusive.
 */
export const SessionAccessTypeFlag = {
    AdminAccess: 1 << 0,
    DelegatedAccess: 1 << 1,
    OrgAccess: 1 << 2,
} as const;
export type SessionAccessTypeFlag =
    (typeof SessionAccessTypeFlag)[keyof typeof SessionAccessTypeFlag];

/** A bitmask of {@link SessionAccessTypeFlag}, as returned in `AccessType` from `auth/v4/sessions/local`. */
export type SessionAccessTypeMask = number;

/** A plain self session sets none of the flags. */
export const selfAccessTypeMask: SessionAccessTypeMask = 0;

/** The fields of the `core/v4/users` user that decide its access type. */
export interface AccessTypeUserDto {
    OrganizationPrivateKey?: string;
    Flags?: {
        "delegated-access"?: boolean;
        "org-access"?: boolean;
    };
}

/**
 * Derive the access type from a user, as `auth/v4/sessions/local` would return it.
 */
export const getSessionAccessTypeMask = (
    user: AccessTypeUserDto,
): SessionAccessTypeMask => {
    let mask = selfAccessTypeMask;
    if (user.OrganizationPrivateKey) {
        mask |= SessionAccessTypeFlag.AdminAccess;
    }
    if (user.Flags?.["delegated-access"]) {
        mask |= SessionAccessTypeFlag.DelegatedAccess;
    }
    if (user.Flags?.["org-access"]) {
        mask |= SessionAccessTypeFlag.OrgAccess;
    }
    return mask;
};

export const hasSessionAccessType = (
    mask: SessionAccessTypeMask,
    flag: SessionAccessTypeFlag,
) => (mask & flag) !== 0;
