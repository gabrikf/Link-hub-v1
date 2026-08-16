/**
 * In-page navigation that survives collapsed disclosures.
 *
 * The settings page keeps its rarely-needed panels (agent disclosure, personal
 * access tokens, the manual MCP snippets) inside `<details>` elements. A link
 * or a programmatic scroll to something inside a CLOSED `<details>` does
 * nothing visible: the element exists in the DOM, `scrollIntoView` happily
 * scrolls to a zero-height box, and the user sees the page not move. Opening
 * every ancestor first is the whole fix.
 */

/** Opens every `<details>` from `target` up to the document root. */
export function revealAnchorTarget(id: string): HTMLElement | null {
  const target = document.getElementById(id);
  if (!target) {
    return null;
  }

  let node: HTMLElement | null = target;
  while (node) {
    if (node instanceof HTMLDetailsElement) {
      node.open = true;
    }
    node = node.parentElement;
  }

  return target;
}

/**
 * Reveals the target and scrolls to it.
 *
 * `scrollIntoView` is called optionally because jsdom does not implement it and
 * this runs inside a `requestAnimationFrame` callback, where a throw is
 * attributed to whatever happened to be running.
 */
export function revealAndScrollTo(id: string): boolean {
  const target = revealAnchorTarget(id);
  target?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  return target !== null;
}

/**
 * Intercepts clicks on same-page `#anchor` links so the target is revealed
 * before the browser tries to scroll to it. Returns the teardown.
 *
 * Bound to the document rather than the page container because some of these
 * links live inside dialogs, which render in a portal outside the page tree.
 */
export function listenForAnchorClicks(): () => void {
  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const link = target.closest("a");
    const href = link?.getAttribute("href");
    if (!href || !href.startsWith("#") || href.length < 2) {
      return;
    }
    // Only take over when the anchor actually resolves — an unknown fragment
    // should keep whatever behaviour it had.
    if (!document.getElementById(href.slice(1))) {
      return;
    }
    event.preventDefault();
    revealAndScrollTo(href.slice(1));
  };

  document.addEventListener("click", onClick);
  return () => document.removeEventListener("click", onClick);
}
