import { describe, expect, it, onTestFinished } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { fillNotes, type NotesMarkup } from "./notes";

describe("fillNotes", () => {
  const one = make.text.note();
  const two = make.text.note();
  const url = make.text.url();

  const ITEM = `<li class="tks-bb-item">`;
  const LINE = `<span class="tks-bb-line">`;
  const BOLD = `<strong class="tks-bb-bold">`;
  /** A letter whose lower case takes two UTF-16 units. */
  const LONGER = String.fromCodePoint(0x130);
  const CASES: readonly (readonly [string, NotesMarkup, string, string])[] = [
    [
      "plain text with its brackets and breaks",
      "plain",
      `[b]${one}[/b]\r\n${two}\r`,
      `[b]${one}[/b]\n${two}\n`,
    ],
    ["bold", "bbcode", `[b]${one}[/b]`, `${BOLD}${one}</strong>`],
    [
      "nested italic and underline, in any case",
      "bbcode",
      `[I][u]${one}[/U][/i]`,
      `<em class="tks-bb-italic"><u class="tks-bb-underline">${one}</u></em>`,
    ],
    [
      "both strike tags",
      "bbcode",
      `[s]${one}[/s][strike]${two}[/strike]`,
      `<s class="tks-bb-strike">${one}</s><s class="tks-bb-strike">${two}</s>`,
    ],
    [
      "the words of a link and a spoiler",
      "bbcode",
      `[url=${url}]${one}[/url][spoiler]${two}[/spoiler]`,
      `${one}${two}`,
    ],
    [
      "no picture or video",
      "bbcode",
      `${one}[img]${url}[/img][previewyoutube=${two};full][/previewyoutube]`,
      one,
    ],
    ["noparse as its raw text", "bbcode", `[noparse][b]${one}[/b][/noparse]`, `[b]${one}[/b]`],
    [
      "noparse after text whose lower case is longer",
      "bbcode",
      `${LONGER}[NOPARSE][b]${one}[/noparse]${two}`,
      `${LONGER}[b]${one}${two}`,
    ],
    ["an unclosed noparse as typed", "bbcode", `[noparse][b]${one}`, `[noparse][b]${one}`],
    ["an unknown tag as typed", "bbcode", `[update]${one}[/update]`, `[update]${one}[/update]`],
    [
      "an unknown tag's argument up to the next tag",
      "bbcode",
      `[x=[b]${one}[/b]`,
      `[x=${BOLD}${one}</strong>`,
    ],
    ["an unclosed tag as typed", "bbcode", `[i]${one}`, `[i]${one}`],
    ["a stray closing tag as typed", "bbcode", `${one}[/b]`, `${one}[/b]`],
    ["an item outside a list as typed", "bbcode", `[*]${one}`, `[*]${one}`],
    [
      "a list as Steam writes it, with the breaks around it",
      "bbcode",
      `${one}\r\n\r\n[list]\r\n[*] ${one}\r\n[/*][*] ${two}[/list]\r\n\r\n${two}`,
      `${one}\n\n<ul class="tks-bb-list">${ITEM} ${one}\n</li>${ITEM} ${two}</li></ul>\n${two}`,
    ],
    [
      "an ordered list left open",
      "bbcode",
      `[olist][*]${one}[*]${two}`,
      `<ol class="tks-bb-list tks-bb-olist">${ITEM}${one}</li>${ITEM}${two}</li></ol>`,
    ],
    [
      "text before a list's first item as an item, and an item closing its tags",
      "bbcode",
      `[list]${one}[*][b]${two}[*]${one}[/list]`,
      `<ul class="tks-bb-list">${ITEM}${one}</li>${ITEM}${BOLD}${two}</strong></li>`
      + `${ITEM}${one}</li></ul>`,
    ],
    [
      "a heading as bold text on its own line",
      "bbcode",
      `[h2]${one}[/h2]\n${two}`,
      `<strong class="tks-bb-heading">${one}</strong>${two}`,
    ],
    [
      "the break at the start of an inline tag",
      "bbcode",
      `${one}\n[b]\n${two}[/b]`,
      `${one}\n${BOLD}\n${two}</strong>`,
    ],
    [
      "paragraphs and table rows as lines",
      "bbcode",
      `[p]${one}[/p][table][tr][td]${two}[/td][/tr][/table]`,
      `${LINE}${one}</span>${LINE}${two}</span>`,
    ],
    [
      "a quote without its author",
      "bbcode",
      `[quote=${two}]${one}[/quote]`,
      `<blockquote class="tks-bb-quote">${one}</blockquote>`,
    ],
    ["code", "bbcode", `[code]${one}[/code]`, `<code class="tks-bb-code">${one}</code>`],
    ["a rule", "bbcode", `${one}[hr][/hr]${two}`, `${one}<hr class="tks-bb-rule">${two}`],
  ];

  /** The HTML a target holds once filled; it starts with text, which the fill replaces. */
  function filled(markup: NotesMarkup, text: string): string {
    const target = document.createElement("div");
    target.textContent = make.text.note();
    fillNotes(target, text, markup);
    return target.innerHTML;
  }

  it.each(CASES)("sets %s", (_name, markup, text, html) => {
    expect(filled(markup, text)).toBe(html);
  });

  it("sets the same beside Prototype.js's patched built-ins", () => {
    onTestFinished(fake.prototypeJs());
    expect(CASES.map(([, markup, text]) => filled(markup, text))).toEqual(
      CASES.map(([, , , html]) => html),
    );
  });
});
