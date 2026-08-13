import { type Ref, type RefCallback, useCallback } from "react";

export const useCombinedRefs = <T>(
    refs: (Ref<T> | undefined)[],
): RefCallback<T> =>
    useCallback(
        (element: T) =>
            refs.forEach((ref) => {
                if (!ref) {
                    return;
                }

                // Ref can have two types - a function or an object. We treat each case.
                if (typeof ref === "function") {
                    return ref(element);
                }

                // As per https://github.com/facebook/react/issues/13029
                // it should be fine to set current this way.
                ref.current = element;
            }),
        [refs],
    );
