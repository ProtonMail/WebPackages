import { cleanup, fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { useCollapsibleMount } from "./useCollapsibleMount.ts";

const Test = ({
    open,
    skipTransition,
}: {
    open: boolean;
    skipTransition?: boolean;
}) => {
    const { mounted, onTransitionEnd } = useCollapsibleMount(
        open,
        skipTransition,
    );

    return createElement(
        "div",
        { "data-testid": "outer", onTransitionEnd },
        mounted && createElement("div", { "data-testid": "inner" }),
    );
};

describe("useCollapsibleMount", () => {
    afterEach(cleanup);

    it("mounts immediately when initially open", () => {
        const { queryByTestId } = render(createElement(Test, { open: true }));
        expect(queryByTestId("inner")).not.toBeNull();
    });

    it("does not mount when initially closed", () => {
        const { queryByTestId } = render(createElement(Test, { open: false }));
        expect(queryByTestId("inner")).toBeNull();
    });

    it("mounts synchronously when open flips to true, without waiting for a transition", () => {
        const { queryByTestId, rerender } = render(
            createElement(Test, { open: false }),
        );
        rerender(createElement(Test, { open: true }));
        expect(queryByTestId("inner")).not.toBeNull();
    });

    it("stays mounted after open flips to false until the transition ends", () => {
        const { queryByTestId, getByTestId, rerender } = render(
            createElement(Test, { open: true }),
        );
        rerender(createElement(Test, { open: false }));
        expect(queryByTestId("inner")).not.toBeNull();

        fireEvent.transitionEnd(getByTestId("outer"));
        expect(queryByTestId("inner")).toBeNull();
    });

    it("ignores transitionEnd events bubbling up from descendants", () => {
        const { queryByTestId, getByTestId, rerender } = render(
            createElement(Test, { open: true }),
        );
        rerender(createElement(Test, { open: false }));

        fireEvent.transitionEnd(getByTestId("inner"));
        expect(queryByTestId("inner")).not.toBeNull();
    });

    it("does not unmount on transitionEnd while still open", () => {
        const { queryByTestId, getByTestId } = render(
            createElement(Test, { open: true }),
        );

        fireEvent.transitionEnd(getByTestId("outer"));
        expect(queryByTestId("inner")).not.toBeNull();
    });

    it("unmounts immediately when skipTransition is set and open flips to false", () => {
        const { queryByTestId, rerender } = render(
            createElement(Test, { open: true, skipTransition: true }),
        );
        rerender(createElement(Test, { open: false, skipTransition: true }));
        expect(queryByTestId("inner")).toBeNull();
    });
});
