import { describe, it, expect } from "vitest";
import { capitalize, getInitials } from "./strings.ts";

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

    describe("getInitials", () => {
        describe("basic default behavior", () => {
            it.each(["", "    "])('should return "?" for empty strings', () => {
                expect(getInitials("")).toBe("?");
            });

            it('should return "?" when called with no argument (default "")', () => {
                expect(getInitials()).toBe("?");
            });

            it("should return the uppercased first letter for a single word", () => {
                expect(getInitials("john")).toBe("J");
            });

            it("should return first+last initials for two words", () => {
                expect(getInitials("John Doe")).toBe("JD");
            });

            it("should uses first and last words", () => {
                expect(getInitials("michael GARY scott")).toBe("MS");
            });

            it("should deal with white spaces", () => {
                expect(getInitials("   John   Doe   ")).toBe("JD");
                expect(getInitials("John     Doe")).toBe("JD");
            });
        });

        describe("special character stripping", () => {
            it("should strip punctuation from names", () => {
                expect(getInitials("John J. Doe")).toBe("JD");
            });

            it("should handle order-swapping punctuation", () => {
                expect(getInitials("Doe, John")).toBe("DJ");
            });

            it("should merge hyphenated tokens", () => {
                expect(getInitials("Jean-Luc Picard")).toBe("JP");
            });

            it("should strip underscores", () => {
                expect(getInitials("John_Doe")).toBe("J");
            });

            it('should return "?" when the name consists only of special characters', () => {
                expect(getInitials("@#$%")).toBe("?");
            });

            it("should remove emojis", () => {
                expect(getInitials("🚀 John")).toBe("J");
            });

            it("should remove flags emojis", () => {
                expect(getInitials("🇺🇸 Tom")).toBe("T");
            });

            it('should return "?" when the name is an emoji', () => {
                expect(getInitials("🤖")).toBe("?");
            });

            it("should remove emojis surrounded by spaces (leaves an empty slot that is filtered)", () => {
                expect(getInitials("John 😀 Doe")).toBe("JD");
            });

            it("should preserve accented letters", () => {
                expect(getInitials("Álvarez")).toBe("Á");
            });

            it("should keep digits as-is (uppercasing is a no-op)", () => {
                expect(getInitials("12345")).toBe("1");
            });

            it("should handle tab/newline", () => {
                expect(getInitials("John\tDoe")).toBe("JD");
                expect(getInitials("John\nDoe")).toBe("JD");
            });

            it("should keep apostrophes", () => {
                expect(getInitials("O'Brien")).toBe("O");
                expect(getInitials("Marc O'Brien-Hudson")).toBe("MO"); // "-" removed, "'" kept
            });
        });

        describe("RTL override sanitization (SEC-644)", () => {
            it("should neutralize U+202D/U+202E override characters", () => {
                expect(getInitials("\u202DAdm\u202Ein")).toBe("A");
            });

            it("should not let an override char create a bogus extra word boundary", () => {
                expect(getInitials("John \u202EDoe")).toBe("JD");
            });
        });
    });
});
