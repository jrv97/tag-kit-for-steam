import { createElement } from "./element";

/** An `aria-live` token, not copy. */
export const POLITE = "polite";

/** A visually hidden polite live region for `announce`. */
export function liveRegion(doc: Document, tag: "div" | "span"): HTMLElement {
  const live = createElement(doc, tag, "tks-vh");
  live.setAttribute("aria-live", POLITE);
  return live;
}

/**
 * Says `text` through a live region. The region empties first and fills on the next frame, so a
 * message that repeats, such as a second "Saved.", is announced again.
 */
export function announce(doc: Document, live: Element, text: string): void {
  live.textContent = "";
  const view = doc.defaultView;
  if (view === null) {
    live.textContent = text;
    return;
  }
  view.requestAnimationFrame(() => {
    live.textContent = text;
  });
}
