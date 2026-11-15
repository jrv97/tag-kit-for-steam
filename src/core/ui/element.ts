/** The attribute that picks a button's or banner's look from the variants its sheet defines. */
export const VARIANT_ATTRIBUTE = "data-tks-variant";
/** The quiet, link-like look of a button that undoes or points elsewhere. */
export const QUIET_VARIANT = "quiet";
/** The filled look of the button a card or dialog leads with. */
export const PRIMARY_VARIANT = "primary";
/** The class of the line under a field or card that says an action failed. */
export const FIELD_ERROR = "tks-field-error";

/** A new element with its class and its text, each when given (always `textContent`). */
type ElementFactory = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
) => HTMLElementTagNameMap[K];

/** A new element of `doc` with its class and its text, each when given (always `textContent`). */
export function createElement<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className = "",
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

/** A button that never submits a form, with its class and, when given, its text. */
export function plainButton(doc: Document, className: string, text?: string): HTMLButtonElement {
  const button = createElement(doc, "button", className, text);
  button.type = "button";
  return button;
}

/** A link that opens in a new tab with no opener or referrer, with its text when given. */
export function newTabLink(
  doc: Document,
  className: string,
  url: string,
  text?: string,
): HTMLAnchorElement {
  const link = createElement(doc, "a", className, text);
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

/** A hidden `p` with `role="alert"` for a failure to show, with its text when given. */
export function errorLine(doc: Document, className: string, text?: string): HTMLParagraphElement {
  const line = createElement(doc, "p", className, text);
  line.setAttribute("role", "alert");
  line.hidden = true;
  return line;
}

/** A plain button in our secondary look, with its text when given. */
export function secondaryButton(doc: Document, text?: string): HTMLButtonElement {
  return plainButton(doc, "tks-button", text);
}

/** A plain button in the quiet variant, with its text. */
export function quietButton(doc: Document, text: string): HTMLButtonElement {
  const button = secondaryButton(doc, text);
  button.setAttribute(VARIANT_ATTRIBUTE, QUIET_VARIANT);
  return button;
}
