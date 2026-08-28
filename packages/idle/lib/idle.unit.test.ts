import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IdleDetector } from "./idle.ts";

function setHidden(hidden: boolean) {
    Object.defineProperty(document, "hidden", {
        value: hidden,
        configurable: true,
    });
}

function fireVisibilityChange() {
    document.dispatchEvent(new Event("visibilitychange"));
}

describe("IdleDetector", () => {
    let onIdle: ReturnType<typeof vi.fn<() => void>>;

    beforeEach(() => {
        onIdle = vi.fn<() => void>();
        vi.useFakeTimers();
        setHidden(false);
    });

    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = "";
        // Restore document.activeElement to body
        Object.defineProperty(document, "activeElement", {
            value: document.body,
            configurable: true,
        });
    });

    describe("visibilitychange", () => {
        it("calls onIdle when page transitions to hidden", () => {
            const detector = new IdleDetector({ onIdle });
            detector.start();

            setHidden(true);
            fireVisibilityChange();

            expect(onIdle).toHaveBeenCalledOnce();
            detector.stop();
        });

        it("does not call onIdle when page transitions to visible", () => {
            const detector = new IdleDetector({ onIdle });
            detector.start();

            setHidden(false);
            fireVisibilityChange();

            expect(onIdle).not.toHaveBeenCalled();
            detector.stop();
        });
    });

    describe("interval polling", () => {
        it("uses 30 seconds as the default interval", () => {
            setHidden(true);
            const detector = new IdleDetector({ onIdle });
            detector.start();

            vi.advanceTimersByTime(29_999);
            expect(onIdle).not.toHaveBeenCalled();

            vi.advanceTimersByTime(1);
            expect(onIdle).toHaveBeenCalledOnce();

            detector.stop();
        });

        it("calls onIdle on each tick while hidden", () => {
            setHidden(true);
            const detector = new IdleDetector({ onIdle, interval: 1_000 });
            detector.start();

            vi.advanceTimersByTime(1_000);
            expect(onIdle).toHaveBeenCalledOnce();

            vi.advanceTimersByTime(1_000);
            expect(onIdle).toHaveBeenCalledTimes(2);

            detector.stop();
        });

        it("does not call onIdle on tick while visible", () => {
            setHidden(false);
            const detector = new IdleDetector({ onIdle, interval: 1_000 });
            detector.start();

            vi.advanceTimersByTime(1_000);

            expect(onIdle).not.toHaveBeenCalled();
            detector.stop();
        });
    });

    describe("stop()", () => {
        it("removes the visibilitychange listener", () => {
            const detector = new IdleDetector({ onIdle });
            detector.start();
            detector.stop();

            setHidden(true);
            fireVisibilityChange();

            expect(onIdle).not.toHaveBeenCalled();
        });

        it("stops the polling interval", () => {
            setHidden(true);
            const detector = new IdleDetector({ onIdle, interval: 1_000 });
            detector.start();
            detector.stop();

            vi.advanceTimersByTime(1_000);

            expect(onIdle).not.toHaveBeenCalled();
        });

        it("is safe to call multiple times", () => {
            const detector = new IdleDetector({ onIdle });
            detector.start();
            expect(() => {
                detector.stop();
                detector.stop();
            }).not.toThrow();
        });
    });

    describe("busy: open dialog", () => {
        beforeEach(() => setHidden(true));

        it("does not call onIdle when a dialog[open] is present", () => {
            const dialog = document.createElement("dialog");
            dialog.setAttribute("open", "");
            document.body.appendChild(dialog);

            const detector = new IdleDetector({ onIdle });
            detector.start();
            fireVisibilityChange();

            expect(onIdle).not.toHaveBeenCalled();
            detector.stop();
        });

        it("calls onIdle when a dialog exists but is not open", () => {
            const dialog = document.createElement("dialog");
            document.body.appendChild(dialog);

            const detector = new IdleDetector({ onIdle });
            detector.start();
            fireVisibilityChange();

            expect(onIdle).toHaveBeenCalledOnce();
            detector.stop();
        });
    });

    describe("busy: filled text fields", () => {
        beforeEach(() => setHidden(true));

        it.each([
            ["text", "hello"],
            ["email", "user@example.com"],
            ["password", "secret"],
            ["search", "query"],
            ["url", "https://example.com"],
            ["tel", "555-1234"],
            ["number", "42"],
        ])(
            "does not call onIdle when input[type=%s] has a value",
            (type, value) => {
                const input = document.createElement("input");
                input.type = type;
                input.value = value;
                document.body.appendChild(input);

                const detector = new IdleDetector({ onIdle });
                detector.start();
                fireVisibilityChange();

                expect(onIdle).not.toHaveBeenCalled();
                detector.stop();
            },
        );

        it("does not call onIdle when a textarea has a value", () => {
            const textarea = document.createElement("textarea");
            textarea.value = "draft text";
            document.body.appendChild(textarea);

            const detector = new IdleDetector({ onIdle });
            detector.start();
            fireVisibilityChange();

            expect(onIdle).not.toHaveBeenCalled();
            detector.stop();
        });

        it("calls onIdle when a text field contains only whitespace", () => {
            const input = document.createElement("input");
            input.type = "text";
            input.value = "   ";
            document.body.appendChild(input);

            const detector = new IdleDetector({ onIdle });
            detector.start();
            fireVisibilityChange();

            expect(onIdle).toHaveBeenCalledOnce();
            detector.stop();
        });

        it.each(["checkbox", "radio", "hidden", "button", "submit", "reset"])(
            "ignores input[type=%s] when checking for filled fields",
            (type) => {
                const input = document.createElement("input");
                input.type = type;
                input.value = "ignored";
                document.body.appendChild(input);

                const detector = new IdleDetector({ onIdle });
                detector.start();
                fireVisibilityChange();

                expect(onIdle).toHaveBeenCalledOnce();
                detector.stop();
            },
        );
    });

    describe("busy: filled text field visibility", () => {
        beforeEach(() => setHidden(true));

        it("calls onIdle when checkVisibility reports the filled input is not visible", () => {
            const input = document.createElement("input");
            input.type = "text";
            input.value = "hello";
            // Simulate what a real browser returns for a display:none element.
            Object.defineProperty(input, "checkVisibility", {
                value: () => false,
                configurable: true,
            });
            document.body.appendChild(input);

            const detector = new IdleDetector({ onIdle });
            detector.start();
            fireVisibilityChange();

            expect(onIdle).toHaveBeenCalledOnce();
            detector.stop();
        });

        it("calls onIdle when checkVisibility propagates hidden state from an ancestor", () => {
            const input = document.createElement("input");
            input.type = "text";
            input.value = "hello";
            // checkVisibility checks the element and its ancestors, so a display:none
            // parent causes the input itself to return false.
            Object.defineProperty(input, "checkVisibility", {
                value: () => false,
                configurable: true,
            });
            const wrapper = document.createElement("div");
            wrapper.appendChild(input);
            document.body.appendChild(wrapper);

            const detector = new IdleDetector({ onIdle });
            detector.start();
            fireVisibilityChange();

            expect(onIdle).toHaveBeenCalledOnce();
            detector.stop();
        });

        it("falls back to isElementVisible when checkVisibility is unavailable", () => {
            const input = document.createElement("input");
            input.type = "text";
            input.value = "hello";
            document.body.appendChild(input);

            // Simulate a browser that does not implement checkVisibility.
            Object.defineProperty(input, "checkVisibility", {
                value: undefined,
                configurable: true,
            });
            // Give the element layout dimensions so isElementVisible returns true.
            Object.defineProperty(input, "offsetWidth", {
                value: 120,
                configurable: true,
            });

            const detector = new IdleDetector({ onIdle });
            detector.start();
            fireVisibilityChange();

            expect(onIdle).not.toHaveBeenCalled();
            detector.stop();
        });

        it("treats a zero-dimension element as not visible in the isElementVisible fallback", () => {
            const input = document.createElement("input");
            input.type = "text";
            input.value = "hello";
            document.body.appendChild(input);

            // Simulate absence of checkVisibility and a hidden element (e.g., display:none)
            // where all layout properties return 0 / empty, as real browsers do.
            Object.defineProperty(input, "checkVisibility", {
                value: undefined,
                configurable: true,
            });
            Object.defineProperty(input, "offsetWidth", {
                value: 0,
                configurable: true,
            });
            Object.defineProperty(input, "offsetHeight", {
                value: 0,
                configurable: true,
            });
            input.getClientRects = () => ({ length: 0 }) as DOMRectList;

            const detector = new IdleDetector({ onIdle });
            detector.start();
            fireVisibilityChange();

            expect(onIdle).toHaveBeenCalledOnce();
            detector.stop();
        });
    });

    describe("busy: filled text field accessibility", () => {
        beforeEach(() => setHidden(true));

        it("calls onIdle when a filled input has aria-hidden='true'", () => {
            const input = document.createElement("input");
            input.type = "text";
            input.value = "hello";
            input.setAttribute("aria-hidden", "true");
            document.body.appendChild(input);

            const detector = new IdleDetector({ onIdle });
            detector.start();
            fireVisibilityChange();

            expect(onIdle).toHaveBeenCalledOnce();
            detector.stop();
        });

        it("calls onIdle when a filled input's ancestor has aria-hidden='true'", () => {
            const wrapper = document.createElement("div");
            wrapper.setAttribute("aria-hidden", "true");
            const input = document.createElement("input");
            input.type = "text";
            input.value = "hello";
            wrapper.appendChild(input);
            document.body.appendChild(wrapper);

            const detector = new IdleDetector({ onIdle });
            detector.start();
            fireVisibilityChange();

            expect(onIdle).toHaveBeenCalledOnce();
            detector.stop();
        });

        it("calls onIdle when a filled input has the hidden attribute", () => {
            const input = document.createElement("input");
            input.type = "text";
            input.value = "hello";
            input.setAttribute("hidden", "");
            document.body.appendChild(input);

            const detector = new IdleDetector({ onIdle });
            detector.start();
            fireVisibilityChange();

            expect(onIdle).toHaveBeenCalledOnce();
            detector.stop();
        });

        it("calls onIdle when a filled input's ancestor has the hidden attribute", () => {
            const wrapper = document.createElement("div");
            wrapper.setAttribute("hidden", "");
            const input = document.createElement("input");
            input.type = "text";
            input.value = "hello";
            wrapper.appendChild(input);
            document.body.appendChild(wrapper);

            const detector = new IdleDetector({ onIdle });
            detector.start();
            fireVisibilityChange();

            expect(onIdle).toHaveBeenCalledOnce();
            detector.stop();
        });

        it("does not call onIdle when aria-hidden is only on a sibling", () => {
            const sibling = document.createElement("div");
            sibling.setAttribute("aria-hidden", "true");
            const input = document.createElement("input");
            input.type = "text";
            input.value = "hello";
            document.body.appendChild(sibling);
            document.body.appendChild(input);

            const detector = new IdleDetector({ onIdle });
            detector.start();
            fireVisibilityChange();

            expect(onIdle).not.toHaveBeenCalled();
            detector.stop();
        });
    });

    describe("busy: custom busy tokens", () => {
        beforeEach(() => setHidden(true));

        it("does not call onIdle while a token is active", () => {
            const detector = new IdleDetector({ onIdle });
            detector.start();

            const removeBusy = detector.addBusy();
            fireVisibilityChange();

            expect(onIdle).not.toHaveBeenCalled();

            removeBusy();
            detector.stop();
        });

        it("calls onIdle after the token is removed", () => {
            const detector = new IdleDetector({ onIdle });
            detector.start();

            const removeBusy = detector.addBusy();
            removeBusy();
            fireVisibilityChange();

            expect(onIdle).toHaveBeenCalledOnce();
            detector.stop();
        });

        it("requires all tokens to be removed before allowing idle", () => {
            const detector = new IdleDetector({ onIdle });
            detector.start();

            const removeA = detector.addBusy();
            const removeB = detector.addBusy();

            removeA();
            fireVisibilityChange();
            expect(onIdle).not.toHaveBeenCalled();

            removeB();
            fireVisibilityChange();
            expect(onIdle).toHaveBeenCalledOnce();

            detector.stop();
        });

        it("calling the remover twice does not throw", () => {
            const detector = new IdleDetector({ onIdle });
            detector.start();

            const removeBusy = detector.addBusy();
            expect(() => {
                removeBusy();
                removeBusy();
            }).not.toThrow();

            detector.stop();
        });
    });

    describe("busy: focused interactive element", () => {
        beforeEach(() => setHidden(true));

        it.each(["input", "textarea", "select"])(
            "does not call onIdle when a <%s> has focus",
            (tag) => {
                const el = document.createElement(tag);
                document.body.appendChild(el);
                Object.defineProperty(document, "activeElement", {
                    value: el,
                    configurable: true,
                });

                const detector = new IdleDetector({ onIdle });
                detector.start();
                fireVisibilityChange();

                expect(onIdle).not.toHaveBeenCalled();
                detector.stop();
            },
        );

        it("does not call onIdle when a contenteditable element has focus", () => {
            const div = document.createElement("div");
            div.setAttribute("contenteditable", "true");
            document.body.appendChild(div);
            Object.defineProperty(document, "activeElement", {
                value: div,
                configurable: true,
            });

            const detector = new IdleDetector({ onIdle });
            detector.start();
            fireVisibilityChange();

            expect(onIdle).not.toHaveBeenCalled();
            detector.stop();
        });

        it("calls onIdle when a contenteditable='false' element has focus", () => {
            const div = document.createElement("div");
            div.setAttribute("contenteditable", "false");
            document.body.appendChild(div);
            Object.defineProperty(document, "activeElement", {
                value: div,
                configurable: true,
            });

            const detector = new IdleDetector({ onIdle });
            detector.start();
            fireVisibilityChange();

            expect(onIdle).toHaveBeenCalledOnce();
            detector.stop();
        });

        it("calls onIdle when focus is on a non-interactive element", () => {
            const div = document.createElement("div");
            document.body.appendChild(div);
            Object.defineProperty(document, "activeElement", {
                value: div,
                configurable: true,
            });

            const detector = new IdleDetector({ onIdle });
            detector.start();
            fireVisibilityChange();

            expect(onIdle).toHaveBeenCalledOnce();
            detector.stop();
        });

        it("calls onIdle when document.body is the active element", () => {
            Object.defineProperty(document, "activeElement", {
                value: document.body,
                configurable: true,
            });

            const detector = new IdleDetector({ onIdle });
            detector.start();
            fireVisibilityChange();

            expect(onIdle).toHaveBeenCalledOnce();
            detector.stop();
        });
    });
});
