import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useVirtualList, type VirtualListOptions } from "./useVirtualList.ts";

// The library needs a layout, which happy-dom does not have. The virtualizer is
// replaced by a fake that reports fixed offsets and records the calls made to it.
const fake = vi.hoisted(() => ({
    options: undefined as Record<string, unknown> | undefined,
    offsets: [] as number[],
    rendered: [] as number[],
    scrollOffset: 0,
    viewportHeight: 400,
    isScrolling: false,
    scrollToIndex: vi.fn(),
    cancelScroll: vi.fn(),
    measureElement: vi.fn(),
}));

vi.mock("@tanstack/react-virtual", () => ({
    useVirtualizer: (options: Record<string, unknown>) => {
        fake.options = options;
        const getKey = options.getItemKey as (index: number) => string;
        return {
            getVirtualItems: () =>
                fake.rendered.map((index) => ({
                    index,
                    key: getKey(index),
                    start: fake.offsets[index] ?? 0,
                })),
            getTotalSize: () => (fake.offsets.at(-1) ?? 0) + 40,
            range: fake.rendered.length
                ? {
                      startIndex: fake.rendered[0],
                      endIndex: fake.rendered.at(-1),
                  }
                : null,
            scrollOffset: fake.scrollOffset,
            scrollRect: { width: 300, height: fake.viewportHeight },
            isScrolling: fake.isScrolling,
            getOffsetForIndex: (index: number) => [fake.offsets[index] ?? 0],
            scrollToIndex: fake.scrollToIndex,
            cancelScroll: fake.cancelScroll,
            measureElement: fake.measureElement,
        };
    },
}));

const makeOptions = (
    overrides: Partial<VirtualListOptions> = {},
): VirtualListOptions => ({
    count: 3,
    getKey: (index) => `key-${index}`,
    estimateSize: () => 40,
    overscan: 1,
    getScrollElement: () => null,
    ...overrides,
});

beforeEach(() => {
    vi.clearAllMocks();
    fake.offsets = [0, 40, 80];
    fake.rendered = [0, 1, 2];
    fake.scrollOffset = 0;
    fake.viewportHeight = 400;
    fake.isScrolling = false;
});

describe("useVirtualList", () => {
    it("passes the keys and the end anchoring to the library, and no custom adjustment", () => {
        renderHook(() => useVirtualList(makeOptions()));

        expect(fake.options).toMatchObject({
            anchorTo: "end",
            scrollEndThreshold: -1,
            useScrollendEvent: true,
        });
        const getItemKey = fake.options?.getItemKey as
            ((index: number) => string) | undefined;
        expect(getItemKey?.(1)).toBe("key-1");
        expect(fake.options).not.toHaveProperty("rangeExtractor");
        expect(fake.options).not.toHaveProperty("shouldDeferCorrection");
    });

    it("passes getKey through to the rows", () => {
        const { result } = renderHook(() => useVirtualList(makeOptions()));

        expect(result.current.rows).toEqual([
            { index: 0, key: "key-0" },
            { index: 1, key: "key-1" },
            { index: 2, key: "key-2" },
        ]);
    });

    it("positions the block at the first rendered row", () => {
        fake.rendered = [1, 2];
        const { result } = renderHook(() => useVirtualList(makeOptions()));

        expect(result.current.blockOffset).toBe(40);
    });

    it("gives the rows only a ref and their index, with no positioning", () => {
        const { result } = renderHook(() => useVirtualList(makeOptions()));
        const row = result.current.rows[1];
        expect(row).toBeDefined();
        if (row) {
            const props = result.current.getRowProps(row);
            expect(props["data-index"]).toBe(1);
            expect(props.ref).toBe(fake.measureElement);
            expect(props).not.toHaveProperty("style");
        }
    });

    it("exposes whether the list is moving", () => {
        fake.isScrolling = true;
        const { result } = renderHook(() => useVirtualList(makeOptions()));

        expect(result.current.isScrolling).toBe(true);
    });

    it("returns missing from scrollToKey for an unknown key, and scrolls nothing", () => {
        const { result } = renderHook(() => useVirtualList(makeOptions()));

        expect(
            result.current.scrollToKey("missing", {
                align: "start",
                smooth: false,
            }),
        ).toBe("missing");
        expect(fake.scrollToIndex).not.toHaveBeenCalled();
    });

    it("returns in-place from scrollToKey when the key is already at the position", () => {
        const { result } = renderHook(() => useVirtualList(makeOptions()));

        expect(
            result.current.scrollToKey("key-0", {
                align: "start",
                smooth: true,
            }),
        ).toBe("in-place");
        expect(fake.scrollToIndex).not.toHaveBeenCalled();
    });

    it("glides to a near key when smooth is asked for", () => {
        const { result } = renderHook(() => useVirtualList(makeOptions()));

        expect(
            result.current.scrollToKey("key-2", {
                align: "start",
                smooth: true,
            }),
        ).toBe("scrolling");
        expect(fake.scrollToIndex).toHaveBeenCalledWith(2, {
            align: "start",
            behavior: "smooth",
        });
    });

    it("jumps to a far key even when smooth is asked for", () => {
        fake.offsets = Array.from({ length: 100 }, (_, i) => i * 40);
        const { result } = renderHook(() =>
            useVirtualList(makeOptions({ count: 100 })),
        );

        expect(
            result.current.scrollToKey("key-99", {
                align: "start",
                smooth: true,
            }),
        ).toBe("scrolling");
        expect(fake.scrollToIndex).toHaveBeenCalledWith(99, {
            align: "start",
            behavior: "auto",
        });
    });

    it("jumps when smooth is not asked for", () => {
        const { result } = renderHook(() => useVirtualList(makeOptions()));

        result.current.scrollToKey("key-2", { align: "center", smooth: false });

        expect(fake.scrollToIndex).toHaveBeenCalledWith(2, {
            align: "center",
            behavior: "auto",
        });
    });

    it("jumps when there is no viewport to measure against", () => {
        fake.viewportHeight = 0;
        const { result } = renderHook(() => useVirtualList(makeOptions()));

        result.current.scrollToKey("key-2", { align: "start", smooth: true });

        expect(fake.scrollToIndex).toHaveBeenCalledWith(2, {
            align: "start",
            behavior: "auto",
        });
    });

    it("hands cancelScroll to the library", () => {
        const { result } = renderHook(() => useVirtualList(makeOptions()));

        result.current.cancelScroll();

        expect(fake.cancelScroll).toHaveBeenCalledTimes(1);
    });
});
