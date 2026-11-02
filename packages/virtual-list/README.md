# @protontech/virtual-list

Data-agnostic virtual list for the calendar web app. The agenda uses it to
render long, date-grouped lists with measured row heights, scroll anchoring,
edge loading and roving keyboard focus. Nothing here knows what an item is:
rows are addressed by index and key only.

## What is here

- **`useVirtualFeed(options)`** (`src/useVirtualFeed.ts`) holds all the logic of
  the feed: the list, the scroll command, the keyboard, the edge and first
  visible reports, and the scroll lock. It returns `scrollToTarget`, and
  `feedProps` for the component. It is described below.
- **`VirtualFeed`** (`src/VirtualFeed.tsx`) is the presentational component. It
  renders `feedProps` as the scroller and the rows, unless the caller passes its
  own scroller (`scrollElement`), with the caller's `renderItem`, `aria-label`
  and `children`.
- **`useScrollCommand(options)`** (`src/useScrollCommand.ts`) holds the scroll
  started by the list (a target, or a keyboard move) while it runs: its 2 s
  timeout, the take-over by the user's wheel, touch or keys, and the pending
  scroll request behind `scrollToTarget`.
- **`useFeedKeyboard(options)`** (`src/useFeedKeyboard.ts`) is the roving focus:
  the arrow, Home, End and Page keys, and the focus of a row that is not rendered
  yet.
- **`useVirtualList(options)`** (`src/useVirtualList.ts`) is the hook under
  `VirtualFeed`, and the only code that talks to `@tanstack/react-virtual`. It
  sets up the end anchoring that keeps the reader's place, and gives back
  `rows`, `blockOffset`, `totalSize`, `visibleRange`, `viewportSize`,
  `isScrolling`, `getRowProps`, `scrollToKey` and `cancelScroll`. A smooth
  `scrollToKey` is the library's native smooth `scrollToIndex`; a target more
  than two viewports away jumps. The command hold is not here (see
  `useScrollCommand`).

## useVirtualFeed and VirtualFeed

```tsx
import { useVirtualFeed } from "@protontech/virtual-list/useVirtualFeed.ts";
import { VirtualFeed } from "@protontech/virtual-list/VirtualFeed.tsx";

const { scrollToTarget, feedProps } = useVirtualFeed({
    items,
    getKey: (item) => item.key,
    estimateSize: (item) => (item.kind === "day" ? 40 : 32),
    busy: status !== "ready",
    isFocusable: (item) => item.kind === "entry",
    focusSelector: "[data-agenda-row]",
    onStartReached: (firstVisibleItem) => loadBefore(firstVisibleItem),
    onEndReached: (firstVisibleItem) => loadAfter(firstVisibleItem),
});

useEffect(() => {
    if (target) {
        scrollToTarget(target.key, "smooth");
    }
}, [target?.id]);

<VirtualFeed
    {...feedProps}
    renderItem={(item) => <Row item={item} />}
    aria-label="Agenda"
/>;
```

`feedProps` is opaque: pass it to `VirtualFeed` as it is, and use `scrollToTarget`
for scrolling.

Options of `useVirtualFeed`:

| Option                           | Meaning                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `items`, `getKey`                | The data, and a key per item. Anchors and scroll targets use the key, so keep it stable.                                        |
| `estimateSize`                   | Height in px before a row is measured. Keep it a little generous.                                                               |
| `busy`                           | `aria-busy`, and while true no edge is reported. See "Edges" below.                                                             |
| `overscan`                       | Rows rendered beyond the visible range, on each side. Default 8.                                                                |
| `isFocusable`                    | Rows in roving focus. Without it, the arrow keys do nothing.                                                                    |
| `focusSelector`                  | Element inside a focusable row that receives focus. Default `"button"`.                                                         |
| `scrollLocked`                   | Hides the overflow, e.g. while a popover is open over the list.                                                                 |
| `scrollElement`                  | The caller's scroller, e.g. a design-system `Scroll`. Then `VirtualFeed` renders only the content. See "The caller's scroller". |
| `onStartReached`, `onEndReached` | Called with the first visible item when fewer than `edgeItems` rows are above, or below, the visible range. See "Edges" below.  |
| `edgeItems`                      | Rows from the visible range to each end that count as near. Default 20.                                                         |
| `onFirstVisibleChange`           | Called with the first visible item when its key changes, and on mount. See "First visible item" below.                          |

It returns `scrollToTarget(key, behavior)` (see "Scroll target") and `feedProps`.

Props of `VirtualFeed`, besides `feedProps`:

| Prop         | Meaning                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| `renderItem` | Content of a row. It is wrapped in an `article` with `aria-posinset` and `aria-setsize="-1"`, the feed item. |
| `aria-label` | Name of the `role="feed"` scroller.                                                                          |
| `children`   | `ReactNode`, rendered as a sibling after the scroller (or the feed, with `scrollElement`), for overlays.     |

The scroller, the inner box and the block of rows use inline styles only, so
the component has no dependency on the app's styling setup. With
`scrollElement`, only the lock and `overflow-anchor` are written, to the
caller's element.

Rows are laid out with **block translation**, as the library recommends for
smooth scrolling: the rendered rows sit in normal flow inside one block, which
is translated by the first rendered row's start. Each row is measured with a
`ResizeObserver` on its element, from the border box (`borderBoxSize`, with
`offsetHeight` as the fallback), so padding and borders inside a row are part of
its size, and a row must not have margins.

### The caller's scroller

Some scrollers come from elsewhere: the agenda's scroll container is a
design-system `Scroll`, which draws the shadows from its own scroller. Pass that
element as `scrollElement`, and `VirtualFeed` renders no scroller: only the sized
content, which is the feed (`role="feed"`, the roving focus, the rows). The
element is the one that scrolls and is measured.

- **Before the element exists.** A caller's ref sets the element in state, so
  the first render has `scrollElement: null`. Nothing is measured then, and a
  `scrollToTarget` call waits: it is applied once the element is there, with the
  `behavior` it asked for. `undefined` is not `null`: it means the feed's own
  scroller, which is there from the first render.
- **Lock and anchoring.** `scrollLocked` sets `overflow: hidden` on the element,
  and it always gets `overflow-anchor: none`, as the internal scroller has. These
  are inline styles, which the caller's own `overflow` would lose when unlocked.
  `overscroll-behavior` is not set here: the caller's scroller sets it
  (`Scroll`'s `scrollContained`).
- **Input.** The feed listens to wheel, touch and key events on that
  element itself (native listeners, see "Scroll target"), so the caller's
  element needs no wiring.
- **Caller's overlays.** `children` still render after the feed, so they sit
  inside the caller's scroller. Position them against an element that is not
  scrolled (the agenda's spinners use the caller's outer box).

### Edges

`onStartReached` is called with the first visible item when fewer than
`edgeItems` rows (default 20) are above the visible range. `onEndReached` is
called when fewer than `edgeItems` rows are below it. The two are checked
independently, so a short list calls both. They are checked on every commit that
changes the visible range, the item count, `busy`, or whether the list is
moving, so a short list keeps asking until it fills the viewport. Neither is
called while `busy` is true, and both are called again once `busy` turns false,
so a request that finished without changing anything is not left stuck at the
edge.

The feed does not know which side has nothing left to load. A caller that has
reached the end of one side refuses the call itself, so the other side still
fills.

Neither is called while a scroll the list started is in flight (a request, or a
keyboard move to an unrendered row; see "Scroll target"). Paging there would
change the rows under the scroll. The edge is checked again once that scroll settles.

### First visible item

`onFirstVisibleChange` gets the first visible item (`items[visibleRange.first]`,
without overscan) when its key changes, and once on mount. Nothing is reported
while the range is unknown. It is not reported during a scroll the list started
(a target, or a keyboard move to an unrendered row): the item is reported when
that scroll settles, so the caller ends on the item the reader stopped at. A
user's own scroll is not held back.

`onStartReached` and `onEndReached` return nothing. The list keeps the reader's place by itself, so
the caller only starts the load.

### Keeping the reader's place

Items added above the reader (a prepend) keep the first visible item where it
was. The hook uses the library's end anchoring (`anchorTo: "end"`), which
matches the first visible item by its key before and after the change, so keys
must be stable. Items added or removed below do not move the viewport. The
library does not follow appends (`followOnAppend` is off), and its pinned-bottom
adjustment is turned off with `scrollEndThreshold: -1`, so a page loaded at the
bottom does not pull the reader down to its new end.

### Scroll target

`scrollToTarget(key, behavior)` scrolls the row with `key` to the top:
`"instant"` jumps, `"smooth"` glides. It is a plain function, not an effect
event, so it can be returned from the hook: call it from an effect or an event
handler, not during render. It reads the latest render.

A call is a request. The latest request is kept as pending, and tried at once.
A request that finds its row (the list scrolls, or is already in place) is
cleared. A request stays pending, with its own `behavior`, while `scrollElement`
is `null` (the caller's scroller is not there yet) or its key is not in `items`
yet. It is tried again each time `items` or `scrollElement` change, and applied
once, so an instant request still jumps when its item arrives. This covers a
window that loads after the target was asked for. A newer call replaces a
pending one.

Nothing deduplicates calls: a repeated call for the same key is a new request
and scrolls again. A caller that wants one scroll per event keys its own effect
on that event, e.g. `useEffect(..., [target?.id])`, as the agenda does with
`scrollTarget.id`.

Reduced motion turns a glide into a jump. A target further away than two
viewports also jumps, even when a glide is asked for: a glide across many rows
reads as the list flying past, and the library skips measuring far rows while it
runs. Under StrictMode the caller's effect runs twice, and the second run, after
the simulated unmount, applies the request again, since the library resets the
scroll position when the scroller re-attaches.

A smooth scroll the list starts uses the library's native smooth
`scrollToIndex`. A target more than two viewports away jumps instead. While it
is in flight, `useScrollCommand` holds the list: the command is armed when
`scrollToKey` returns `"scrolling"`, and no edge or first visible item is
reported meanwhile. It ends once the list has moved and stopped (`isScrolling`
turns false), or on take-over.

A wheel, touch or key on the scroller takes over: `takeOver` calls the library's
`cancelScroll`, which drops the glide, and ends the command. The viewport then
stays where the user takes it, and the edges are checked again at once, so a
gesture that moves nothing (a wheel up at the top) still reports an edge held
back by the command. With the internal scroller these are React `onWheel`,
`onTouchStart` and `onKeyDown` handlers; with `scrollElement` they are native
listeners on that element.

`useVirtualFeed` reads the hold through `useScrollCommand`'s `isActive()` from
its effects, not from state, since the effects of the commit that starts a
scroll (a request applied on mount) run before the next render. The hook's own
effects run before the caller's, so a request made from the caller's effect on
the first commit is armed after the first edge and first visible checks of that
commit.

A scroll command that never starts moving (a write that produces no scroll
event) is dropped after 2 s, and the edges are checked again, so it cannot
block paging for good. The timeout is 2 s because a glide
across two viewports settles well inside a second, and the library ends a
moving scroll itself. A command that has started moving is left to settle, so a
long glide is not cut short.

### Keyboard

Arrow Up/Down move between focusable rows, Home/End go to the first and last
focusable row, and Page Up/Down move by one viewport's worth of rows
(`max(1, floor(viewport / estimateSize))`). Rows are found through the
`data-index` that `getRowProps` puts on each row. A row that is not rendered is
scrolled into place first, then focused once it renders.
