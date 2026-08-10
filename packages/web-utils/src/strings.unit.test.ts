import { describe, it, expect } from "vitest";
import { capitalize } from "./strings.ts";

describe("strings utils", () => {
    describe("capitalize", () => {
        it("should capitalize the first letter of a string and keep the rest unchanged", () => {
            expect(capitalize("hello World")).toBe("Hello World");
        });

        it("should return the string unchanged when it is already capitalized", () => {
            expect(capitalize("World")).toBe("World");
        });

        it("should handle an empty string", () => {
            expect(capitalize("")).toBe("");
        });

        it("should return undefined when passed undefined", () => {
            expect(capitalize(undefined)).toBeUndefined();
        });

        it("should uses Turkish locale for special casing rules", () => {
            // In Turkish, lowercase "i" becomes uppercase "İ" (dot İ), not "I"
            expect(capitalize("istanbul", "tr-TR")).toBe("İstanbul");
        });
    });
});
