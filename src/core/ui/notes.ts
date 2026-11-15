import { type BBNode, type BBTag, parseBBCode } from "../bbcode";
import { createElement } from "./element";

const WINDOWS_BREAK = /\r\n?/g;

/** The notes with Windows and old Mac line breaks turned into `\n` (rq6, S2). */
export function normalizeBreaks(notes: string): string {
  return notes.replace(WINDOWS_BREAK, "\n");
}

/** How a developer's field is written: plain text, or Steam's BBCode (`why_bbcode`). */
export type NotesMarkup = "plain" | "bbcode";

/** The element a tag becomes, and whether it starts its own line. */
interface Formatted {
  readonly tag: keyof HTMLElementTagNameMap;
  readonly className: string;
  readonly block: boolean;
}

const inline = (tag: keyof HTMLElementTagNameMap, className: string): Formatted => ({
  tag,
  className,
  block: false,
});

const block = (tag: keyof HTMLElementTagNameMap, className: string): Formatted => ({
  tag,
  className,
  block: true,
});

const HEADING = block("strong", "tks-bb-heading");
const STRIKE = inline("s", "tks-bb-strike");

/**
 * What each tag renders as. A link keeps only its words, so no link leads off Steam; a picture
 * draws nothing, so no request reaches another host (rule 1). A developer's heading is bold text,
 * since a heading element would enter the page's outline.
 */
const FORMATS: Readonly<Record<BBTag, Formatted | "words" | "nothing">> = {
  "b": inline("strong", "tks-bb-bold"),
  "i": inline("em", "tks-bb-italic"),
  "u": inline("u", "tks-bb-underline"),
  "s": STRIKE,
  "strike": STRIKE,
  "spoiler": inline("span", "tks-bb-spoiler"),
  "url": "words",
  "img": "nothing",
  "code": block("code", "tks-bb-code"),
  "quote": block("blockquote", "tks-bb-quote"),
  "h1": HEADING,
  "h2": HEADING,
  "h3": HEADING,
  "list": block("ul", "tks-bb-list"),
  "olist": block("ol", "tks-bb-list"),
  "*": block("li", "tks-bb-item"),
  "hr": block("hr", "tks-bb-rule"),
};

/**
 * Appends the nodes as text and formatting. A line break right after a block's start or end is
 * dropped, since the block breaks the line itself; blanks between list items are dropped too.
 */
function appendFormatted(parent: HTMLElement, nodes: readonly BBNode[], list: boolean): void {
  let lineStart = true;
  for (const node of nodes) {
    if (typeof node === "string") {
      const text = lineStart && node.startsWith("\n") ? node.slice(1) : node;
      if (text !== "" && !(list && text.trim() === "")) {
        parent.append(text);
      }
      lineStart = false;
    } else {
      const format = FORMATS[node.tag];
      if (format === "words") {
        appendFormatted(parent, node.children, false);
        lineStart = false;
      } else if (format !== "nothing") {
        const element = createElement(parent.ownerDocument, format.tag, format.className);
        appendFormatted(element, node.children, node.tag === "list" || node.tag === "olist");
        parent.append(element);
        lineStart = format.block;
      }
    }
  }
}

/**
 * Sets the developer's text in `target`, replacing what it held: plain text as it is, BBCode as
 * the formatting Steam shows. Every word becomes a text node, never parsed as HTML.
 */
export function fillNotes(target: HTMLElement, text: string, markup: NotesMarkup): void {
  const notes = normalizeBreaks(text);
  if (markup === "plain") {
    target.textContent = notes;
    return;
  }
  target.replaceChildren();
  appendFormatted(target, parseBBCode(notes), false);
}
