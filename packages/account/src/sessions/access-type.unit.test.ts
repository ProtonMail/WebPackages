import { describe, it, expect } from "vitest";
import {
    SessionAccessTypeFlag,
    getSessionAccessTypeMask,
    hasSessionAccessType,
    selfAccessTypeMask,
} from "./access-type.ts";

describe("getSessionAccessTypeMask", () => {
    it("is self for a plain user", () => {
        expect(getSessionAccessTypeMask({})).toBe(selfAccessTypeMask);
        expect(
            getSessionAccessTypeMask({
                OrganizationPrivateKey: "",
                Flags: { "delegated-access": false },
            }),
        ).toBe(selfAccessTypeMask);
    });

    it("combines every flag the user carries", () => {
        expect(
            getSessionAccessTypeMask({
                OrganizationPrivateKey: "key",
                Flags: { "delegated-access": true, "org-access": true },
            }),
        ).toBe(
            SessionAccessTypeFlag.AdminAccess |
                SessionAccessTypeFlag.DelegatedAccess |
                SessionAccessTypeFlag.OrgAccess,
        );
    });
});

describe("hasSessionAccessType", () => {
    it("checks a single flag in the mask", () => {
        const mask =
            SessionAccessTypeFlag.DelegatedAccess |
            SessionAccessTypeFlag.OrgAccess;
        expect(
            hasSessionAccessType(mask, SessionAccessTypeFlag.OrgAccess),
        ).toBe(true);
        expect(
            hasSessionAccessType(mask, SessionAccessTypeFlag.AdminAccess),
        ).toBe(false);
    });
});
