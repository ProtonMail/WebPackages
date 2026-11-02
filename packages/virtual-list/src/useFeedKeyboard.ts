import { type KeyboardEvent, useLayoutEffect, useRef } from "react";

import type { VirtualListApi } from "./useVirtualList.ts";

interface FeedKeyboardOptions<T> {
    items: readonly T[];
    getKey: (item: T) => string;
    estimateSize: (item: T) => number;
    isFocusable?: (item: T) => boolean;
    focusSelector: string;
    viewportSize: number;
    getScroller: () => HTMLElement | null;
    list: VirtualListApi;
    command: { takeOver: () => void; start: () => void };
}

// Where a navigation key moves from the row at `from`: the target row's index,
// `from` itself at an edge (the key is still handled), and undefined when the
// key is not navigation or the row is not focusable (the key is left alone).
const nextRowIndex = <T>(
    o: FeedKeyboardOptions<T>,
    key: string,
    from: number,
): number | undefined => {
    const current = o.items[from];
    if (current === undefined || !o.isFocusable?.(current)) {
        return;
    }
    const focusable = o.items.flatMap((item, index) =>
        o.isFocusable?.(item) ? [index] : [],
    );
    const position = focusable.indexOf(from);
    const last = focusable.length - 1;
    const page = Math.max(
        1,
        Math.floor(o.viewportSize / o.estimateSize(current)),
    );
    const moves: Partial<Record<string, number>> = {
        ArrowDown: position + 1,
        ArrowUp: position - 1,
        Home: 0,
        End: last,
        PageDown: position + page,
        PageUp: position - page,
    };
    const next = moves[key];
    return next === undefined
        ? undefined
        : (focusable[Math.min(Math.max(next, 0), last)] ?? from);
};

export const useFeedKeyboard = <T>(o: FeedKeyboardOptions<T>) => {
    const pendingFocusKeyRef = useRef<string | null>(null);
    const findFocusTarget = (index: number) =>
        o
            .getScroller()
            ?.querySelector<HTMLElement>(
                `[data-index="${index}"] ${o.focusSelector}`,
            ) ?? null;

    useLayoutEffect(() => {
        const key = pendingFocusKeyRef.current;
        if (key === null) {
            return;
        }
        const index = o.items.findIndex((item) => o.getKey(item) === key);
        const target = index === -1 ? null : findFocusTarget(index);
        if (target) {
            pendingFocusKeyRef.current = null;
            target.focus();
        }
    });

    return (event: KeyboardEvent<HTMLDivElement>) => {
        o.command.takeOver();
        pendingFocusKeyRef.current = null;
        const row = (event.target as HTMLElement).closest<HTMLElement>(
            "[data-index]",
        );
        if (!row) {
            return;
        }
        const currentIndex = Number(row.dataset.index);
        const targetIndex = nextRowIndex(o, event.key, currentIndex);
        if (targetIndex === undefined) {
            return;
        }
        event.preventDefault();

        const target = o.items[targetIndex];
        if (target === undefined || targetIndex === currentIndex) {
            return;
        }
        const element = findFocusTarget(targetIndex);
        if (element) {
            element.focus();
            return;
        }
        const result = o.list.scrollToKey(o.getKey(target), {
            align: "center",
            smooth: false,
        });
        if (result === "scrolling") {
            pendingFocusKeyRef.current = o.getKey(target);
            o.command.start();
        }
    };
};
