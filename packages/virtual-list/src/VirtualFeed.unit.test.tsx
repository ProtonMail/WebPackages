import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import {
    type ReactNode,
    StrictMode,
    useEffect,
    useEffectEvent,
    useLayoutEffect,
    useState,
} from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COMMAND_TIMEOUT_MS } from "./useScrollCommand.ts";
import {
    type UseVirtualFeedOptions,
    useVirtualFeed,
} from "./useVirtualFeed.ts";
import type { VirtualListOptions } from "./useVirtualList.ts";
import { VirtualFeed } from "./VirtualFeed.tsx";

// happy-dom has no layout, so the hook is replaced by a fake: the tests choose
// which rows are rendered, the visible range and the metrics, and read the
// calls made to the list API.
const fake = vi.hoisted(() => ({
    options: undefined as VirtualListOptions | undefined,
    rendered: null as number[] | null,
    visibleRange: null as { first: number; last: number } | null,
    blockOffset: 0,
    viewportSize: 0,
    totalSize: 0,
    isScrolling: false,
    needsElement: false,
    scrollToKey: vi.fn(
        (
            _key: string,
            _options: { align: "start" | "center"; smooth: boolean },
        ): "missing" | "in-place" | "scrolling" => "scrolling",
    ),
    cancelScroll: vi.fn(),
}));

vi.mock("./useVirtualList.ts", () => ({
    useVirtualList: (options: VirtualListOptions) => {
        fake.options = options;
        const indexes =
            fake.rendered ??
            Array.from({ length: options.count }, (_, index) => index);
        const measured =
            !fake.needsElement || options.getScrollElement() !== null;
        return {
            rows: indexes
                .filter((index) => index < options.count)
                .map((index) => ({
                    index,
                    key: options.getKey(index),
                })),
            blockOffset: fake.blockOffset,
            totalSize: fake.totalSize,
            visibleRange: measured ? fake.visibleRange : null,
            viewportSize: measured ? fake.viewportSize : 0,
            isScrolling: fake.isScrolling,
            getRowProps: (row: { index: number }) => ({
                ref: () => {},
                "data-index": row.index,
            }),
            scrollToKey: fake.scrollToKey,
            cancelScroll: fake.cancelScroll,
        };
    },
}));

interface Item {
    key: string;
    kind: "day" | "entry";
}

const items: Item[] = [
    { key: "day:1", kind: "day" },
    { key: "e1", kind: "entry" },
    { key: "e2", kind: "entry" },
    { key: "day:2", kind: "day" },
    { key: "e3", kind: "entry" },
    { key: "e4", kind: "entry" },
    { key: "e5", kind: "entry" },
    { key: "e6", kind: "entry" },
];

// Long enough for the default edge distance (20 rows) to leave a middle.
const rows: Item[] = Array.from({ length: 100 }, (_, index) => ({
    key: `row${index}`,
    kind: "entry",
}));
const NEAR_START = { first: 0, last: 5 };
const MID_LIST = { first: 50, last: 60 };

interface ScrollTargetRequest {
    key: string;
    id: number;
    behavior: "instant" | "smooth";
}

type FeedProps = Partial<UseVirtualFeedOptions<Item>> & {
    children?: ReactNode;
    // Drives `scrollToTarget` from an effect keyed on `id`, the way the agenda does. A layout effect, so the
    // command is armed before the feed's own effects check the edges, as the old `scrollTarget` prop did.
    scrollTarget?: ScrollTargetRequest | null;
};

// The latest `scrollToTarget` of the mounted harness, for tests that call it themselves.
const harness = {
    scrollToTarget: undefined as
        ((key: string, behavior: "instant" | "smooth") => void) | undefined,
};

const Harness = ({ children, scrollTarget, ...options }: FeedProps) => {
    const { scrollToTarget, feedProps } = useVirtualFeed<Item>({
        items,
        getKey: (item) => item.key,
        estimateSize: (item) => (item.kind === "day" ? 40 : 32),
        busy: false,
        isFocusable: (item) => item.kind === "entry",
        focusSelector: "[data-agenda-row]",
        ...options,
    });
    useEffect(() => {
        harness.scrollToTarget = scrollToTarget;
    });
    const applyScrollTarget = useEffectEvent(() => {
        if (scrollTarget) {
            scrollToTarget(scrollTarget.key, scrollTarget.behavior);
        }
    });
    useLayoutEffect(() => {
        applyScrollTarget();
    }, [scrollTarget?.id]);
    return (
        <VirtualFeed<Item>
            {...feedProps}
            renderItem={(item) =>
                item.kind === "day" ? (
                    <span>{item.key}</span>
                ) : (
                    <button type="button" data-agenda-row="">
                        {item.key}
                    </button>
                )
            }
            aria-label="Agenda"
        >
            {children}
        </VirtualFeed>
    );
};

const feed = (props: FeedProps = {}) => <Harness {...props} />;

const listed = (props: FeedProps = {}) => feed({ items: rows, ...props });

const scrollToTarget = (key: string, behavior: "instant" | "smooth") => {
    act(() => {
        harness.scrollToTarget?.(key, behavior);
    });
};

const setMetrics = (metrics: { viewportSize: number; totalSize: number }) => {
    fake.viewportSize = metrics.viewportSize;
    fake.totalSize = metrics.totalSize;
};

const reducedMotion = { matches: false };
const originalMatchMedia = window.matchMedia;

describe("VirtualFeed", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fake.options = undefined;
        harness.scrollToTarget = undefined;
        fake.rendered = null;
        fake.visibleRange = null;
        fake.blockOffset = 0;
        fake.isScrolling = false;
        fake.needsElement = false;
        fake.scrollToKey.mockImplementation(() => "scrolling");
        setMetrics({ viewportSize: 400, totalSize: 0 });
        reducedMotion.matches = false;
        window.matchMedia = (() => ({
            matches: reducedMotion.matches,
        })) as unknown as typeof window.matchMedia;
    });

    afterEach(() => {
        cleanup();
        window.matchMedia = originalMatchMedia;
    });

    describe("markup", () => {
        it("renders a feed with its label and busy state", () => {
            const { rerender } = render(feed({ busy: true }));

            const scroller = screen.getByRole("feed");
            expect(scroller.getAttribute("aria-label")).toBe("Agenda");
            expect(scroller.getAttribute("aria-busy")).toBe("true");

            rerender(feed({ busy: false }));
            expect(scroller.getAttribute("aria-busy")).toBe("false");
        });

        it("renders each item as an article with its position in the set", () => {
            render(feed());

            const articles = within(screen.getByRole("feed")).getAllByRole(
                "article",
            );
            expect(articles).toHaveLength(items.length);
            expect(
                articles.map((a) => a.getAttribute("aria-posinset")),
            ).toEqual(items.map((_, index) => String(index + 1)));
            expect(
                articles.every((a) => a.getAttribute("aria-setsize") === "-1"),
            ).toBe(true);
            expect(articles[0]?.textContent).toBe("day:1");
        });

        it("keeps the overflow visible while scrolling, hidden while locked", () => {
            const { rerender } = render(feed());

            const scroller = screen.getByRole("feed");
            expect(scroller.style.overflowY).toBe("auto");
            expect(scroller.style.overflow).toBe("");
            expect(scroller.style.height).toBe("100%");
            expect(scroller.style.overscrollBehavior).toBe("contain");
            expect(scroller.style.overflowAnchor).toBe("none");

            rerender(feed({ scrollLocked: true }));
            expect(scroller.style.overflow).toBe("hidden");
        });

        it("sizes the inner box to the total size", () => {
            setMetrics({ viewportSize: 400, totalSize: 1234 });
            render(feed());

            const inner = screen.getByRole("feed")
                .firstElementChild as HTMLElement;
            expect(inner.style.height).toBe("1234px");
            expect(inner.style.position).toBe("relative");
        });

        it("passes the default overscan to the list", () => {
            render(feed());

            expect(fake.options?.overscan).toBe(8);
        });

        it("moves the rendered rows as one block, and the rows carry no position", () => {
            fake.blockOffset = 240;
            fake.rendered = [4, 5];
            render(feed());

            const inner = screen.getByRole("feed")
                .firstElementChild as HTMLElement;
            const block = inner.firstElementChild as HTMLElement;
            expect(block.style.transform).toBe("translateY(240px)");
            expect(block.style.position).toBe("absolute");
            expect(block.children).toHaveLength(2);
            for (const row of Array.from(block.children) as HTMLElement[]) {
                expect(row.style.position).toBe("");
                expect(row.style.transform).toBe("");
            }
        });

        it("uses the overscan it is given", () => {
            render(feed({ overscan: 3 }));

            expect(fake.options?.overscan).toBe(3);
        });

        it("renders children after the feed", () => {
            render(feed({ children: <p>Overlay</p> }));

            expect(screen.getByRole("feed").nextElementSibling).toBe(
                screen.getByText("Overlay"),
            );
        });
    });

    describe("edges", () => {
        it("reports the start edge with the first visible item once fewer than edgeItems rows are above it", () => {
            fake.visibleRange = { first: 19, last: 30 };
            const onStartReached = vi.fn();
            const onEndReached = vi.fn();
            render(listed({ onStartReached, onEndReached }));

            expect(onStartReached).toHaveBeenCalledTimes(1);
            expect(onStartReached).toHaveBeenCalledWith(rows[19]);
            expect(onEndReached).not.toHaveBeenCalled();
        });

        it("reports the end edge with the first visible item once fewer than edgeItems rows are below it", () => {
            fake.visibleRange = { first: 70, last: 80 };
            const onStartReached = vi.fn();
            const onEndReached = vi.fn();
            render(listed({ onStartReached, onEndReached }));

            expect(onEndReached).toHaveBeenCalledTimes(1);
            expect(onEndReached).toHaveBeenCalledWith(rows[70]);
            expect(onStartReached).not.toHaveBeenCalled();
        });

        it("reports nothing at the edge distance, or mid-list", () => {
            const onStartReached = vi.fn();
            const onEndReached = vi.fn();

            fake.visibleRange = { first: 20, last: 79 };
            const { unmount } = render(
                listed({ onStartReached, onEndReached }),
            );
            unmount();

            fake.visibleRange = MID_LIST;
            render(listed({ onStartReached, onEndReached }));

            expect(onStartReached).not.toHaveBeenCalled();
            expect(onEndReached).not.toHaveBeenCalled();
        });

        it("reports both edges when the whole list fits within the edge distance", () => {
            fake.visibleRange = { first: 0, last: items.length - 1 };
            const onStartReached = vi.fn();
            const onEndReached = vi.fn();
            render(feed({ onStartReached, onEndReached }));

            expect(onStartReached).toHaveBeenCalledWith(items[0]);
            expect(onEndReached).toHaveBeenCalledWith(items[0]);
        });

        it("uses the edge distance it is given", () => {
            fake.visibleRange = { first: 5, last: 30 };
            const onStartReached = vi.fn();
            const { unmount } = render(
                listed({ edgeItems: 5, onStartReached }),
            );
            expect(onStartReached).not.toHaveBeenCalled();
            unmount();

            fake.visibleRange = { first: 4, last: 30 };
            render(listed({ edgeItems: 5, onStartReached }));
            expect(onStartReached).toHaveBeenCalledWith(rows[4]);
        });

        it("reports nothing with no viewport, without items, or without a visible range", () => {
            const onStartReached = vi.fn();
            const onEndReached = vi.fn();

            fake.visibleRange = NEAR_START;
            setMetrics({ viewportSize: 0, totalSize: 0 });
            const withoutViewport = render(
                listed({ onStartReached, onEndReached }),
            );
            withoutViewport.unmount();

            setMetrics({ viewportSize: 400, totalSize: 0 });
            const withoutItems = render(
                listed({ items: [], onStartReached, onEndReached }),
            );
            withoutItems.unmount();

            fake.visibleRange = null;
            render(listed({ onStartReached, onEndReached }));

            expect(onStartReached).not.toHaveBeenCalled();
            expect(onEndReached).not.toHaveBeenCalled();
        });

        it("reports nothing while busy, and reports again once busy turns false", () => {
            fake.visibleRange = NEAR_START;
            const onStartReached = vi.fn();
            const { rerender } = render(listed({ busy: true, onStartReached }));
            expect(onStartReached).not.toHaveBeenCalled();

            rerender(listed({ busy: false, onStartReached }));
            expect(onStartReached).toHaveBeenCalledTimes(1);
            expect(onStartReached).toHaveBeenCalledWith(rows[0]);
        });

        it("checks again when the item count changes", () => {
            fake.visibleRange = MID_LIST;
            const onEndReached = vi.fn();
            const { rerender } = render(listed({ onEndReached }));
            expect(onEndReached).not.toHaveBeenCalled();

            rerender(listed({ items: rows.slice(0, 65), onEndReached }));
            expect(onEndReached).toHaveBeenCalledWith(rows[50]);
        });
    });

    describe("programmatic scrolls", () => {
        const target = { key: "row40", id: 1, behavior: "smooth" as const };

        it("reports no edge while a scroll target glides, and checks again once it settles", () => {
            fake.visibleRange = NEAR_START;
            const onStartReached = vi.fn();
            const { rerender } = render(
                listed({ scrollTarget: target, onStartReached }),
            );
            expect(onStartReached).not.toHaveBeenCalled();

            fake.isScrolling = true;
            fake.visibleRange = { first: 3, last: 8 };
            rerender(listed({ scrollTarget: target, onStartReached }));
            expect(onStartReached).not.toHaveBeenCalled();

            fake.isScrolling = false;
            rerender(listed({ scrollTarget: target, onStartReached }));
            expect(onStartReached).toHaveBeenCalledTimes(1);
            expect(onStartReached).toHaveBeenCalledWith(rows[3]);
        });

        it("resumes edge reports once a second target's glide settles, even if the first was still moving", () => {
            fake.visibleRange = MID_LIST;
            const onStartReached = vi.fn();
            const { rerender } = render(
                listed({ scrollTarget: target, onStartReached }),
            );
            fake.isScrolling = true;
            rerender(listed({ scrollTarget: target, onStartReached }));
            rerender(
                listed({
                    scrollTarget: { ...target, id: 2 },
                    onStartReached,
                }),
            );

            fake.visibleRange = NEAR_START;
            fake.isScrolling = false;
            rerender(
                listed({
                    scrollTarget: { ...target, id: 2 },
                    onStartReached,
                }),
            );

            expect(onStartReached).toHaveBeenCalledWith(rows[0]);
        });

        it("does not hold the edges for a scroll target already in place", () => {
            fake.visibleRange = NEAR_START;
            fake.scrollToKey.mockImplementation(() => "in-place");
            const onStartReached = vi.fn();
            const { rerender } = render(
                listed({ scrollTarget: target, onStartReached }),
            );
            expect(onStartReached).toHaveBeenCalledTimes(1);

            rerender(
                listed({
                    scrollTarget: { ...target, id: 2 },
                    onStartReached,
                }),
            );
            expect(onStartReached).toHaveBeenCalledTimes(1);
            expect(fake.scrollToKey).toHaveBeenCalledTimes(2);
        });

        it("reports no edge during a keyboard move to a row that is not rendered", () => {
            fake.viewportSize = 64;
            fake.rendered = [0, 1, 2];
            fake.visibleRange = { first: 0, last: 2 };
            const onStartReached = vi.fn();
            const { rerender } = render(feed({ onStartReached }));
            expect(onStartReached).toHaveBeenCalledTimes(1);
            onStartReached.mockClear();

            fireEvent.keyDown(screen.getByRole("button", { name: "e2" }), {
                key: "PageDown",
            });
            expect(fake.scrollToKey).toHaveBeenCalledWith("e4", {
                align: "center",
                smooth: false,
            });

            fake.visibleRange = { first: 1, last: 3 };
            fake.isScrolling = true;
            rerender(feed({ onStartReached }));
            expect(onStartReached).not.toHaveBeenCalled();

            fake.isScrolling = false;
            rerender(feed({ onStartReached }));
            expect(onStartReached).toHaveBeenCalledTimes(1);
        });

        it.each([
            ["wheel", (scroller: HTMLElement) => fireEvent.wheel(scroller)],
            [
                "touchstart",
                (scroller: HTMLElement) => fireEvent.touchStart(scroller),
            ],
            [
                "keydown",
                (scroller: HTMLElement) =>
                    fireEvent.keyDown(scroller, { key: "Tab" }),
            ],
        ])(
            "takes over a scroll target on %s, and reports the edge after the user's scroll",
            (_, gesture) => {
                fake.visibleRange = MID_LIST;
                const onStartReached = vi.fn();
                const { rerender } = render(
                    listed({ scrollTarget: target, onStartReached }),
                );

                gesture(screen.getByRole("feed"));
                expect(fake.cancelScroll).toHaveBeenCalledTimes(1);

                fake.visibleRange = NEAR_START;
                rerender(listed({ scrollTarget: target, onStartReached }));
                expect(onStartReached).toHaveBeenCalledWith(rows[0]);
            },
        );

        it("cancels nothing on a gesture when no scroll is in flight", () => {
            fake.visibleRange = MID_LIST;
            render(listed());

            fireEvent.wheel(screen.getByRole("feed"));

            expect(fake.cancelScroll).not.toHaveBeenCalled();
        });

        it("checks the edges again when a gesture takes over a command that never moved", () => {
            fake.visibleRange = NEAR_START;
            const onStartReached = vi.fn();
            render(listed({ scrollTarget: target, onStartReached }));
            expect(onStartReached).not.toHaveBeenCalled();

            fireEvent.wheel(screen.getByRole("feed"));

            expect(fake.cancelScroll).toHaveBeenCalledTimes(1);
            expect(onStartReached).toHaveBeenCalledWith(rows[0]);
        });
    });

    describe("scroll target", () => {
        const withDay3 = [...items, { key: "day:3", kind: "day" as const }];

        it("scrolls to nothing until scrollToTarget is called", () => {
            render(feed());

            expect(fake.scrollToKey).not.toHaveBeenCalled();
        });

        it("jumps to an instant target", () => {
            render(feed());

            scrollToTarget("day:2", "instant");

            expect(fake.scrollToKey).toHaveBeenCalledTimes(1);
            expect(fake.scrollToKey).toHaveBeenCalledWith("day:2", {
                align: "start",
                smooth: false,
            });
        });

        it("glides to a smooth target", () => {
            render(feed());

            scrollToTarget("day:2", "smooth");

            expect(fake.scrollToKey).toHaveBeenCalledWith("day:2", {
                align: "start",
                smooth: true,
            });
        });

        it("starts a scroll command that a gesture takes over", () => {
            render(listed());

            scrollToTarget("row40", "smooth");

            fireEvent.wheel(screen.getByRole("feed"));
            expect(fake.cancelScroll).toHaveBeenCalledTimes(1);
        });

        it("scrolls again for a repeated call with the same key, with its own behavior", () => {
            render(feed());

            scrollToTarget("day:2", "instant");
            scrollToTarget("day:2", "smooth");
            scrollToTarget("day:2", "smooth");

            expect(fake.scrollToKey).toHaveBeenCalledTimes(3);
            expect(
                fake.scrollToKey.mock.calls.map(([, opts]) => opts.smooth),
            ).toEqual([false, true, true]);
        });

        it("stays instant under reduced motion, whatever the behavior asks", () => {
            reducedMotion.matches = true;
            render(feed());

            scrollToTarget("day:2", "smooth");
            scrollToTarget("day:2", "smooth");

            expect(fake.scrollToKey).toHaveBeenCalledTimes(2);
            for (const [, opts] of fake.scrollToKey.mock.calls) {
                expect(opts).toEqual({ align: "start", smooth: false });
            }
        });

        it("does not apply a request again when items change after it was applied", () => {
            const { rerender } = render(feed());
            scrollToTarget("day:2", "instant");

            rerender(feed({ items: withDay3 }));

            expect(fake.scrollToKey).toHaveBeenCalledTimes(1);
        });

        it("does not apply a request again when it was already in place", () => {
            fake.scrollToKey.mockImplementation(() => "in-place");
            const { rerender } = render(feed());
            scrollToTarget("day:2", "instant");

            rerender(feed({ items: withDay3 }));

            expect(fake.scrollToKey).toHaveBeenCalledTimes(1);
        });

        it.each([
            ["instant", false],
            ["smooth", true],
        ] as const)(
            "keeps a %s request pending while its key is missing, and applies it once, as asked, when items change",
            (behavior, smooth) => {
                fake.scrollToKey.mockImplementationOnce(() => "missing");
                const { rerender } = render(feed());
                scrollToTarget("day:3", behavior);
                expect(fake.scrollToKey).toHaveBeenCalledTimes(1);

                rerender(feed());
                expect(fake.scrollToKey).toHaveBeenCalledTimes(1);

                rerender(feed({ items: withDay3 }));
                expect(fake.scrollToKey).toHaveBeenCalledTimes(2);
                expect(fake.scrollToKey).toHaveBeenLastCalledWith("day:3", {
                    align: "start",
                    smooth,
                });

                rerender(
                    feed({
                        items: [...withDay3, { key: "day:4", kind: "day" }],
                    }),
                );
                expect(fake.scrollToKey).toHaveBeenCalledTimes(2);
            },
        );

        it("keeps only the latest request while an earlier one is pending", () => {
            fake.scrollToKey
                .mockImplementationOnce(() => "missing")
                .mockImplementationOnce(() => "missing");
            const { rerender } = render(feed());
            scrollToTarget("day:3", "instant");
            scrollToTarget("day:4", "smooth");

            rerender(
                feed({ items: [...withDay3, { key: "day:4", kind: "day" }] }),
            );

            expect(fake.scrollToKey).toHaveBeenCalledTimes(3);
            expect(fake.scrollToKey).toHaveBeenLastCalledWith("day:4", {
                align: "start",
                smooth: true,
            });
        });

        it("applies a request made while another is pending when its key exists", () => {
            fake.scrollToKey.mockImplementationOnce(() => "missing");
            const { rerender } = render(feed());
            scrollToTarget("day:3", "instant");

            scrollToTarget("day:2", "instant");
            rerender(feed({ items: withDay3 }));

            expect(fake.scrollToKey.mock.calls.map(([key]) => key)).toEqual([
                "day:3",
                "day:2",
            ]);
        });

        it("starts the scroll command only once a pending request is applied", () => {
            fake.scrollToKey.mockImplementationOnce(() => "missing");
            const { rerender } = render(listed());

            scrollToTarget("row40", "smooth");
            fireEvent.wheel(screen.getByRole("feed"));
            expect(fake.cancelScroll).not.toHaveBeenCalled();

            rerender(listed({ items: [...rows] }));
            fireEvent.wheel(screen.getByRole("feed"));
            expect(fake.cancelScroll).toHaveBeenCalledTimes(1);
        });

        it("applies the request of the caller's effect again after StrictMode's remount", () => {
            fake.visibleRange = NEAR_START;
            const onStartReached = vi.fn();
            render(
                <StrictMode>
                    {feed({
                        scrollTarget: {
                            key: "day:2",
                            id: 1,
                            behavior: "instant",
                        },
                        onStartReached,
                    })}
                </StrictMode>,
            );

            expect(fake.scrollToKey).toHaveBeenCalledTimes(2);
            for (const [key, opts] of fake.scrollToKey.mock.calls) {
                expect(key).toBe("day:2");
                expect(opts).toEqual({ align: "start", smooth: false });
            }
            expect(onStartReached).not.toHaveBeenCalled();
        });

        it("does not apply the request again when items change under StrictMode", () => {
            const target = {
                key: "day:2",
                id: 1,
                behavior: "instant" as const,
            };
            const { rerender } = render(
                <StrictMode>{feed({ scrollTarget: target })}</StrictMode>,
            );
            const applied = fake.scrollToKey.mock.calls.length;
            expect(applied).toBe(2);

            rerender(
                <StrictMode>
                    {feed({ items: withDay3, scrollTarget: target })}
                </StrictMode>,
            );

            expect(fake.scrollToKey).toHaveBeenCalledTimes(applied);
        });

        it("keeps a missing request pending after StrictMode's remount, and applies it once it appears", () => {
            // The caller's effect runs twice, and the remount's layout effect retries in between.
            fake.scrollToKey
                .mockReturnValueOnce("missing")
                .mockReturnValueOnce("missing")
                .mockReturnValueOnce("missing");
            const target = {
                key: "day:3",
                id: 1,
                behavior: "instant" as const,
            };
            const { rerender } = render(
                <StrictMode>{feed({ scrollTarget: target })}</StrictMode>,
            );
            const attempts = fake.scrollToKey.mock.calls.length;

            rerender(<StrictMode>{feed({ scrollTarget: target })}</StrictMode>);
            expect(fake.scrollToKey).toHaveBeenCalledTimes(attempts);

            rerender(
                <StrictMode>
                    {feed({ items: withDay3, scrollTarget: target })}
                </StrictMode>,
            );
            expect(fake.scrollToKey).toHaveBeenCalledTimes(attempts + 1);
            expect(fake.scrollToKey).toHaveBeenLastCalledWith("day:3", {
                align: "start",
                smooth: false,
            });
        });

        it("stops retrying under StrictMode once the request is applied, even when its key is missing at first", () => {
            fake.scrollToKey.mockImplementationOnce(() => "missing");
            const target = {
                key: "day:3",
                id: 1,
                behavior: "instant" as const,
            };
            const { rerender } = render(
                <StrictMode>{feed({ scrollTarget: target })}</StrictMode>,
            );
            const outcomes = () =>
                fake.scrollToKey.mock.results.map(
                    (result): unknown => result.value,
                );
            expect(outcomes()[0]).toBe("missing");
            expect(outcomes().at(-1)).toBe("scrolling");
            const attempts = outcomes().length;

            rerender(
                <StrictMode>
                    {feed({ items: withDay3, scrollTarget: target })}
                </StrictMode>,
            );

            expect(outcomes()).toHaveLength(attempts);
        });
    });

    describe("scroll command timeout", () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        const target = { key: "row40", id: 1, behavior: "smooth" as const };

        it("drops a command that never moves once the timeout ends, and checks the edges again", () => {
            fake.visibleRange = NEAR_START;
            const onStartReached = vi.fn();
            render(listed({ scrollTarget: target, onStartReached }));
            expect(onStartReached).not.toHaveBeenCalled();

            act(() => {
                vi.advanceTimersByTime(COMMAND_TIMEOUT_MS - 1);
            });
            expect(onStartReached).not.toHaveBeenCalled();

            act(() => {
                vi.advanceTimersByTime(1);
            });
            expect(onStartReached).toHaveBeenCalledWith(rows[0]);
        });

        it("keeps a command that has moved until it settles, past the timeout", () => {
            fake.visibleRange = NEAR_START;
            const onStartReached = vi.fn();
            const { rerender } = render(
                listed({ scrollTarget: target, onStartReached }),
            );

            fake.isScrolling = true;
            fake.visibleRange = { first: 3, last: 8 };
            rerender(listed({ scrollTarget: target, onStartReached }));
            act(() => {
                vi.advanceTimersByTime(COMMAND_TIMEOUT_MS * 2);
            });
            expect(onStartReached).not.toHaveBeenCalled();

            fake.isScrolling = false;
            rerender(listed({ scrollTarget: target, onStartReached }));
            expect(onStartReached).toHaveBeenCalledTimes(1);
        });

        it("does not expire a command that already settled", () => {
            fake.visibleRange = NEAR_START;
            const onStartReached = vi.fn();
            const { rerender } = render(
                listed({ scrollTarget: target, onStartReached }),
            );
            fake.isScrolling = true;
            rerender(listed({ scrollTarget: target, onStartReached }));
            fake.isScrolling = false;
            rerender(listed({ scrollTarget: target, onStartReached }));
            expect(onStartReached).toHaveBeenCalledTimes(1);

            act(() => {
                vi.advanceTimersByTime(COMMAND_TIMEOUT_MS * 2);
            });
            expect(onStartReached).toHaveBeenCalledTimes(1);
        });
    });

    describe("first visible item", () => {
        it("reports the first visible item on mount, and again when its key changes", () => {
            fake.visibleRange = { first: 0, last: 2 };
            const onFirstVisibleChange = vi.fn();
            const { rerender } = render(feed({ onFirstVisibleChange }));

            expect(onFirstVisibleChange).toHaveBeenCalledTimes(1);
            expect(onFirstVisibleChange).toHaveBeenLastCalledWith(items[0]);

            fake.visibleRange = { first: 3, last: 5 };
            rerender(feed({ onFirstVisibleChange }));

            expect(onFirstVisibleChange).toHaveBeenCalledTimes(2);
            expect(onFirstVisibleChange).toHaveBeenLastCalledWith(items[3]);
        });

        it("does not report the same key twice, even when the position moves within it", () => {
            fake.visibleRange = { first: 0, last: 2 };
            const onFirstVisibleChange = vi.fn();
            const { rerender } = render(feed({ onFirstVisibleChange }));

            fake.visibleRange = { first: 0, last: 4 };
            fake.isScrolling = true;
            rerender(feed({ onFirstVisibleChange }));
            fake.isScrolling = false;
            rerender(feed({ onFirstVisibleChange }));

            expect(onFirstVisibleChange).toHaveBeenCalledTimes(1);
        });

        it("reports nothing while the visible range is unknown", () => {
            fake.visibleRange = null;
            const onFirstVisibleChange = vi.fn();
            render(feed({ onFirstVisibleChange }));

            expect(onFirstVisibleChange).not.toHaveBeenCalled();
        });

        it("holds the report during a scroll command, then reports where it settled", () => {
            fake.visibleRange = { first: 0, last: 2 };
            const onFirstVisibleChange = vi.fn();
            const target = {
                key: "day:2",
                id: 1,
                behavior: "smooth" as const,
            };
            const { rerender } = render(
                feed({ scrollTarget: target, onFirstVisibleChange }),
            );
            expect(onFirstVisibleChange).not.toHaveBeenCalled();

            fake.isScrolling = true;
            fake.visibleRange = { first: 3, last: 5 };
            rerender(feed({ scrollTarget: target, onFirstVisibleChange }));
            expect(onFirstVisibleChange).not.toHaveBeenCalled();

            fake.isScrolling = false;
            rerender(feed({ scrollTarget: target, onFirstVisibleChange }));
            expect(onFirstVisibleChange).toHaveBeenCalledTimes(1);
            expect(onFirstVisibleChange).toHaveBeenCalledWith(items[3]);
        });
    });

    describe("keyboard", () => {
        beforeEach(() => {
            fake.viewportSize = 64;
        });

        const rowButton = (key: string) =>
            screen.getByRole("button", { name: key });

        it("moves between focusable rows with the arrow keys", () => {
            render(feed());
            rowButton("e1").focus();

            const notPrevented = fireEvent.keyDown(rowButton("e1"), {
                key: "ArrowDown",
            });
            expect(notPrevented).toBe(false);
            expect(document.activeElement).toBe(rowButton("e2"));

            fireEvent.keyDown(rowButton("e2"), { key: "ArrowDown" });
            expect(document.activeElement).toBe(rowButton("e3"));

            fireEvent.keyDown(rowButton("e3"), { key: "ArrowUp" });
            expect(document.activeElement).toBe(rowButton("e2"));
        });

        it("stays on the first and last focusable rows", () => {
            render(feed());
            rowButton("e1").focus();

            // Handled even though nothing moves, so the scroller does not scroll.
            const firstNotPrevented = fireEvent.keyDown(rowButton("e1"), {
                key: "ArrowUp",
            });
            expect(firstNotPrevented).toBe(false);
            expect(document.activeElement).toBe(rowButton("e1"));

            rowButton("e6").focus();
            const lastNotPrevented = fireEvent.keyDown(rowButton("e6"), {
                key: "ArrowDown",
            });
            expect(lastNotPrevented).toBe(false);
            expect(document.activeElement).toBe(rowButton("e6"));
        });

        it("goes to the first and last focusable rows with Home and End", () => {
            render(feed());
            rowButton("e2").focus();

            fireEvent.keyDown(rowButton("e2"), { key: "End" });
            expect(document.activeElement).toBe(rowButton("e6"));

            fireEvent.keyDown(rowButton("e6"), { key: "Home" });
            expect(document.activeElement).toBe(rowButton("e1"));
        });

        it("moves by a screenful of focusable rows with the page keys", () => {
            render(feed());
            rowButton("e1").focus();

            fireEvent.keyDown(rowButton("e1"), { key: "PageDown" });
            expect(document.activeElement).toBe(rowButton("e3"));

            fireEvent.keyDown(rowButton("e3"), { key: "PageUp" });
            expect(document.activeElement).toBe(rowButton("e1"));
        });

        it("ignores keys on rows that are not focusable", () => {
            render(feed());
            rowButton("e1").focus();

            const header = screen.getByText("day:2");
            const notPrevented = fireEvent.keyDown(header, {
                key: "ArrowDown",
            });

            expect(notPrevented).toBe(true);
            expect(document.activeElement).toBe(rowButton("e1"));
        });

        it("does not handle keys it has no binding for", () => {
            render(feed());
            rowButton("e1").focus();

            const notPrevented = fireEvent.keyDown(rowButton("e1"), {
                key: "a",
            });

            expect(notPrevented).toBe(true);
            expect(document.activeElement).toBe(rowButton("e1"));
        });

        it("scrolls to a row that is not rendered, then focuses it once it renders", () => {
            fake.rendered = [0, 1, 2];
            const { rerender } = render(feed());
            rowButton("e2").focus();

            fireEvent.keyDown(rowButton("e2"), { key: "PageDown" });
            expect(fake.scrollToKey).toHaveBeenCalledWith("e4", {
                align: "center",
                smooth: false,
            });
            expect(document.activeElement).toBe(rowButton("e2"));

            fake.rendered = null;
            rerender(feed());

            expect(document.activeElement).toBe(rowButton("e4"));
        });
    });

    describe("external scroller", () => {
        const Host = (props: FeedProps) => {
            const [element, setElement] = useState<HTMLElement | null>(null);
            return (
                <div ref={setElement} data-testid="scroller">
                    {feed({ ...props, scrollElement: element })}
                </div>
            );
        };
        const scroller = () => screen.getByTestId("scroller");

        it("renders the feed as the content of the caller's element, with no scroller of its own", () => {
            setMetrics({ viewportSize: 400, totalSize: 1234 });
            render(<Host />);

            const content = screen.getByRole("feed");
            expect(scroller().firstElementChild).toBe(content);
            expect(content.style.height).toBe("1234px");
            expect(content.style.overflowY).toBe("");
            expect(content.style.overflow).toBe("");
            expect(scroller().style.overflowAnchor).toBe("none");
            expect(scroller().style.overflow).toBe("");
            expect(fake.options?.getScrollElement()).toBe(scroller());
        });

        it("applies the lock to the caller's element, and releases it", () => {
            const { rerender } = render(<Host />);

            rerender(<Host scrollLocked />);
            expect(scroller().style.overflow).toBe("hidden");

            rerender(<Host scrollLocked={false} />);
            expect(scroller().style.overflow).toBe("");
        });

        it("applies a scroll target only once the element exists, and jumps to it", () => {
            const seen: (HTMLElement | null)[] = [];
            fake.scrollToKey.mockImplementation(() => {
                seen.push(fake.options?.getScrollElement() ?? null);
                return "scrolling";
            });
            render(
                <Host
                    scrollTarget={{ key: "day:2", id: 1, behavior: "instant" }}
                />,
            );

            expect(seen).toEqual([scroller()]);
            expect(fake.scrollToKey).toHaveBeenCalledWith("day:2", {
                align: "start",
                smooth: false,
            });
        });

        it("keeps a request pending while the caller's element is null, and applies it once, as asked, when it arrives", () => {
            fake.needsElement = true;
            const seen: (HTMLElement | null)[] = [];
            fake.scrollToKey.mockImplementation(() => {
                seen.push(fake.options?.getScrollElement() ?? null);
                return "scrolling";
            });
            const element = document.createElement("div");
            const { rerender } = render(feed({ scrollElement: null }));

            scrollToTarget("day:2", "smooth");
            expect(fake.scrollToKey).not.toHaveBeenCalled();

            rerender(feed({ scrollElement: element }));
            expect(seen).toEqual([element]);
            expect(fake.scrollToKey).toHaveBeenCalledWith("day:2", {
                align: "start",
                smooth: true,
            });

            rerender(feed({ scrollElement: element, items: [...items] }));
            expect(fake.scrollToKey).toHaveBeenCalledTimes(1);
        });

        it("does not apply a request again when the caller's element changes after it was applied", () => {
            const first = document.createElement("div");
            const second = document.createElement("div");
            const { rerender } = render(feed({ scrollElement: first }));
            scrollToTarget("day:2", "instant");
            expect(fake.scrollToKey).toHaveBeenCalledTimes(1);

            rerender(feed({ scrollElement: second }));

            expect(fake.scrollToKey).toHaveBeenCalledTimes(1);
        });

        it.each([
            ["wheel", (el: HTMLElement) => fireEvent.wheel(el)],
            ["touchstart", (el: HTMLElement) => fireEvent.touchStart(el)],
            [
                "keydown",
                (el: HTMLElement) => fireEvent.keyDown(el, { key: "PageDown" }),
            ],
        ])(
            "takes over a running scroll on %s at the element itself",
            (_, gesture) => {
                const { rerender } = render(
                    <Host
                        scrollTarget={{
                            key: "day:2",
                            id: 1,
                            behavior: "instant",
                        }}
                    />,
                );
                rerender(
                    <Host
                        scrollTarget={{
                            key: "day:2",
                            id: 2,
                            behavior: "instant",
                        }}
                    />,
                );

                gesture(scroller());
                expect(fake.cancelScroll).toHaveBeenCalledTimes(1);
            },
        );

        it("keeps the roving focus between the rows", () => {
            render(<Host />);
            const e1 = screen.getByRole("button", { name: "e1" });
            e1.focus();

            fireEvent.keyDown(e1, { key: "ArrowDown" });

            expect(document.activeElement).toBe(
                screen.getByRole("button", { name: "e2" }),
            );
        });

        it("checks the edges again when a wheel takes over a command that never moved", () => {
            fake.needsElement = true;
            fake.visibleRange = NEAR_START;
            const onStartReached = vi.fn();
            const target = { key: "row40", id: 1, behavior: "smooth" as const };
            render(
                <Host
                    items={rows}
                    scrollTarget={target}
                    onStartReached={onStartReached}
                />,
            );
            expect(onStartReached).not.toHaveBeenCalled();

            fireEvent.wheel(scroller());

            expect(fake.cancelScroll).toHaveBeenCalledTimes(1);
            expect(onStartReached).toHaveBeenCalledWith(rows[0]);
        });

        describe("listeners and element changes", () => {
            const TAKE_OVER_EVENTS = ["wheel", "touchstart", "keydown"];
            const spies: { mockRestore: () => void }[] = [];

            afterEach(() => {
                for (const spy of spies.splice(0)) {
                    spy.mockRestore();
                }
            });

            const recordListeners = (
                method: "addEventListener" | "removeEventListener",
            ) => {
                const calls: {
                    target: EventTarget;
                    type: string;
                    listener: unknown;
                    options: unknown;
                }[] = [];
                const original = HTMLElement.prototype[method];
                const spy = vi
                    .spyOn(HTMLElement.prototype, method)
                    .mockImplementation(function (
                        this: HTMLElement,
                        type: string,
                        listener: unknown,
                        options?: unknown,
                    ) {
                        calls.push({ target: this, type, listener, options });
                        Reflect.apply(original, this, [
                            type,
                            listener,
                            options,
                        ]);
                    });
                spies.push(spy);
                return calls;
            };

            it("adds its three listeners to the element once under StrictMode, and removes them on unmount", () => {
                const added = recordListeners("addEventListener");
                const removed = recordListeners("removeEventListener");
                const { unmount } = render(
                    <StrictMode>
                        <Host />
                    </StrictMode>,
                );
                const element = scroller();
                const onElement = (calls: typeof added) =>
                    calls.filter(
                        (call) =>
                            call.target === element &&
                            TAKE_OVER_EVENTS.includes(call.type),
                    );

                expect(
                    onElement(added)
                        .map((call) => call.type)
                        .sort(),
                ).toEqual(["keydown", "touchstart", "wheel"]);
                expect(onElement(removed)).toHaveLength(0);
                for (const type of ["wheel", "touchstart"]) {
                    expect(
                        onElement(added).find((call) => call.type === type)
                            ?.options,
                    ).toEqual({ passive: true });
                }

                unmount();

                const removedFromElement = onElement(removed);
                expect(removedFromElement).toHaveLength(3);
                for (const add of onElement(added)) {
                    expect(
                        removedFromElement.some(
                            (remove) =>
                                remove.type === add.type &&
                                remove.listener === add.listener,
                        ),
                    ).toBe(true);
                }
            });

            it("moves its listeners off the old element when the caller's element changes", () => {
                const added = recordListeners("addEventListener");
                const removed = recordListeners("removeEventListener");
                const first = document.createElement("div");
                const second = document.createElement("div");
                const { rerender } = render(feed({ scrollElement: first }));

                rerender(feed({ scrollElement: second }));

                expect(
                    removed
                        .filter((call) => call.target === first)
                        .map((call) => call.type)
                        .sort(),
                ).toEqual(["keydown", "touchstart", "wheel"]);
                expect(
                    added.filter((call) => call.target === second),
                ).toHaveLength(3);
                expect(
                    removed.filter((call) => call.target === second),
                ).toHaveLength(0);
            });

            it("restores the old element's overflow and scroll anchoring when the caller's element changes", () => {
                const first = document.createElement("div");
                const second = document.createElement("div");
                const { rerender } = render(
                    feed({ scrollElement: first, scrollLocked: true }),
                );
                expect(first.style.overflow).toBe("hidden");

                rerender(feed({ scrollElement: second }));

                expect(first.style.overflow).toBe("");
                expect(first.style.overflowAnchor).toBe("");
                expect(second.style.overflow).toBe("");
                expect(second.style.overflowAnchor).toBe("none");
            });

            it("unlocks the caller's element and restores its scroll anchoring on unmount", () => {
                const element = document.createElement("div");
                const { unmount } = render(
                    feed({ scrollElement: element, scrollLocked: true }),
                );
                expect(element.style.overflow).toBe("hidden");
                expect(element.style.overflowAnchor).toBe("none");

                unmount();

                expect(element.style.overflow).toBe("");
                expect(element.style.overflowAnchor).toBe("");
            });

            it("reports no edge and no first visible item while the element is missing, and reports them once it arrives", () => {
                fake.needsElement = true;
                fake.visibleRange = NEAR_START;
                const onStartReached = vi.fn();
                const onFirstVisibleChange = vi.fn();
                const { rerender } = render(
                    listed({
                        scrollElement: null,
                        onStartReached,
                        onFirstVisibleChange,
                    }),
                );

                expect(onStartReached).not.toHaveBeenCalled();
                expect(onFirstVisibleChange).not.toHaveBeenCalled();

                rerender(
                    listed({
                        scrollElement: document.createElement("div"),
                        onStartReached,
                        onFirstVisibleChange,
                    }),
                );

                expect(onStartReached).toHaveBeenCalledTimes(1);
                expect(onStartReached).toHaveBeenCalledWith(rows[0]);
                expect(onFirstVisibleChange).toHaveBeenCalledTimes(1);
                expect(onFirstVisibleChange).toHaveBeenCalledWith(rows[0]);
            });

            it("applies a target once, as asked, under StrictMode while the caller's element arrives later", () => {
                render(
                    <StrictMode>
                        <Host
                            scrollTarget={{
                                key: "day:2",
                                id: 1,
                                behavior: "instant",
                            }}
                        />
                    </StrictMode>,
                );

                expect(fake.scrollToKey).toHaveBeenCalledTimes(1);
                expect(fake.scrollToKey).toHaveBeenCalledWith("day:2", {
                    align: "start",
                    smooth: false,
                });
            });

            it("applies the target again after StrictMode's remount when the element is there at mount", () => {
                const element = document.createElement("div");
                render(
                    <StrictMode>
                        {feed({
                            scrollElement: element,
                            scrollTarget: {
                                key: "day:2",
                                id: 1,
                                behavior: "instant",
                            },
                        })}
                    </StrictMode>,
                );

                expect(fake.scrollToKey).toHaveBeenCalledTimes(2);
                for (const [, opts] of fake.scrollToKey.mock.calls) {
                    expect(opts).toEqual({ align: "start", smooth: false });
                }
            });
        });
    });
});
