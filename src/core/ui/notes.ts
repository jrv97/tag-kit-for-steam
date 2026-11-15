import { type BBNode, type BBTag, isList, parseBBCode } from "../bbcode";
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

const format = (
  tag: keyof HTMLElementTagNameMap,
  className: string,
  block = false,
): Formatted => ({ tag, className, block });

const HEADING = format("strong", "tks-bb-heading", true);
const STRIKE = format("s", "tks-bb-strike");
const LINE = format("span", "tks-bb-line", true);

// A link keeps its words, so no link leads off Steam. A picture or video draws nothing (rule 1).
// A heading element would enter the page's outline, so a heading is bold text.
// A spoiler shows its words: a tooltip cannot reveal it, and a keyboard cannot hover.
const FORMATS: Readonly<Record<BBTag, Formatted | "words" | "nothing">> = {
  "b": format("strong", "tks-bb-bold"),
  "i": format("em", "tks-bb-italic"),
  "u": format("u", "tks-bb-underline"),
  "s": STRIKE,
  "strike": STRIKE,
  "spoiler": "words",
  "url": "words",
  "img": "nothing",
  "previewyoutube": "nothing",
  "code": format("code", "tks-bb-code", true),
  "quote": format("blockquote", "tks-bb-quote", true),
  "h1": HEADING,
  "h2": HEADING,
  "h3": HEADING,
  "p": LINE,
  "list": format("ul", "tks-bb-list", true),
  "olist": format("ol", "tks-bb-list tks-bb-olist", true),
  "*": format("li", "tks-bb-item", true),
  "hr": format("hr", "tks-bb-rule", true),
  "table": "words",
  "tr": LINE,
  "th": "words",
  "td": "words",
};

/**
 * Appends the nodes as text and formatting. A block breaks the line itself, so one line break
 * right after its start or end goes. A list drops the blanks between its items.
 */
function appendFormatted(
  parent: HTMLElement,
  nodes: readonly BBNode[],
  atBlockEdge: boolean,
  list: boolean,
): void {
  let lineStart = atBlockEdge;
  for (const node of nodes) {
    if (typeof node === "string") {
      const text = lineStart && node.startsWith("\n") ? node.slice(1) : node;
      if (text !== "" && !(list && text.trim() === "")) {
        parent.append(text);
      }
      lineStart = false;
    } else {
      const shown = FORMATS[node.tag];
      if (shown === "words") {
        appendFormatted(parent, node.children, lineStart, false);
        lineStart = false;
      } else if (shown !== "nothing") {
        const element = createElement(parent.ownerDocument, shown.tag, shown.className);
        appendFormatted(element, node.children, shown.block, isList(node.tag));
        parent.append(element);
        lineStart = shown.block;
      }
    }
  }
}

/**
 * Sets the developer's text in `target`, replacing what it held. Plain text stays as it is, and
 * BBCode shows the formatting Steam shows. The words go in as text nodes, never parsed as HTML.
 */
export function fillNotes(target: HTMLElement, text: string, markup: NotesMarkup): void {
  const notes = normalizeBreaks(text);
  if (markup === "plain") {
    target.textContent = notes;
    return;
  }
  target.replaceChildren();
  appendFormatted(target, parseBBCode(notes), true, false);
}
