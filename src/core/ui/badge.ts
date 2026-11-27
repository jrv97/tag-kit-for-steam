import { animationFrame, detach, type FramePhases, framePhases } from "../dom";
import { facetOf } from "../kinds/facets";
import type { KindId } from "../kinds/id";
import type { TagKind } from "../kinds/kind";
import type { ChipWords } from "../kinds/kind-settings";
import { registryOrder } from "../kinds/order";
import { KIND_BY_ID } from "../kinds/registry";
import { type AnyDisclosed, sameVerdicts } from "../kinds/verdicts";
import type { MessageCatalog } from "../ports";
import { createElement } from "./element";
import type { BadgeSlot, CompactSize, HostRenderer } from "./host";
import type { CardTriggers } from "./hover-card";
import { KIND_ATTRIBUTE } from "./kind-attributes";
import { type ChipText, chipText } from "./kind-details";

/** Compact badge tiers by image box (components.mdx, section 2). Smaller images get none. */
const TEXT_MIN_WIDTH = 180;
const TEXT_MIN_HEIGHT = 32;
const LARGE_MIN_WIDTH = 400;
const LARGE_MIN_HEIGHT = 150;

/** The compact badge tier for an image box, or undefined when the image is too small for one. */
export function compactSize(width: number, height: number): CompactSize | undefined {
  if (width < TEXT_MIN_WIDTH || height < TEXT_MIN_HEIGHT) {
    return undefined;
  }
  return width >= LARGE_MIN_WIDTH && height >= LARGE_MIN_HEIGHT ? "large" : "text";
}

/** An ARIA or data token, not copy. */
const TRUE = "true";

/** Written on a compact group: how far the store's deal labels reach into the image (CSS). */
export const RESERVE_PROPERTY = "--tks-compact-reserve";
/**
 * Set on a compact group until the next frame's fit check. CSS hides a `pending` group; a group
 * whose image narrowed stays in view as `check`.
 */
export const FIT_ATTRIBUTE = "data-tks-fit";

/** The person's text for a kind's chips; small images (`compact`) take the short one first. */
export function ownText(
  words: ChipWords | undefined,
  id: KindId,
  compact?: boolean,
): string | undefined {
  const own = words?.[id];
  return compact === true ? own?.chipCompact ?? own?.chip : own?.chip;
}

/** A verdict's chip, in the person's words for the kind when there are some. */
function verdictText(
  i18n: MessageCatalog,
  verdict: AnyDisclosed,
  words: ChipWords | undefined,
  compact?: boolean,
): ChipText {
  const own = ownText(words, verdict.kind, compact);
  return chipText(i18n, KIND_BY_ID[verdict.kind], facetOf(verdict), own);
}

/** The "+N" chip's text, for the N kinds that did not fit. */
function moreText(i18n: MessageCatalog, count: number): ChipText {
  const label = i18n.t("kind_chip_more", { count: String(count) });
  const name = i18n.t("kind_chip_name", { chip: label, heading: i18n.t("kind_chip_more_name") });
  return { label, name };
}

/**
 * A chip: the short text, which screen readers skip, and the accessible name read instead. The
 * name starts with the visible text and goes on with Steam's full line. A kind's chip carries the
 * kind, so the style rules can switch its badges off.
 */
export function createChipElement(
  doc: Document,
  text: ChipText,
  className: string,
  labelClass: string,
  kind?: KindId,
): HTMLElement {
  const chip = createElement(doc, "span", className);
  if (kind !== undefined) {
    chip.setAttribute(KIND_ATTRIBUTE, kind);
  }
  const label = createElement(doc, "span", labelClass, text.label);
  label.setAttribute("aria-hidden", TRUE);
  chip.append(label, createElement(doc, "span", "tks-vh", text.name));
  return chip;
}

/** The full badge's chip, the store's tag-chip shape in our hue. The tag section reuses it. */
export function createChip(
  doc: Document,
  i18n: MessageCatalog,
  verdict: AnyDisclosed,
  words?: ChipWords,
): HTMLElement {
  return createChipElement(
    doc,
    verdictText(i18n, verdict, words),
    "tks-badge",
    "tks-badge-label",
    verdict.kind,
  );
}

/** The `span.tks-chips` that holds chips of one size, so a row or a section places them as one. */
export function createChipGroup(doc: Document, size: BadgeSlot["kind"]): HTMLElement {
  const group = createElement(doc, "span", "tks-chips");
  group.setAttribute("data-tks-chips", size);
  return group;
}

/** What a host's chips stand for and where they go. */
interface Draw {
  /** The disclosed verdicts the chips stand for, in chip order. */
  readonly present: readonly AnyDisclosed[];
  readonly slot: BadgeSlot;
  readonly maxChips: number;
  /** The kind chips drawn before the "+N" chip: `maxChips`, less those folded to fit. */
  readonly shown: number;
  /** The person's chip text the chips were drawn with. */
  readonly words: ChipWords | undefined;
}

interface Drawn extends Draw {
  /** The `span.tks-chips` that holds this host's chips. */
  readonly group: HTMLElement;
}

/** Whether two slots differ at most in the width of their image box. */
function sameSlot(a: BadgeSlot, b: BadgeSlot): boolean {
  return a.anchor === b.anchor && a.position === b.position
    && (a.kind === "full"
      ? b.kind === "full"
      : b.kind === "compact" && a.size === b.size && a.reserve === b.reserve);
}

/** The width of a compact slot's image box; 0 for a full slot. */
function widthOf(slot: BadgeSlot): number {
  return slot.kind === "compact" ? slot.width : 0;
}

/** Whether a chip of the group shows its text cut short. */
function cutShort(group: Element): boolean {
  for (const label of group.querySelectorAll(".tks-compact-label")) {
    if (label.scrollWidth > label.clientWidth) {
      return true;
    }
  }
  return false;
}

/**
 * Whether the lists draw the same chips: the same kinds and values in the same order, which makes
 * a new tag order a change.
 */
function sameChips(a: readonly AnyDisclosed[], b: readonly AnyDisclosed[]): boolean {
  return a.length === b.length && a.every((verdict, index) => {
    const other = b[index];
    return other?.kind === verdict.kind && facetOf(other) === facetOf(verdict);
  });
}

export interface BadgeRendererOptions {
  /** The kinds in the person's tag order; the registry's order by default. */
  readonly order?: () => readonly TagKind[];
  /** The person's chip text, a new object only when a text changed. */
  readonly words?: () => ChipWords;
  /**
   * Runs the fit check's reads, then its writes; one per `requestAnimationFrame` by default. The
   * capsule UI shares it, which keeps every read of a frame before its writes.
   */
  readonly frame?: FramePhases;
  /** Whether a compact group shows a chip's text cut short; reads the labels' widths by default. */
  readonly overflows?: (group: Element) => boolean;
}

/**
 * Draws a host's chips in the slot its placement chose: one text chip for each kind that is
 * disclosed, not ignored and shown by its settings, in the person's tag order. A placement shows
 * the first `maxChips` of them; a "+N" chip stands for the rest. On an image, a kind chip that
 * does not fit whole folds into the "+N" chip too, checked in the next frame. A wider image draws
 * a folded group again; a narrower one checks the group in place. Each chip shows the person's
 * text when there is one. Every chip registers with the hover card, which lists all the kinds. A
 * host with no such kind loses its chips. The chips of a host sit in one group, so a refresh
 * removes and places them as one.
 */
export function createBadgeRenderer(
  doc: Document,
  i18n: MessageCatalog,
  card: CardTriggers,
  options: BadgeRendererOptions = {},
): HostRenderer {
  const { words } = options;
  const order = options.order ?? registryOrder;
  const frame = options.frame ?? framePhases(animationFrame(doc));
  const overflows = options.overflows ?? cutShort;
  const drawn = new WeakMap<Element, Drawn>();
  /** Hosts whose compact chips wait for the next frame to check that they fit. */
  let fitting = new Set<Element>();

  function chipFor(slot: BadgeSlot, text: ChipText, kind?: KindId): HTMLElement {
    if (slot.kind === "full") {
      return createChipElement(doc, text, "tks-badge", "tks-badge-label", kind);
    }
    const chip = createChipElement(doc, text, "tks-compact", "tks-compact-label", kind);
    chip.setAttribute("data-tks-size", slot.size);
    return chip;
  }

  function build({ slot, present, shown, words: texts }: Draw): HTMLElement {
    const group = createChipGroup(doc, slot.kind);
    const compact = slot.kind === "compact" && slot.size === "text";
    for (const verdict of present.slice(0, shown)) {
      group.append(chipFor(slot, verdictText(i18n, verdict, texts, compact), verdict.kind));
    }
    if (present.length > shown) {
      group.append(chipFor(slot, moreText(i18n, present.length - shown)));
    }
    if (slot.kind === "compact" && slot.reserve > 0) {
      group.style.setProperty(RESERVE_PROPERTY, `${String(slot.reserve)}px`);
    }
    return group;
  }

  /** Compact chips inside the capsule's own link take the link's pointer and open the card. */
  function linkCompact(group: HTMLElement, host: Element): void {
    const link = group.parentElement?.closest("a");
    if (link !== null && link !== undefined && (host.contains(link) || link.contains(host))) {
      group.setAttribute("data-tks-in-link", TRUE);
    }
  }

  function bind(group: HTMLElement, present: readonly AnyDisclosed[]): void {
    for (const chip of group.children) {
      card.bind(chip, present);
    }
  }

  /** Queues the host's group for the next fit check. */
  function check(host: Element): void {
    fitting.add(host);
    if (fitting.size === 1) {
      frame.read(fit);
    }
  }

  /** Places a host's chips. Compact kind chips wait hidden for the next fit check. */
  function place(host: Element, draw: Draw): void {
    const group = build(draw);
    draw.slot.anchor.insertAdjacentElement(draw.slot.position, group);
    if (draw.slot.kind === "compact") {
      linkCompact(group, host);
      if (draw.shown > 0) {
        group.setAttribute(FIT_ATTRIBUTE, "pending");
      }
    }
    bind(group, draw.present);
    drawn.set(host, { ...draw, group });
    if (group.hasAttribute(FIT_ATTRIBUTE)) {
      check(host);
    }
  }

  /**
   * Keeps a host's group for its new slot. A narrower image checks the group in view. A group that
   * still waits for its check, as after it left the page and came back, waits again.
   */
  function keep(
    host: Element,
    current: Drawn,
    present: readonly AnyDisclosed[],
    slot: BadgeSlot,
  ): void {
    if (!sameVerdicts(current.present, present)) {
      bind(current.group, present);
    }
    drawn.set(host, { ...current, present, slot });
    const { group, shown } = current;
    if (widthOf(slot) < widthOf(current.slot) && shown > 0 && !group.hasAttribute(FIT_ATTRIBUTE)) {
      group.setAttribute(FIT_ATTRIBUTE, "check");
    }
    if (group.hasAttribute(FIT_ATTRIBUTE)) {
      check(host);
    }
  }

  /**
   * Reads every waiting group and returns the write. Where a chip shows its text cut short, one
   * more kind chip folds into "+N" and the group waits for another check. The others show.
   */
  function fit(): () => void {
    const hosts = fitting;
    fitting = new Set();
    const checks: { readonly host: Element; readonly current: Drawn; readonly short: boolean; }[] =
      [];
    for (const host of hosts) {
      const current = drawn.get(host);
      if (current?.group.isConnected === true && current.group.hasAttribute(FIT_ATTRIBUTE)) {
        checks.push({ host, current, short: overflows(current.group) });
      }
    }
    return () => {
      for (const { host, current, short } of checks) {
        if (drawn.get(host) !== current) {
          continue;
        }
        if (short && current.shown > 0) {
          detach(current.group);
          place(host, { ...current, shown: current.shown - 1 });
        } else {
          current.group.removeAttribute(FIT_ATTRIBUTE);
        }
      }
    };
  }

  return {
    render({ host, verdicts, allowed, badged, slot, maxChips }) {
      let present: AnyDisclosed[] | undefined;
      for (const kind of order()) {
        const verdict = verdicts[kind.id];
        if (verdict.state === "disclosed" && !allowed[kind.id] && badged[kind.id]) {
          (present ??= []).push(verdict);
        }
      }
      const current = drawn.get(host);
      const texts = words?.();
      if (present === undefined || slot === undefined) {
        detach(current?.group);
        drawn.delete(host);
        return;
      }
      const shown = Math.min(maxChips, present.length);
      if (
        current !== undefined && current.group.isConnected && sameSlot(current.slot, slot)
        && current.maxChips === maxChips && current.words === texts
        && sameChips(current.present, present)
        && (current.shown === shown || widthOf(slot) <= widthOf(current.slot))
      ) {
        keep(host, current, present, slot);
        return;
      }
      detach(current?.group);
      place(host, { present, slot, maxChips, shown, words: texts });
    },
  };
}
