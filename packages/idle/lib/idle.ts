// Matches text-accepting inputs. Excludes checkbox, radio, file, button,
// submit, reset, image, range, color, and hidden — none of these hold
// user-entered text that would indicate in-progress work.
const TEXT_INPUT_SELECTOR =
    "input:is(:not([type]), [type=text], [type=email], [type=password], [type=search], [type=url], [type=tel], [type=number]), textarea";

// Tags whose focused presence indicates the user is actively editing.
const INTERACTIVE_TAGS = new Set(["input", "textarea", "select"]);

function isElementVisible(el: HTMLElement): boolean {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

function isAccessible(el: Element): boolean {
    let current: Element | null = el;

    while (current) {
        if (current.getAttribute("aria-hidden") === "true") {
            return false;
        }
        if (current.hasAttribute("hidden")) {
            return false;
        }
        current = current.parentElement;
    }

    return true;
}

export interface IdleDetectorOptions {
    /** Called when the page is hidden and no user activity is detected. */
    onIdle: () => void;
    /**
     * How often to poll for idle conditions while the page is hidden,
     * in milliseconds. Defaults to 30 seconds.
     */
    interval?: number;
}

/**
 * Detects when the user is likely idle: the page is hidden and no open
 * dialogs, filled text fields, or focused interactive elements are present.
 *
 * The check runs on two triggers:
 * - immediately when the page transitions to hidden via `visibilitychange`
 * - repeatedly on the configured polling interval while hidden
 *
 * Call `start()` to begin monitoring and `stop()` to tear down all listeners
 * and timers.
 */
export class IdleDetector {
    private readonly onIdle: () => void;
    private readonly interval: number;
    private intervalHandle: ReturnType<typeof setInterval> | null = null;
    private readonly customBusyTokens = new Set<symbol>();

    constructor({ onIdle, interval = 30_000 }: IdleDetectorOptions) {
        this.onIdle = onIdle;
        this.interval = interval;
    }

    start(): void {
        if (this.intervalHandle !== null) {
            return;
        }
        document.addEventListener(
            "visibilitychange",
            this.handleVisibilityChange,
        );
        this.intervalHandle = setInterval(
            () => this.checkAndNotify(),
            this.interval,
        );
    }

    stop(): void {
        document.removeEventListener(
            "visibilitychange",
            this.handleVisibilityChange,
        );
        if (this.intervalHandle !== null) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }
    }

    private handleVisibilityChange = () => {
        if (document.hidden) {
            this.checkAndNotify();
        }
    };

    /**
     * Registers a custom busy signal. The detector will not fire `onIdle`
     * while any custom busy signal is active.
     *
     * Returns a function that removes the signal when called.
     */
    addBusy(): () => void {
        const token = Symbol();
        this.customBusyTokens.add(token);
        return () => {
            this.customBusyTokens.delete(token);
        };
    }

    private isBusy(): boolean {
        if (this.customBusyTokens.size > 0) {
            return true;
        }

        // An open dialog means the user is in the middle of an interaction.
        if (document.querySelector("dialog[open]") !== null) {
            return true;
        }

        // A visible custom dialog (div[role=dialog], often used by component
        // libraries that don't rely on the native <dialog> element) also
        // counts as a user interaction.
        for (const el of document.querySelectorAll<HTMLElement>(
            'div[role="dialog"], div[role="alertdialog"]',
        )) {
            if (
                isAccessible(el) &&
                (el.checkVisibility?.() ?? isElementVisible(el))
            ) {
                return true;
            }
        }

        // A filled, visible text field means the user has unsaved input in progress.
        // Hidden inputs (display:none, visibility:hidden, etc.) are excluded because
        // the user cannot interact with them and their content should not block a reload.
        for (const el of document.querySelectorAll<
            HTMLInputElement | HTMLTextAreaElement
        >(TEXT_INPUT_SELECTOR)) {
            if (
                el.value.trim() !== "" &&
                isAccessible(el) &&
                (el.checkVisibility?.() ?? isElementVisible(el))
            ) {
                return true;
            }
        }

        // A focused interactive element means the cursor is active in a field.
        const active = document.activeElement;
        if (active !== null && active !== document.body) {
            if (
                INTERACTIVE_TAGS.has(active.tagName.toLowerCase()) ||
                (active instanceof HTMLElement && active.isContentEditable)
            ) {
                return true;
            }
        }

        return false;
    }

    private checkAndNotify(): void {
        if (document.hidden && !this.isBusy()) {
            this.onIdle();
        }
    }
}
