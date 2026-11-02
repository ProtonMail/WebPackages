import {
    useEffect,
    useEffectEvent,
    useLayoutEffect,
    useRef,
    useState,
} from "react";

import type { VirtualListApi } from "./useVirtualList.ts";

type ScrollBehavior = "instant" | "smooth";

export const COMMAND_TIMEOUT_MS = 2000;

interface ScrollCommand {
    active: boolean;
    moving: boolean;
    timer?: ReturnType<typeof setTimeout>;
}

const disarmCommand = (command: { current: ScrollCommand }) => {
    clearTimeout(command.current.timer);
    command.current = { active: false, moving: false };
};

interface ScrollCommandOptions {
    list: VirtualListApi;
    scrollElement: HTMLElement | null | undefined;
    items: readonly unknown[];
}

const prefersReducedMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const useScrollCommand = (o: ScrollCommandOptions) => {
    const [tick, setTick] = useState(0);
    const { list, scrollElement, items } = o;

    // Held while a list-started scroll runs: paging would change the rows under the glide.
    const commandRef = useRef<ScrollCommand>({ active: false, moving: false });
    // The latest request, kept until it is applied: its key may not be in `items` yet, or the caller's scroller may not exist yet.
    const pendingRef = useRef<{ key: string; behavior: ScrollBehavior } | null>(
        null,
    );
    const recheckEdges = () => setTick((count) => count + 1);

    const start = () => {
        clearTimeout(commandRef.current.timer);
        const armed: ScrollCommand = { active: true, moving: list.isScrolling };
        armed.timer = setTimeout(() => {
            if (commandRef.current === armed && !armed.moving) {
                commandRef.current = { active: false, moving: false };
                recheckEdges();
            }
        }, COMMAND_TIMEOUT_MS);
        commandRef.current = armed;
    };

    const takeOver = () => {
        if (commandRef.current.active) {
            list.cancelScroll();
            disarmCommand(commandRef);
            recheckEdges();
        }
    };

    const applyPending = () => {
        const pending = pendingRef.current;
        // `null` is a caller's scroller that is not there yet; `undefined` is the internal one.
        if (pending === null || scrollElement === null) {
            return;
        }
        const result = list.scrollToKey(pending.key, {
            align: "start",
            smooth: pending.behavior === "smooth" && !prefersReducedMotion(),
        });
        if (result === "missing") {
            return;
        }
        pendingRef.current = null;
        if (result === "scrolling") {
            start();
        }
    };

    // A plain function, so the hook can return it. Call it from an effect or a handler, not during render.
    const scrollToTarget = (key: string, behavior: ScrollBehavior) => {
        pendingRef.current = { key, behavior };
        applyPending();
    };

    // Effect events read the latest render, so they are only called from effects. Event handlers use `list` directly.
    const retryPending = useEffectEvent(applyPending);
    const handleUserScroll = useEffectEvent(takeOver);

    useEffect(() => () => disarmCommand(commandRef), []);

    useLayoutEffect(() => {
        retryPending();
    }, [items, scrollElement]);

    // Wheel, touch and key events on the caller's element never reach the feed, so listen there.
    useEffect(() => {
        if (!scrollElement) {
            return;
        }
        const onUserScroll = () => handleUserScroll();
        scrollElement.addEventListener("wheel", onUserScroll, {
            passive: true,
        });
        scrollElement.addEventListener("touchstart", onUserScroll, {
            passive: true,
        });
        scrollElement.addEventListener("keydown", onUserScroll);
        return () => {
            scrollElement.removeEventListener("wheel", onUserScroll);
            scrollElement.removeEventListener("touchstart", onUserScroll);
            scrollElement.removeEventListener("keydown", onUserScroll);
        };
    }, [scrollElement]);

    useEffect(() => {
        const command = commandRef.current;
        if (!command.active) {
            return;
        }
        if (list.isScrolling) {
            command.moving = true;
        } else if (command.moving) {
            disarmCommand(commandRef);
        }
    }, [list.isScrolling]);

    return {
        isActive: () => commandRef.current.active,
        tick,
        takeOver,
        start,
        scrollToTarget,
    };
};
