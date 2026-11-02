import { useVirtualizer } from "@tanstack/react-virtual";

const GLIDE_MAX_VIEWPORTS = 2;

export interface VirtualListOptions {
    count: number;
    getKey: (index: number) => string;
    estimateSize: (index: number) => number;
    overscan: number;
    getScrollElement: () => HTMLElement | null;
}

export interface VirtualRow {
    index: number;
    key: string;
}

type ScrollToKeyResult = "missing" | "in-place" | "scrolling";

export interface VirtualListApi {
    rows: VirtualRow[];
    blockOffset: number;
    totalSize: number;
    visibleRange: { first: number; last: number } | null;
    viewportSize: number;
    isScrolling: boolean;
    getRowProps: (row: VirtualRow) => {
        ref: (el: Element | null) => void;
        "data-index": number;
    };
    scrollToKey: (
        key: string,
        opts: { align: "start" | "center"; smooth: boolean },
    ) => ScrollToKeyResult;
    cancelScroll: () => void;
}

export const useVirtualList = (o: VirtualListOptions): VirtualListApi => {
    // oxlint-disable-next-line react/incompatible-library -- the React Compiler skips this hook on its own (known-incompatible library)
    const virtualizer = useVirtualizer<HTMLElement, Element>({
        count: o.count,
        getScrollElement: o.getScrollElement,
        estimateSize: o.estimateSize,
        overscan: o.overscan,
        getItemKey: o.getKey,
        useScrollendEvent: true,
        anchorTo: "end",
        // -1 disables the pinned-at-bottom pull, which would skip the reader ahead when a page loads at the bottom.
        scrollEndThreshold: -1,
    });

    const indexOfKey = (key: string): number | null => {
        for (let index = 0; index < o.count; index++) {
            if (o.getKey(index) === key) {
                return index;
            }
        }
        return null;
    };

    const scrollToKey: VirtualListApi["scrollToKey"] = (key, opts) => {
        const index = indexOfKey(key);
        if (index === null) {
            return "missing";
        }
        const offsetInfo = virtualizer.getOffsetForIndex(index, opts.align);
        if (!offsetInfo) {
            return "missing";
        }
        const scrollOffset = virtualizer.scrollOffset ?? 0;
        if (Math.abs(offsetInfo[0] - scrollOffset) < 1) {
            return "in-place";
        }
        // Long glides look like flying past, and the library skips measuring far rows while they run, so far targets jump.
        const viewport = virtualizer.scrollRect?.height ?? 0;
        const isFar =
            Math.abs(offsetInfo[0] - scrollOffset) >
            GLIDE_MAX_VIEWPORTS * viewport;
        virtualizer.scrollToIndex(index, {
            align: opts.align,
            behavior: opts.smooth && !isFar ? "smooth" : "auto",
        });
        return "scrolling";
    };

    const cancelScroll: VirtualListApi["cancelScroll"] = () => {
        virtualizer.cancelScroll();
    };

    const rows = virtualizer.getVirtualItems();
    const range = virtualizer.range;

    return {
        rows: rows.map((item) => ({
            index: item.index,
            key: String(item.key),
        })),
        blockOffset: rows[0]?.start ?? 0,
        totalSize: virtualizer.getTotalSize(),
        visibleRange: range
            ? { first: range.startIndex, last: range.endIndex }
            : null,
        viewportSize: virtualizer.scrollRect?.height ?? 0,
        isScrolling: virtualizer.isScrolling,
        getRowProps: (row) => ({
            ref: virtualizer.measureElement,
            "data-index": row.index,
        }),
        scrollToKey,
        cancelScroll,
    };
};
