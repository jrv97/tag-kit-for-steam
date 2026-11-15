import { describe, expect, it, onTestFinished } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { fillNotes, normalizeBreaks, type NotesMarkup } from "./notes";

describe("normalizeBreaks", () => {
  it("turns CRLF and lone CR into LF", () => {
    expect(normalizeBreaks("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
  });
});

describe("fillNotes", () => {
  const one = make.text.note();
  const two = make.text.note();
  const url = make.text.url();

  const ITEM = `<li class="tks-bb-item">`;
  const CASES: readonly (readonly [string, NotesMarkup, string, string])[] = [
    ["plain text with its brackets", "plain", `[b]${one}[/b]\r\n`, `[b]${one}[/b]\n`],
    ["bold", "bbcode", `[b]${one}[/b]`, `<strong class="tks-bb-bold">${one}</strong>`],
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
      "a spoiler",
      "bbcode",
      `[spoiler]${one}[/spoiler]`,
      `<span class="tks-bb-spoiler">${one}</span>`,
    ],
    ["a link as its words alone", "bbcode", `[url=${url}]${one}[/url]`, one],
    ["no picture", "bbcode", `${one}[img]${url}[/img]`, one],
    ["noparse as its raw text", "bbcode", `[noparse][b]${one}[/b][/noparse]`, `[b]${one}[/b]`],
    ["an unknown tag as text", "bbcode", `[update]${one}[/update]`, `[update]${one}[/update]`],
    ["a tag that never closes as text", "bbcode", `[i]${one}`, `[i]${one}`],
    ["a stray closing tag as text", "bbcode", `${one}[/b]`, `${one}[/b]`],
    ["an item outside a list as text", "bbcode", `[*]${one}`, `[*]${one}`],
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
      `<ol class="tks-bb-list">${ITEM}${one}</li>${ITEM}${two}</li></ol>`,
    ],
    [
      "a heading as bold text on its own line",
      "bbcode",
      `[h2]${one}[/h2]\n${two}`,
      `<strong class="tks-bb-heading">${one}</strong>${two}`,
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

  it("sets HTML inside the developer's BBCode as text", () => {
    const markup = make.text.markup();
    const target = document.createElement("div");
    fillNotes(target, `[b]${markup}[/b]`, "bbcode");
    expect(target.querySelector("b")).toBeNull();
    expect(target.textContent).toBe(markup);
  });

  it("sets the same beside Prototype.js's patched built-ins", () => {
    onTestFinished(fake.prototypeJs());
    expect(CASES.map(([, markup, text]) => filled(markup, text))).toEqual(
      CASES.map(([, , , html]) => html),
    );
  });
});
