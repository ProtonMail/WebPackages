import {
    type RefObject,
    useEffect,
    useEffectEvent,
    useLayoutEffect,
    useRef,
} from "react";

import { useFeedKeyboard } from "./useFeedKeyboard.ts";
import { useScrollCommand } from "./useScrollCommand.ts";
import {
    useVirtualList,
    type VirtualListApi,
    type VirtualRow,
} from "./useVirtualList.ts";

export interface UseVirtualFeedOptions<T> {
    items: readonly T[];
    getKey: (item: T) => string;
    estimateSize: (item: T) => number;
    busy: boolean;
    overscan?: number;
    isFocusable?: (item: T) => boolean;
    focusSelector?: string;
    scrollLocked?: boolean;
    scrollElement?: HTMLElement | null;
    onStartReached?: (firstVisibleItem: T) => void;
    onEndReached?: (firstVisibleItem: T) => void;
    edgeItems?: number;
    onFirstVisibleChange?: (item: T) => void;
}

export interface VirtualFeedController<T> {
    rows: readonly { row: VirtualRow; item: T }[];
    getRowProps: VirtualListApi["getRowProps"];
    totalSize: number;
    blockOffset: number;
    onKeyDown: ReturnType<typeof useFeedKeyboard>;
    scrollerRef: RefObject<HTMLDivElement | null>;
    takeOver: () => void;
    // True when the caller's element scrolls, so the feed renders no scroller of its own.
    external: boolean;
    scrollLocked: boolean;
    busy: boolean;
}

const DEFAULT_OVERSCAN = 8;
const DEFAULT_EDGE_ITEMS = 20;
const DEFAULT_FOCUS_SELECTOR = "button";

const setStyle = (element: HTMLElement, overflow: string, anchor: string) => {
    element.style.overflow = overflow;
    element.style.overflowAnchor = anchor;
};

export const useVirtualFeed = <T>({
    items,
    getKey,
    estimateSize,
    busy,
    overscan = DEFAULT_OVERSCAN,
    isFocusable,
    focusSelector = DEFAULT_FOCUS_SELECTOR,
    scrollLocked = false,
    scrollElement,
    onStartReached,
    onEndReached,
    edgeItems = DEFAULT_EDGE_ITEMS,
    onFirstVisibleChange,
}: UseVirtualFeedOptions<T>): {
    scrollToTarget: (key: string, behavior: "instant" | "smooth") => void;
    feedProps: VirtualFeedController<T>;
} => {
    const scrollerRef = useRef<HTMLDivElement>(null);
    const getScroller = (): HTMLElement | null =>
        scrollElement !== undefined ? scrollElement : scrollerRef.current;

    const list = useVirtualList({
        count: items.length,
        getKey: (index) => {
            const item = items[index];
            return item === undefined ? String(index) : getKey(item);
        },
        estimateSize: (index) => {
            const item = items[index];
            return item === undefined ? 0 : estimateSize(item);
        },
        overscan,
        getScrollElement: getScroller,
    });
    const {
        rows,
        blockOffset,
        totalSize,
        visibleRange,
        viewportSize,
        isScrolling,
        getRowProps,
    } = list;

    const visibleFirstItem =
        visibleRange === null ? undefined : items[visibleRange.first];
    const visibleFirstKey =
        visibleFirstItem === undefined ? null : getKey(visibleFirstItem);
    const visibleFirst = visibleRange?.first ?? null;
    const visibleLast = visibleRange?.last ?? null;

    const reportedFirstKeyRef = useRef<string | null>(null);
    const command = useScrollCommand({ list, scrollElement, items });

    useLayoutEffect(() => {
        if (!scrollElement) {
            return;
        }
        setStyle(scrollElement, scrollLocked ? "hidden" : "", "none");
        return () => setStyle(scrollElement, "", "");
    }, [scrollElement, scrollLocked]);

    const onKeyDown = useFeedKeyboard({
        items,
        getKey,
        estimateSize,
        isFocusable,
        focusSelector,
        viewportSize,
        getScroller,
        list,
        command,
    });

    const reportFirst = useEffectEvent(() => {
        if (
            command.isActive() ||
            visibleFirstItem === undefined ||
            onFirstVisibleChange === undefined
        ) {
            return;
        }
        const key = getKey(visibleFirstItem);
        if (key === reportedFirstKeyRef.current) {
            return;
        }
        reportedFirstKeyRef.current = key;
        onFirstVisibleChange(visibleFirstItem);
    });
    const reachEdges = useEffectEvent(() => {
        if (
            busy ||
            command.isActive() ||
            viewportSize === 0 ||
            visibleRange === null ||
            visibleFirstItem === undefined
        ) {
            return;
        }
        if (visibleRange.first < edgeItems) {
            onStartReached?.(visibleFirstItem);
        }
        if (visibleRange.last > items.length - 1 - edgeItems) {
            onEndReached?.(visibleFirstItem);
        }
    });

    // Runs after the settle effect, so it sees the settled position.
    useEffect(() => {
        reportFirst();
    }, [visibleFirstKey, isScrolling, command.tick]);

    useEffect(() => {
        reachEdges();
    }, [
        busy,
        visibleFirst,
        visibleLast,
        items.length,
        edgeItems,
        viewportSize,
        isScrolling,
        command.tick,
    ]);

    const rowsWithItems: { row: VirtualRow; item: T }[] = [];
    for (const row of rows) {
        const item = items[row.index];
        if (item !== undefined) {
            rowsWithItems.push({ row, item });
        }
    }

    return {
        scrollToTarget: command.scrollToTarget,
        feedProps: {
            rows: rowsWithItems,
            getRowProps,
            totalSize,
            blockOffset,
            onKeyDown,
            scrollerRef,
            takeOver: command.takeOver,
            external: scrollElement !== undefined,
            scrollLocked,
            busy,
        },
    };
};
