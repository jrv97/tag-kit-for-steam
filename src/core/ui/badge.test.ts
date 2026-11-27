import { beforeEach, describe, expect, it } from "vitest";
import { setBody } from "../../../tests/helpers/dom";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { hostView, type HostViewOptions } from "../../../tests/helpers/host-view";
import { englishI18n } from "../../../tests/helpers/i18n";
import { STATUS_KINDS } from "../../../tests/helpers/settings";
import { framePhases } from "../dom";
import { COMPAT_FACETS } from "../kinds/compat";
import { KIND_IDS, type KindId } from "../kinds/id";
import type { ChipWords } from "../kinds/kind-settings";
import { kindsInOrder, OVERLAY_CHIPS, parseOrder } from "../kinds/order";
import { KIND_BY_ID, KINDS } from "../kinds/registry";
import { compactSize, createBadgeRenderer, FIT_ATTRIBUTE, RESERVE_PROPERTY } from "./badge";
import type { BadgeSlot } from "./host";

function capsule(): {
  host: HTMLElement;
  link: HTMLAnchorElement;
  image: HTMLElement;
  title: HTMLElement;
} {
  setBody(`
    <div class="row"><a class="link" href="/app/${String(make.appId())}/"><div class="image"></div>
    <span class="title">${make.text.name()}</span></a></div>`);
  const host = document.querySelector<HTMLElement>(".row");
  const link = document.querySelector<HTMLAnchorElement>(".link");
  const image = document.querySelector<HTMLElement>(".image");
  const title = document.querySelector<HTMLElement>(".title");
  if (host === null || link === null || image === null || title === null) {
    throw new TypeError();
  }
  return { host, link, image, title };
}

type Capsule = ReturnType<typeof capsule>;

function view(host: Element, slot: BadgeSlot | undefined, options: HostViewOptions = {}) {
  return hostView(host, { ...options, slot });
}

describe("compactSize", () => {
  it.each(
    [
      [179, 70, undefined],
      [300, 31, undefined],
      [180, 32, "text"],
      [399, 400, "text"],
      [400, 149, "text"],
      [400, 150, "large"],
    ] as const,
  )("sizes a %ipx by %ipx image as %s", (width, height, expected) => {
    expect(compactSize(width, height)).toBe(expected);
  });
});

describe("createBadgeRenderer", () => {
  const i18n = englishI18n();
  const chip = (id: KindId) => i18n.t(KIND_BY_ID[id].messages.chip);
  // The accessible name starts with the visible chip text, then Steam's full line.
  const nameOf = (id: KindId) =>
    i18n.t("kind_chip_name", { chip: chip(id), heading: i18n.t(KIND_BY_ID[id].messages.heading) });
  const AI_NAME = nameOf("ai");
  const MANY: readonly KindId[] = ["ai", "drm", "pvp", "eula", "kernel"];

  let triggers = fake.cardTriggers();
  let renderer = createBadgeRenderer(document, i18n, triggers.card);
  /** The verdicts the hover card was last bound to on `trigger`. */
  const boundTo = (trigger: Element | null) =>
    trigger === null ? undefined : triggers.bound.get(trigger)?.entries;

  beforeEach(() => {
    triggers = fake.cardTriggers();
    renderer = createBadgeRenderer(document, i18n, triggers.card);
  });

  const full = (anchor: Element): BadgeSlot => ({ kind: "full", anchor, position: "afterend" });

  /** A chip's visible text and its accessible name. */
  function texts(element: Element) {
    return [
      element.querySelector(":scope > [aria-hidden]")?.textContent,
      element.querySelector(":scope > .tks-vh")?.textContent,
    ];
  }

  const chipsIn = (host: Element) => Array.from(host.querySelectorAll(".tks-chips > *"));
  /** The chip drawn at `index` in a host, counted from the end when negative. */
  function chipAt(host: Element, index: number): Element {
    const found = chipsIn(host).at(index);
    if (found === undefined) {
      throw new RangeError(String(index));
    }
    return found;
  }
  const kindsOf = (host: Element) => chipsIn(host).map((c) => c.getAttribute("data-tks-kind"));

  it("draws the full badge with the catalog label and binds it to the hover card", () => {
    const { host, title } = capsule();
    const verdict = make.verdict.disclosed("ai", { notes: make.text.note() });
    renderer.render(view(host, full(title), { verdict }));
    const group = host.querySelector(".tks-chips");
    expect(group?.previousElementSibling).toBe(title);
    expect(group?.getAttribute("data-tks-chips")).toBe("full");
    const badge = host.querySelector<HTMLElement>(".tks-badge");
    expect(badge?.parentElement).toBe(group);
    expect(badge?.querySelector(".tks-badge-label")?.getAttribute("aria-hidden")).toBe("true");
    expect(badge?.getAttribute("data-tks-kind")).toBe("ai");
    expect(badge?.querySelector("svg")).toBeNull();
    expect(badge?.hasAttribute("title")).toBe(false);
    expect(boundTo(badge)).toEqual([verdict]);
  });

  // PvP's text matches its heading, so its name says it once.
  it.each<readonly [KindId, string, string]>([
    ...KINDS.filter((kind) => kind.id !== "pvp" && kind.facets === undefined).map(
      ({ id }) => [id, chip(id), nameOf(id)] as const,
    ),
    ["pvp", i18n.t("kind_pvp_chip"), i18n.t("kind_pvp_heading")],
  ])("gives the %s chip its text and an accessible name that starts with it", (id, label, name) => {
    const { host, title } = capsule();
    renderer.render(view(host, full(title), { verdicts: make.verdicts.only([id]) }));
    expect(texts(chipAt(host, 0))).toEqual([label, name]);
  });

  it.each(
    STATUS_KINDS.flatMap((kind) => COMPAT_FACETS.map((facet) => [kind, facet] as const)),
  )("gives a %s chip rated %s the device word and Steam's value word", (kind, facet) => {
    const { host, title } = capsule();
    const verdicts = { ...make.verdicts.only([]), [kind]: make.verdict.disclosed(kind, { facet }) };
    renderer.render(view(host, full(title), { verdicts }));
    const label = i18n.t("kind_facet_chip", {
      chip: chip(kind),
      value: i18n.t(`kind_compat_${facet}`),
    });
    const heading = i18n.t(KIND_BY_ID[kind].messages.heading);
    expect(texts(chipAt(host, 0))).toEqual([
      label,
      i18n.t("kind_chip_name", { chip: label, heading }),
    ]);
  });

  describe("with the person's chip text", () => {
    let words: ChipWords = {};
    const MINE = make.chipText();
    const ME = make.chipText();
    /** Where a chip draws: on a row, or over an image in the text or the large tier. */
    const SLOTS = {
      full: (at: Capsule) => full(at.title),
      text: (at: Capsule) => make.compactSlot(at.image, { size: "text" }),
      large: (at: Capsule) => make.compactSlot(at.image, { size: "large" }),
    };
    type SlotKind = keyof typeof SLOTS;

    beforeEach(() => {
      words = {};
      renderer = createBadgeRenderer(document, i18n, triggers.card, { words: () => words });
    });

    /** The visible text of the first chip drawn in a slot, with these texts for AI. */
    function drawnLabel(own: { chip?: string; chipCompact?: string; }, slot: SlotKind) {
      words = make.settings.chipText({ ai: own }).kinds;
      const drawn = capsule();
      renderer.render(
        view(drawn.host, SLOTS[slot](drawn), { verdicts: make.verdicts.only(["ai"]) }),
      );
      return texts(chipAt(drawn.host, 0));
    }

    it.each<readonly [SlotKind, { chip?: string; chipCompact?: string; }, string]>([
      ["full", { chip: MINE, chipCompact: ME }, MINE],
      ["large", { chip: MINE, chipCompact: ME }, MINE],
      ["text", { chip: MINE, chipCompact: ME }, ME],
      ["text", { chip: MINE }, MINE],
    ])("shows on a %s chip, given %j, the text %s", (slot, own, expected) => {
      expect(drawnLabel(own, slot)[0]).toBe(expected);
    });

    it.each<SlotKind>(["full", "text"])("falls back to the catalog on a %s chip", (slot) => {
      expect(drawnLabel({}, slot)[0]).toBe(chip("ai"));
    });

    it("sets markup as literal text, never as elements", () => {
      const markup = make.text.markup();
      const [label, name] = drawnLabel({ chip: markup }, "full");
      expect(label).toBe(markup);
      expect(name?.startsWith(markup)).toBe(true);
      expect(document.querySelector(".tks-chips b")).toBeNull();
    });

    it("draws a host again when only the text changed", () => {
      const { host, title } = capsule();
      const drawn = view(host, full(title), { verdicts: make.verdicts.only(["ai"]) });
      renderer.render(drawn);
      words = make.settings.chipText({ ai: { chip: MINE } }).kinds;
      renderer.render(drawn);
      expect(texts(chipAt(host, 0))[0]).toBe(MINE);
    });
  });

  it("draws one chip per disclosed kind, in registry order, whatever the data order", () => {
    const { host, title } = capsule();
    const verdicts = make.verdicts.only(["pvp", "drm", "ai"]);
    renderer.render(view(host, full(title), { verdicts, maxChips: 5 }));
    expect(host.querySelectorAll(".tks-chips")).toHaveLength(1);
    expect(kindsOf(host)).toEqual(["ai", "drm", "pvp"]);
    expect(chipsIn(host).map((c) => texts(c)[0])).toEqual([chip("ai"), chip("drm"), chip("pvp")]);
  });

  it("binds every chip to the verdicts of all the kinds shown", () => {
    const { host, title } = capsule();
    const verdicts = make.verdicts.full();
    renderer.render(view(host, full(title), { verdicts, maxChips: KIND_IDS.length }));
    const expected = KIND_IDS.map((id) => verdicts[id]);
    expect(chipsIn(host)).toHaveLength(KIND_IDS.length);
    for (const element of chipsIn(host)) {
      expect(boundTo(element)).toEqual(expected);
    }
  });

  describe("in the person's tag order", () => {
    let order: readonly KindId[] = KIND_IDS;

    beforeEach(() => {
      order = KIND_IDS;
      renderer = createBadgeRenderer(document, i18n, triggers.card, {
        order: () => kindsInOrder(order),
      });
    });

    it.each<readonly KindId[]>([KIND_IDS, parseOrder(["pvp", "eula"]), parseOrder(["drm"])])(
      "shows the first of %j over an image and every kind in the card, in that order",
      (...moved) => {
        order = moved;
        const { host, image } = capsule();
        const listed = order.filter((id) => MANY.includes(id));
        renderer.render(
          view(host, make.compactSlot(image), {
            verdicts: make.verdicts.only(MANY),
            maxChips: OVERLAY_CHIPS,
          }),
        );
        expect(kindsOf(host)).toEqual([...listed.slice(0, OVERLAY_CHIPS), null]);
        expect(boundTo(chipAt(host, -1))?.map((v) => v.kind)).toEqual(listed);
      },
    );

    it("draws a host again when only the order changed", () => {
      const { host, title } = capsule();
      const drawn = view(host, full(title), { verdicts: make.verdicts.only(MANY), maxChips: 5 });
      renderer.render(drawn);
      order = parseOrder(["pvp"]);
      renderer.render(drawn);
      expect(kindsOf(host)).toEqual(["pvp", ...MANY.filter((id) => id !== "pvp")]);
    });
  });

  describe("past the placement's allowance", () => {
    it("shows the allowed chips and a +N chip for the rest", () => {
      const { host, title } = capsule();
      const maxChips = 2;
      renderer.render(view(host, full(title), { verdicts: make.verdicts.only(MANY), maxChips }));
      expect(kindsOf(host)).toEqual([...MANY.slice(0, maxChips), null]);
      const more = chipAt(host, maxChips);
      const label = i18n.t("kind_chip_more", { count: String(MANY.length - maxChips) });
      expect(more.classList.contains("tks-badge")).toBe(true);
      expect(texts(more)).toEqual([
        label,
        i18n.t("kind_chip_name", { chip: label, heading: i18n.t("kind_chip_more_name") }),
      ]);
    });

    it.each<readonly [number, readonly (string | null)[]]>([
      [MANY.length, MANY],
      [0, [null]],
    ])("with an allowance of %i draws the kinds %j", (maxChips, expected) => {
      const { host, title } = capsule();
      renderer.render(view(host, full(title), { verdicts: make.verdicts.only(MANY), maxChips }));
      expect(kindsOf(host)).toEqual(expected);
    });

    it("counts only the kinds shown, not the ones whose badges are off", () => {
      const { host, title } = capsule();
      const unbadged: readonly KindId[] = ["ai", "kernel", "pvp"];
      renderer.render(
        view(host, full(title), { verdicts: make.verdicts.only(MANY), unbadged, maxChips: 2 }),
      );
      expect(kindsOf(host)).toEqual(["drm", "eula"]);
    });

    it("draws the +N chip in the compact style over an image", () => {
      const { host, image } = capsule();
      const maxChips = 1;
      renderer.render(
        view(host, make.compactSlot(image), { verdicts: make.verdicts.only(MANY), maxChips }),
      );
      const chips = chipsIn(host);
      expect(chips.map((c) => c.className)).toEqual(["tks-compact", "tks-compact"]);
      expect(chips[1]?.querySelector(".tks-compact-label")?.textContent).toBe(
        i18n.t("kind_chip_more", { count: String(MANY.length - maxChips) }),
      );
      expect(chips[1]?.getAttribute("data-tks-size")).toBe("text");
    });
  });

  describe("fitting compact chips to the image", () => {
    const ALLOWED = [...MANY.slice(0, OVERLAY_CHIPS), null];
    let frames = fake.queue();
    let fit = fake.fit();

    beforeEach(() => {
      frames = fake.queue();
      fit = fake.fit();
      renderer = createBadgeRenderer(document, i18n, triggers.card, {
        frame: framePhases(frames.frame),
        overflows: fit.overflows,
      });
    });

    /** The host's newest chip group: the one drawn last, which may still wait for its check. */
    function groupOf(host: Element): HTMLElement {
      const group = [...host.querySelectorAll<HTMLElement>(".tks-chips")].at(-1);
      if (group === undefined) {
        throw new RangeError();
      }
      return group;
    }
    const kindsIn = (group: Element) =>
      [...group.children].map((chip) => chip.getAttribute("data-tks-kind"));
    const draw = (host: Element, slot: BadgeSlot | undefined) => {
      renderer.render(
        view(host, slot, { verdicts: make.verdicts.only(MANY), maxChips: OVERLAY_CHIPS }),
      );
    };
    /** Runs frames until none is queued. */
    const settle = () => {
      while (frames.size > 0) {
        frames.run();
      }
    };

    it.each([OVERLAY_CHIPS, 1, 0])(
      "with room for %i kind chips, folds the others into +N, then shows them",
      (fits) => {
        const { host, image } = capsule();
        fit.room(fits);
        draw(host, make.compactSlot(image));
        expect(groupOf(host).getAttribute(FIT_ATTRIBUTE)).toBe("pending");
        settle();
        expect(kindsOf(host)).toEqual([...MANY.slice(0, fits), null]);
        expect(groupOf(host).hasAttribute(FIT_ATTRIBUTE)).toBe(false);
      },
    );

    it.each([
      ["the same slot", 0, 0, [null]],
      ["a wider image", 1, 0, ALLOWED],
      ["a new reach of the labels", 0, make.count(), ALLOWED],
    ])("after a fold, draws from %s the kinds %j", (_name, wider, reserve, expected) => {
      const { host, image } = capsule();
      fit.room(0);
      const slot = make.compactSlot(image);
      draw(host, slot);
      settle();
      draw(host, make.compactSlot(image, { width: slot.width + wider, reserve }));
      expect(kindsIn(groupOf(host))).toEqual(expected);
    });

    it("keeps the chips in view until the group that replaces them passes its check", () => {
      const { host, image } = capsule();
      draw(host, make.compactSlot(image));
      settle();
      const shown = groupOf(host);
      fit.room(1);
      const reserve = make.count();
      draw(host, make.compactSlot(image, { reserve }));
      expect(shown.style.getPropertyValue(RESERVE_PROPERTY)).toBe(`${String(reserve)}px`);
      frames.run();
      expect(shown.isConnected).toBe(true);
      settle();
      expect(shown.isConnected).toBe(false);
      expect(kindsOf(host)).toEqual([MANY[0], null]);
    });

    it.each([
      ["narrower", -1, "check", [MANY[0], null]],
      ["wider", 1, null, ALLOWED],
    ])("keeps a whole group in view on a %s image, checked as %s", (
      _name,
      change,
      attribute,
      expected,
    ) => {
      const { host, image } = capsule();
      const slot = make.compactSlot(image);
      draw(host, slot);
      settle();
      const group = groupOf(host);
      fit.room(1);
      draw(host, make.compactSlot(image, { width: slot.width + change }));
      expect(groupOf(host)).toBe(group);
      expect(group.getAttribute(FIT_ATTRIBUTE)).toBe(attribute);
      settle();
      expect(kindsOf(host)).toEqual(expected);
    });

    it("writes the labels' reach on the group", () => {
      const { host, image } = capsule();
      const reserve = make.count();
      draw(host, make.compactSlot(image, { reserve }));
      expect(groupOf(host).style.getPropertyValue(RESERVE_PROPERTY)).toBe(`${String(reserve)}px`);
    });

    it("checks every waiting group in one frame", () => {
      const { host, image, title } = capsule();
      draw(host, make.compactSlot(image));
      draw(title, make.compactSlot(title));
      expect(frames.size).toBe(1);
    });

    it("draws nothing for a host that lost its chips before the frame", () => {
      const { host, image } = capsule();
      draw(host, make.compactSlot(image));
      draw(host, undefined);
      settle();
      expect(chipsIn(host)).toEqual([]);
    });

    it("checks a waiting group again when it comes back to the page", () => {
      const { host, image } = capsule();
      const slot = make.compactSlot(image);
      draw(host, slot);
      const group = groupOf(host);
      group.remove();
      settle();
      image.append(group);
      draw(host, slot);
      settle();
      expect(group.hasAttribute(FIT_ATTRIBUTE)).toBe(false);
    });
  });

  it("binds a kept group to new verdicts without drawing it again", () => {
    const { host, title } = capsule();
    const slot = full(title);
    renderer.render(view(host, slot));
    const group = host.querySelector(".tks-chips");
    const next = make.verdict.disclosed("ai", { notes: make.text.note() });
    renderer.render(view(host, slot, { verdict: next }));
    expect(host.querySelector(".tks-chips")).toBe(group);
    const badge = host.querySelector(".tks-badge");
    expect(boundTo(badge)).toEqual([next]);
  });

  it("draws the group again when the kinds, the allowance or the slot change", () => {
    const { host, title, image } = capsule();
    renderer.render(view(host, full(title), { verdicts: make.verdicts.only(["ai"]) }));
    const first = host.querySelector(".tks-chips");
    renderer.render(view(host, full(title), { verdicts: make.verdicts.only(["ai", "drm"]) }));
    expect(host.querySelector(".tks-chips")).not.toBe(first);
    expect(first?.isConnected).toBe(false);
    expect(kindsOf(host)).toEqual(["ai", "drm"]);
    const verdicts = make.verdicts.only(["ai", "drm"]);
    renderer.render(view(host, full(title), { verdicts, maxChips: 1 }));
    expect(kindsOf(host)).toEqual(["ai", null]);
    renderer.render(view(host, make.compactSlot(image), { verdicts, maxChips: 1 }));
    expect(image.querySelector(".tks-chips")?.getAttribute("data-tks-chips")).toBe("compact");
  });

  it("draws the compact chips in their tier, linked to the capsule link", () => {
    const { host, image } = capsule();
    const verdicts = make.verdicts.only(["ai", "kernel"]);
    renderer.render(view(host, make.compactSlot(image, { size: "large" }), { verdicts }));
    const group = image.querySelector(".tks-chips");
    const chips = Array.from(image.querySelectorAll<HTMLElement>(".tks-chips > .tks-compact"));
    expect(group?.getAttribute("data-tks-chips")).toBe("compact");
    expect(group?.getAttribute("data-tks-in-link")).toBe("true");
    expect(chips.map((c) => c.getAttribute("data-tks-size"))).toEqual(["large", "large"]);
    expect(chips.map((c) => texts(c))).toEqual([
      [chip("ai"), AI_NAME],
      [chip("kernel"), nameOf("kernel")],
    ]);
    expect(chips.some((c) => c.hasAttribute("title"))).toBe(false);
    expect(chips.every((c) => triggers.bound.has(c))).toBe(true);
  });

  it("gives compact chips outside a link no pointer", () => {
    setBody('<div class="row"><div class="image"></div></div>');
    const host = document.querySelector(".row");
    const image = document.querySelector(".image");
    if (host === null || image === null) {
      throw new TypeError();
    }
    renderer.render(view(host, make.compactSlot(image)));
    expect(image.querySelector(".tks-chips")?.hasAttribute("data-tks-in-link")).toBe(false);
  });

  it.each([
    ["not disclosed", make.verdict.notDisclosed()],
    ["unknown", make.verdict.unknown("error")],
  ])("renders nothing for %s", (_name, verdict) => {
    const { host, title } = capsule();
    const before = host.innerHTML;
    renderer.render(view(host, full(title), { verdict }));
    expect(host.innerHTML).toBe(before);
  });

  it("draws no chip for a kind that is ignored or has its badges off", () => {
    const { host, title } = capsule();
    renderer.render(
      view(host, full(title), {
        verdicts: make.verdicts.only(["ai", "drm", "eula"]),
        ignored: ["drm"],
        unbadged: ["eula"],
      }),
    );
    expect(kindsOf(host)).toEqual(["ai"]);
  });

  it("removes the chips of a game that is ignored for every kind", () => {
    const { host, title } = capsule();
    const slot = full(title);
    renderer.render(view(host, slot));
    expect(host.querySelectorAll(".tks-badge")).toHaveLength(1);
    renderer.render(view(host, slot, { allowed: true }));
    expect(host.querySelector(".tks-chips")).toBeNull();
  });

  it("keeps the group for the same view and restores one a re-render dropped", () => {
    const { host, title } = capsule();
    const slot = full(title);
    renderer.render(view(host, slot));
    const first = host.querySelector(".tks-chips");
    renderer.render(view(host, slot));
    expect(host.querySelector(".tks-chips")).toBe(first);
    first?.remove();
    renderer.render(view(host, slot));
    expect(host.querySelectorAll(".tks-chips")).toHaveLength(1);
    expect(host.querySelector(".tks-chips")).not.toBe(first);
  });

  it("draws no chip where the placement gives no slot", () => {
    const { host } = capsule();
    renderer.render(view(host, undefined));
    expect(host.querySelector(".tks-chips, .tks-badge, .tks-compact")).toBeNull();
  });
});
