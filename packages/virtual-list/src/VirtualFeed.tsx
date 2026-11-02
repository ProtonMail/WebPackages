import type { CSSProperties, ReactElement, ReactNode } from "react";

import type { VirtualFeedController } from "./useVirtualFeed.ts";

export interface VirtualFeedProps<T> extends VirtualFeedController<T> {
    renderItem: (item: T) => ReactNode;
    "aria-label": string;
    children?: ReactNode;
}

export const VirtualFeed = <T,>({
    rows,
    getRowProps,
    totalSize,
    blockOffset,
    onKeyDown,
    scrollerRef,
    takeOver,
    external,
    scrollLocked,
    busy,
    renderItem,
    "aria-label": ariaLabel,
    children,
}: VirtualFeedProps<T>): ReactElement => {
    const sizedStyle: CSSProperties = {
        position: "relative",
        width: "100%",
        height: totalSize,
    };
    // Rows have no margins: the block is translated to the first row's start.
    const rowsBlock = (
        <div
            style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${blockOffset}px)`,
            }}
        >
            {rows.map(({ row, item }) => (
                <div key={row.key} {...getRowProps(row)}>
                    <article aria-posinset={row.index + 1} aria-setsize={-1}>
                        {renderItem(item)}
                    </article>
                </div>
            ))}
        </div>
    );

    if (external) {
        return (
            <>
                {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
                <div
                    role="feed"
                    aria-label={ariaLabel}
                    aria-busy={busy}
                    onKeyDown={onKeyDown}
                    style={sizedStyle}
                >
                    {rowsBlock}
                </div>
                {children}
            </>
        );
    }

    return (
        <>
            {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
            <div
                ref={scrollerRef}
                role="feed"
                aria-label={ariaLabel}
                aria-busy={busy}
                onKeyDown={onKeyDown}
                onWheel={takeOver}
                onTouchStart={takeOver}
                style={{
                    height: "100%",
                    overscrollBehavior: "contain",
                    overflowAnchor: "none",
                    ...(scrollLocked
                        ? { overflow: "hidden" }
                        : { overflowY: "auto" }),
                }}
            >
                <div style={sizedStyle}>{rowsBlock}</div>
            </div>
            {children}
        </>
    );
};
