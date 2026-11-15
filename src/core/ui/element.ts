/** The attribute that picks a button's look from the variants settings.css defines. */
export const VARIANT_ATTRIBUTE = "data-tks-variant";
/** The quiet, link-like look of Reset, Stop ignoring and Show in General. */
const QUIET_VARIANT = "quiet";
/** The filled look of the button a card or dialog leads with. */
export const PRIMARY_VARIANT = "primary";

/** A new element with a class and, when given, its text (always `textContent`). */
export type ElementFactory = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
) => HTMLElementTagNameMap[K];

/** A new element of `doc` with a class and, when given, its text (always `textContent`). */
export function createElement<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className !== "") {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

/** `createElement` bound to one document, for a module that builds many nodes of it. */
export function elementFactory(doc: Document): ElementFactory {
  return (tag, className, text) => createElement(doc, tag, className, text);
}

/** A plain button in the quiet variant, with its text. */
export function quietButton(doc: Document, text: string): HTMLButtonElement {
  const button = createElement(doc, "button", "tks-button", text);
  button.type = "button";
  button.setAttribute(VARIANT_ATTRIBUTE, QUIET_VARIANT);
  return button;
}
