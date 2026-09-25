import { describe, it, expect } from "vitest";
import { splitFilePath } from "./label.ts";

describe("label", () => {
    describe("splitFilePath", () => {
        it("splits a long base name keeping tail plus extension in suffix", () => {
            expect(splitFilePath("verylongfilename.txt")).toStrictEqual({
                prefix: "verylo",
                suffix: "ngfilename.txt",
            });
        });

        it("returns the full name as suffix when base fits in tailLength", () => {
            expect(splitFilePath("short.txt")).toStrictEqual({
                prefix: "",
                suffix: "short.txt",
            });
        });

        it("returns the full name as suffix when base equals tailLength", () => {
            expect(splitFilePath("1234567890.txt")).toStrictEqual({
                prefix: "",
                suffix: "1234567890.txt",
            });
        });

        it("honors a custom tailLength", () => {
            expect(splitFilePath("verylongfilename.txt", 4)).toStrictEqual({
                prefix: "verylongfile",
                suffix: "name.txt",
            });
        });

        it("splits names without extension", () => {
            expect(splitFilePath("abcdefghijk")).toStrictEqual({
                prefix: "a",
                suffix: "bcdefghijk",
            });
        });

        it("keeps only the extension with tailLength 0", () => {
            expect(splitFilePath("verylongfilename.txt", 0)).toStrictEqual({
                prefix: "verylongfilename",
                suffix: ".txt",
            });
        });

        it("treats dotfiles as having no extension", () => {
            expect(splitFilePath(".gitignore")).toStrictEqual({
                prefix: "",
                suffix: ".gitignore",
            });
        });

        it("only treats the last dot as the extension separator", () => {
            expect(splitFilePath("my.long.filename.tar.gz", 4)).toStrictEqual({
                prefix: "my.long.filename",
                suffix: ".tar.gz",
            });
        });

        it("handles an empty name", () => {
            expect(splitFilePath("")).toStrictEqual({
                prefix: "",
                suffix: "",
            });
        });

        it("keeps a trailing dot as the extension", () => {
            expect(splitFilePath("abcdefghijkl.", 4)).toStrictEqual({
                prefix: "abcdefgh",
                suffix: "ijkl.",
            });
        });
    });
});
