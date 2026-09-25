import { describe, it, expect } from "vitest";
import {
    getSizeFormat,
    getLongSizeFormat,
    getUnit,
    humanSize,
    shortHumanSize,
    bytesSize,
    type SizeUnits,
} from "./humanSize.ts";
import { sizeUnits } from "./size.ts";

describe("humanSize", () => {
    describe("getUnit", () => {
        it("returns B below one kilobyte", () => {
            expect(getUnit(0)).toBe("B");
            expect(getUnit(sizeUnits.KB - 1)).toBe("B");
        });

        it("returns KB from one kilobyte up to one megabyte", () => {
            expect(getUnit(sizeUnits.KB)).toBe("KB");
            expect(getUnit(sizeUnits.MB - 1)).toBe("KB");
        });

        it("returns MB from one megabyte up to one gigabyte", () => {
            expect(getUnit(sizeUnits.MB)).toBe("MB");
            expect(getUnit(sizeUnits.GB - 1)).toBe("MB");
        });

        it("caps at GB by default, even for terabyte-sized values", () => {
            expect(getUnit(sizeUnits.GB)).toBe("GB");
            expect(getUnit(sizeUnits.TB)).toBe("GB");
        });

        it("respects max option", () => {
            const huge = 5 * sizeUnits.TB;
            expect(getUnit(huge, { max: "B" })).toBe("B");
            expect(getUnit(huge, { max: "KB" })).toBe("KB");
            expect(getUnit(huge, { max: "MB" })).toBe("MB");
            expect(getUnit(huge, { max: "GB" })).toBe("GB");
            expect(getUnit(huge, { max: "TB" })).toBe("TB");
        });
    });

    describe("getSizeFormat", () => {
        it("pluralizes bytes", () => {
            expect(getSizeFormat("B", 1)).toBe("byte");
            expect(getSizeFormat("B", 0)).toBe("bytes");
            expect(getSizeFormat("B", 2)).toBe("bytes");
        });

        it("returns short units as-is", () => {
            expect(getSizeFormat("KB", 1)).toBe("KB");
            expect(getSizeFormat("MB", 1)).toBe("MB");
            expect(getSizeFormat("GB", 2)).toBe("GB");
            expect(getSizeFormat("TB", 2)).toBe("TB");
        });

        it("throws for unknown unit", () => {
            expect(() => getSizeFormat("PB" as SizeUnits, 1)).toThrow(
                "Unknown unit",
            );
        });
    });

    describe("getLongSizeFormat", () => {
        it("pluralizes long units", () => {
            expect(getLongSizeFormat("B", 1)).toBe("Byte");
            expect(getLongSizeFormat("B", 2)).toBe("Bytes");
            expect(getLongSizeFormat("KB", 1)).toBe("Kilobyte");
            expect(getLongSizeFormat("KB", 2)).toBe("Kilobytes");
            expect(getLongSizeFormat("MB", 1)).toBe("Megabyte");
            expect(getLongSizeFormat("GB", 2)).toBe("Gigabytes");
            expect(getLongSizeFormat("TB", 2)).toBe("Terabytes");
        });

        it("throws for unknown unit", () => {
            expect(() => getLongSizeFormat("PB" as SizeUnits, 1)).toThrow(
                "Unknown unit",
            );
        });
    });

    describe("humanSize", () => {
        it("auto-detects unit with two fraction digits", () => {
            expect(humanSize({ bytes: 12345 })).toBe("12.06 KB");
        });

        it("uses zero fraction digits for auto-detected bytes", () => {
            expect(humanSize({ bytes: 500 })).toBe("500 bytes");
        });

        it("defaults undefined bytes to 0", () => {
            expect(humanSize({ bytes: undefined })).toBe("0 bytes");
        });

        it("uses an explicit unit when given", () => {
            expect(humanSize({ bytes: 1536, unit: "KB" })).toBe("1.50 KB");
        });

        it("rounds to nearest value with fraction 0 and no truncate flag", () => {
            expect(
                humanSize({
                    bytes: 1.04 * sizeUnits.MB,
                    unit: "MB",
                    fraction: 0,
                }),
            ).toBe("1 MB");
            expect(
                humanSize({
                    bytes: 1.5 * sizeUnits.MB,
                    unit: "MB",
                    fraction: 0,
                }),
            ).toBe("1.5 MB");
        });

        it("truncates with fraction 0 and truncate flag", () => {
            expect(
                humanSize({
                    bytes: 1536,
                    unit: "KB",
                    fraction: 0,
                    truncate: true,
                }),
            ).toBe("2 KB");
        });

        it("omits the unit suffix when withoutUnit is set", () => {
            expect(humanSize({ bytes: 12345, withoutUnit: true })).toBe(
                "12.06",
            );
        });

        it("passes unitOptions through to unit detection", () => {
            expect(
                humanSize({
                    bytes: 5 * sizeUnits.GB,
                    unitOptions: { max: "MB" },
                }),
            ).toBe("5120.00 MB");
        });
    });

    describe("shortHumanSize", () => {
        it("shows truncated bytes below one kilobyte", () => {
            expect(shortHumanSize(12)).toBe("12 bytes");
            expect(shortHumanSize()).toBe("0 bytes");
        });

        it("drops fractions below one gigabyte", () => {
            expect(shortHumanSize(567 * sizeUnits.KB)).toBe("567 KB");
            expect(shortHumanSize(12.34 * sizeUnits.MB)).toBe("12 MB");
        });

        it("shows one fraction digit from one gigabyte up", () => {
            expect(shortHumanSize(12.34 * sizeUnits.GB)).toBe("12.3 GB");
            expect(shortHumanSize(sizeUnits.GB)).toBe("1.0 GB");
        });
    });

    describe("bytesSize", () => {
        it("formats exact byte count with pluralization", () => {
            expect(bytesSize()).toBe("0 bytes");
            expect(bytesSize(1)).toBe("1 byte");
            expect(bytesSize(12345)).toBe("12345 bytes");
        });
    });
});
