import { describe, expect, it } from "vitest";

import getAuthVersionWithFallback from "../../src/srp/getAuthVersionWithFallback.ts";

describe("auth version fallback", () => {
    for (let i = 1; i <= 4; ++i) {
        it(`should get specified auth version ${i}`, () => {
            const result = getAuthVersionWithFallback({ Version: 4 }, "");
            expect(result).toEqual({
                version: 4,
                done: true,
            });
        });
    }

    it("should get specified auth version if a version has been attempted", () => {
        const result = getAuthVersionWithFallback({ Version: 4 }, "", 2);
        expect(result).toEqual({
            version: 4,
            done: true,
        });
    });

    it("should fall back to auth version 2 when it is unknown", () => {
        const result = getAuthVersionWithFallback({ Version: 0 }, "");
        expect(result).toEqual({
            version: 2,
            done: false,
        });
    });

    it("should fall back to auth version 1 when it has attempted 2 and the username contains underscore", () => {
        const result = getAuthVersionWithFallback({ Version: 0 }, "test_100", 2);
        expect(result).toEqual({
            version: 1,
            done: false,
        });
    });

    it("should fall back to auth version 0 when it has attempted 2", () => {
        const result = getAuthVersionWithFallback({ Version: 0 }, "", 2);
        expect(result).toEqual({
            version: 0,
            done: true,
        });
    });

    it("should throw when all attempts have been made", () => {
        expect(() => {
            getAuthVersionWithFallback({ Version: 0 }, "", 0);
        }).toThrow("Can not provide any other auth version");
    });
});
