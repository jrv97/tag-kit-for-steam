/** The Steam BBCode tags we read. Any other bracketed text stays as typed. */
const TAGS = [
  "b",
  "i",
  "u",
  "s",
  "strike",
  "spoiler",
  "url",
  "img",
  "previewyoutube",
  "code",
  "quote",
  "h1",
  "h2",
  "h3",
  "p",
  "list",
  "olist",
  "*",
  "hr",
  "table",
  "tr",
  "th",
  "td",
] as const;

export type BBTag = (typeof TAGS)[number];

/** One parsed tag and what it holds. `[url=...]` and `[quote=...]` lose their argument. */
interface BBElement {
  readonly tag: BBTag;
  readonly children: readonly BBNode[];
}

export type BBNode = string | BBElement;

/** An open tag while parsing, or the root that holds the whole text. */
interface Open {
  readonly tag: BBTag | "root";
  readonly children: BBNode[];
  /** The opening tag as written. A tag that never closes gives it back as text. */
  readonly source: string;
}

/** The open tags, outermost first. The root never closes. */
type Stack = [Open, ...Open[]];

const TAG = /\[(\/?)([a-z0-9*]+)(?:=[^[\]\n]*)?\]/gi;
const NOPARSE_CLOSE = /\[\/noparse\]/gi;
const BLANK = /^\s*$/;

function isTag(name: string): name is BBTag {
  return TAGS.some((tag) => tag === name);
}

export function isList(tag: BBTag | "root"): boolean {
  return tag === "list" || tag === "olist";
}

/** A list or an item. The end of the text closes both. */
function isListPart(tag: BBTag | "root"): boolean {
  return tag === "*" || isList(tag);
}

function top(stack: Readonly<Stack>): Open {
  return stack.at(-1) ?? stack[0];
}

function inList(stack: Readonly<Stack>): boolean {
  return stack.some((open) => isList(open.tag));
}

/** Pushes an element into the innermost open tag, and opens it unless it is `[hr]`. */
function push(stack: Stack, tag: BBTag, source: string): void {
  const children: BBNode[] = [];
  top(stack).children.push({ tag, children });
  if (tag !== "hr") {
    stack.push({ tag, children, source });
  }
}

/** Content in a list before its first `[*]` starts an item of its own. */
function enterItem(stack: Stack): void {
  if (isList(top(stack).tag)) {
    push(stack, "*", "");
  }
}

function append(stack: Stack, text: string): void {
  if (text === "") {
    return;
  }
  if (!BLANK.test(text)) {
    enterItem(stack);
  }
  const { children } = top(stack);
  const last = children.at(-1);
  if (typeof last === "string") {
    children[children.length - 1] = last + text;
  } else {
    children.push(text);
  }
}

/** Opens a tag. A `[*]` first closes the open item and everything opened inside it. */
function open(stack: Stack, tag: BBTag, source: string): void {
  if (tag === "*") {
    while (stack.length > 1 && !isList(top(stack).tag)) {
      stack.pop();
    }
  } else {
    enterItem(stack);
  }
  push(stack, tag, source);
}

/** Closes `tag` and what opened inside it. The innermost list bounds the search. */
function close(stack: Stack, tag: BBTag): boolean {
  for (let depth = stack.length - 1; depth > 0; depth -= 1) {
    const open = stack[depth]?.tag;
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
 * Tags still open at the end. Lists and items close there. Any other tag gives back its source
 * as text, followed by what it holds.
 */
function unwind(stack: Stack): void {
  while (stack.length > 1) {
    const open = stack.pop();
    if (open !== undefined && !isListPart(open.tag)) {
      // An open tag is its parent's last child, since all later text went into it.
      const parent = top(stack);
      parent.children.pop();
      append(stack, open.source);
      for (const node of open.children) {
        if (typeof node === "string") {
          append(stack, node);
        } else {
          parent.children.push(node);
        }
      }
    }
  }
}

/** Where the `[/noparse]` after `from` starts and ends, if there is one. */
function noparseEnd(text: string, from: number): { start: number; end: number; } | undefined {
  NOPARSE_CLOSE.lastIndex = from;
  const match = NOPARSE_CLOSE.exec(text);
  return match === null ? undefined : { start: match.index, end: NOPARSE_CLOSE.lastIndex };
}

/**
 * Steam's BBCode, with its breaks as `\n`, as a tree. Tag names ignore case. Unknown tags, a
 * stray closing tag, a `[*]` outside a list and an unclosed tag stay as typed.
 */
export function parseBBCode(text: string): readonly BBNode[] {
  const stack: Stack = [{ tag: "root", children: [], source: "" }];
  let at = 0;
  for (const match of text.matchAll(TAG)) {
    const [source, slash, written = ""] = match;
    const name = written.toLowerCase();
    const after = match.index + source.length;
    // A match before `at` lies inside a `[noparse]` block.
    const read = match.index >= at;
    if (read && name === "noparse" && slash === "") {
      append(stack, text.slice(at, match.index));
      const end = noparseEnd(text, after);
      append(stack, end === undefined ? text.slice(match.index) : text.slice(after, end.start));
      at = end === undefined ? text.length : end.end;
    } else if (read && isTag(name)) {
      append(stack, text.slice(at, match.index));
      at = after;
      if (slash !== "") {
        // `[hr]` holds nothing, so `[/hr]` closes nothing and goes.
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
  return stack[0].children;
}
