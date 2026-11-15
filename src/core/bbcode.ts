/** The Steam BBCode tags we read; any other bracketed text stays text, as the store shows it. */
const TAGS = [
  "b",
  "i",
  "u",
  "s",
  "strike",
  "spoiler",
  "url",
  "img",
  "code",
  "quote",
  "h1",
  "h2",
  "h3",
  "list",
  "olist",
  "*",
  "hr",
] as const;

export type BBTag = (typeof TAGS)[number];

/** One parsed tag and what it holds. `[url=...]` and `[quote=...]` lose their argument. */
interface BBElement {
  readonly tag: BBTag;
  readonly children: readonly BBNode[];
}

export type BBNode = string | BBElement;

/** An open tag while parsing, or the root that holds the whole text. */
interface Building {
  readonly tag: BBTag | "root";
  readonly children: BBNode[];
}

interface Open {
  readonly element: Building;
  /** The opening tag as written, given back as text when the tag never closes. */
  readonly source: string;
}

/** The open tags, outermost first; the root is never closed. */
type Stack = [Open, ...Open[]];

const TAG = /\[(\/?)([a-z0-9*]+)(?:=[^\]\n]*)?\]/gi;
const NOPARSE_CLOSE = "[/noparse]";

function isTag(name: string): name is BBTag {
  return TAGS.some((tag) => tag === name);
}

function isList(tag: BBTag | "root"): boolean {
  return tag === "list" || tag === "olist";
}

/** A tag that the end of the text closes: an item, or a list left open. */
function closesAtEnd(tag: BBTag | "root"): boolean {
  return tag === "*" || isList(tag);
}

function top(stack: Readonly<Stack>): Building {
  return (stack.at(-1) ?? stack[0]).element;
}

function append(stack: Readonly<Stack>, node: BBNode): void {
  const { children } = top(stack);
  const last = children.at(-1);
  if (typeof node !== "string") {
    children.push(node);
  } else if (typeof last === "string") {
    children[children.length - 1] = last + node;
  } else if (node !== "") {
    children.push(node);
  }
}

/** Whether the innermost open tag is a list or one of its items, so a `[*]` belongs to it. */
function inList(stack: Readonly<Stack>): boolean {
  const open = top(stack).tag;
  return isList(open) || open === "*";
}

/** Closes `tag` and what opened inside it. A list bounds the search; false when not open. */
function close(stack: Stack, tag: BBTag): boolean {
  for (let depth = stack.length - 1; depth > 0; depth -= 1) {
    const open = stack[depth]?.element.tag;
    if (open === tag) {
      stack.length = depth;
      return true;
    }
    if (open !== undefined && isList(open)) {
      return false;
    }
  }
  return false;
}

/**
 * Tags still open at the end: a list and its items close there; any other tag gives its source
 * back as text, followed by what it holds.
 */
function unwind(stack: Stack): void {
  while (stack.length > 1) {
    const open = stack.pop();
    if (open !== undefined && !closesAtEnd(open.element.tag)) {
      // An open tag is the last child of its parent, since all later text went into it.
      top(stack).children.pop();
      for (const node of [open.source, ...open.element.children]) {
        append(stack, node);
      }
    }
  }
}

/** The raw text of a `[noparse]` block from `from`, and where parsing resumes after it. */
function noparse(text: string, from: number): { readonly raw: string; readonly next: number; } {
  const end = text.toLowerCase().indexOf(NOPARSE_CLOSE, from);
  return end === -1
    ? { raw: text.slice(from), next: text.length }
    : { raw: text.slice(from, end), next: end + NOPARSE_CLOSE.length };
}

/** Opens `tag` in the innermost open tag; `[hr]` holds nothing and stays closed. */
function open(stack: Stack, tag: BBTag, source: string): void {
  if (tag === "*") {
    close(stack, "*");
  }
  const children: BBNode[] = [];
  const element = { tag, children };
  top(stack).children.push(element);
  if (tag !== "hr") {
    stack.push({ element, source });
  }
}

/**
 * Steam's BBCode, with its breaks as `\n`, as a tree. Tag names ignore case. Unknown tags, a
 * closing tag with nothing open, a `[*]` outside a list and a tag that never closes stay text.
 */
export function parseBBCode(text: string): readonly BBNode[] {
  const root: Building = { tag: "root", children: [] };
  const stack: Stack = [{ element: root, source: "" }];
  const pattern = new RegExp(TAG.source, TAG.flags);
  let at = 0;
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    const [source, slash, written = ""] = match;
    const name = written.toLowerCase();
    if (name === "noparse" && slash === "") {
      append(stack, text.slice(at, match.index));
      const block = noparse(text, pattern.lastIndex);
      append(stack, block.raw);
      at = block.next;
      pattern.lastIndex = at;
    } else if (isTag(name)) {
      append(stack, text.slice(at, match.index));
      at = pattern.lastIndex;
      if (slash !== "") {
        // `[hr]` holds nothing, so `[/hr]` closes nothing and is dropped.
        if (name !== "hr" && !close(stack, name)) {
          append(stack, source);
        }
      } else if (name === "*" && !inList(stack)) {
        append(stack, source);
      } else {
        open(stack, name, source);
      }
    }
  }
  append(stack, text.slice(at));
  unwind(stack);
  return root.children;
}
