import { describe, afterEach, beforeEach, vi, it, expect } from "vitest";
import { textToClipboard } from "./clipboard.ts";

describe("clipboard", () => {
    describe("textToClipboard", () => {
        const originalClipboard = navigator.clipboard;

        // Reset the clipboard
        afterEach(() => {
            vi.restoreAllMocks();
            if (originalClipboard === undefined) {
                delete (navigator as { clipboard?: unknown }).clipboard;
            } else {
                Object.defineProperty(navigator, "clipboard", {
                    configurable: true,
                    value: originalClipboard,
                });
            }
        });

        const mockActiveElement = (el: HTMLElement | null) => {
            Object.defineProperty(document, "activeElement", {
                configurable: true,
                get: () => el,
            });
        };

        describe("When navigator.clipboard is available", () => {
            let writeText: ReturnType<typeof vi.fn>;

            beforeEach(() => {
                writeText = vi.fn().mockResolvedValue(undefined);
                Object.defineProperty(navigator, "clipboard", {
                    configurable: true,
                    value: { writeText },
                });
            });

            it("should copy the given text", async () => {
                mockActiveElement(null);
                textToClipboard("hello world");
                await Promise.resolve();
                expect(writeText).toHaveBeenCalledTimes(1);
                expect(writeText).toHaveBeenCalledWith("hello world");
            });

            it("should default to an empty string", async () => {
                mockActiveElement(null);
                textToClipboard();
                await Promise.resolve();
                expect(writeText).toHaveBeenCalledWith("");
            });

            it("should restore focus to the previously active element", async () => {
                const focusSpy = vi.fn();
                mockActiveElement({
                    focus: focusSpy,
                } as unknown as HTMLElement);
                textToClipboard("x");
                await Promise.resolve();
                expect(focusSpy).toHaveBeenCalledTimes(1);
            });
        });

        describe("When no navigator.clipboard", () => {
            beforeEach(() => {
                // navigator.clipboard is a non-configurable getter in happy-dom,
                // so `delete navigator.clipboard` silently no-ops; it must be overridden instead.
                Object.defineProperty(navigator, "clipboard", {
                    configurable: true,
                    value: undefined,
                });
                // happy-dom doesn't implement execCommand, so vi.spyOn has nothing to wrap
                if (!("execCommand" in document)) {
                    (
                        document as unknown as { execCommand: () => boolean }
                    ).execCommand = () => true;
                }
            });

            it("should copy the text from a temp element in the DOM", () => {
                const execSpy = vi
                    .spyOn(document, "execCommand")
                    .mockReturnValue(true);
                const appendSpy = vi.spyOn(document.body, "appendChild");
                const removeSpy = vi.spyOn(document.body, "removeChild");

                const dummy = document.createElement("textarea");
                const selectSpy = vi.spyOn(dummy, "select");
                vi.spyOn(document, "createElement").mockReturnValue(dummy);

                textToClipboard("fallback text");

                expect(dummy.value).toBe("fallback text");
                expect(selectSpy).toHaveBeenCalledTimes(1);
                expect(execSpy).toHaveBeenCalledWith("copy");
                expect(appendSpy).toHaveBeenCalledWith(dummy);
                expect(removeSpy).toHaveBeenCalledWith(dummy); // cleaned up
            });

            it("should clean up the textarea even when execCommand reports failure", () => {
                vi.spyOn(document, "execCommand").mockReturnValue(false);
                textToClipboard("x", document.body);
                expect(document.querySelector("textarea")).toBeNull();
            });

            it("should restore focus to the previously active element", () => {
                const focusSpy = vi.fn();
                mockActiveElement({
                    focus: focusSpy,
                } as unknown as HTMLElement);
                textToClipboard("x");
                expect(focusSpy).toHaveBeenCalledTimes(1);
            });
        });
    });
});
