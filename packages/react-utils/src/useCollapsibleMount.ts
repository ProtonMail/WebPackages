import { type TransitionEventHandler, useState } from "react";

/**
 * Keeps content mounted while a CSS collapse transition plays out, unmounting
 * only once the element's own transition has ended.
 *
 * Spread the returned `onTransitionEnd` on the element that owns the size
 * transition (the one whose width/margin animates), and gate the children on
 * `mounted`.
 *
 * Pass `skipTransition` when the caller has suppressed the CSS transition for
 * this render (e.g. before the persisted state has hydrated): `onTransitionEnd`
 * won't fire in that case, so `mounted` is synced to `open` immediately in
 * both directions instead of waiting for it.
 */
export const useCollapsibleMount = (open: boolean, skipTransition = false) => {
    const [mounted, setMounted] = useState(open);

    // Adjusted during render so children are present before the first paint.
    if (open && !mounted) {
        setMounted(true);
    }

    // Closing normally waits for onTransitionEnd below.
    // Skip that wait when there's no transition to end (e.g. pre-hydration), or it would never fire.
    if (skipTransition && !open && mounted) {
        setMounted(false);
    }

    const onTransitionEnd: TransitionEventHandler = (e) => {
        // Ignore transitions bubbling up from descendants; only react to the
        // owning element's own collapse.
        if (e.target !== e.currentTarget) return;
        if (!open) setMounted(false);
    };

    return { mounted, onTransitionEnd };
};
