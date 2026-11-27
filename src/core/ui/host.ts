import type { KindId } from "../kinds/id";
import type { KindVerdicts } from "../kinds/verdicts";

/** The tier of a compact badge, from the measured image box (see `compactSize`). */
export type CompactSize = "text" | "large";

/**
 * Where a host's badge goes. The placement picks the anchor and the position; for a compact badge
 * the scanner measures the image box in its batched read and passes the tier, the box's width and
 * how far the store's deal labels reach into it.
 */
export type BadgeSlot =
  | { readonly kind: "full"; readonly anchor: Element; readonly position: InsertPosition; }
  | {
    readonly kind: "compact";
    readonly anchor: Element;
    readonly position: InsertPosition;
    readonly size: CompactSize;
    /** The image box's inline size, whole pixels. A new width alone keeps a drawn group. */
    readonly width: number;
    /** Whole pixels from the box's inline-start edge to the far edge of the store's labels. */
    readonly reserve: number;
  };

/** What the renderers need to know about one capsule host. */
export interface HostView {
  readonly host: Element;
  readonly verdicts: KindVerdicts;
  /**
   * Per kind: the game, or the base game of a DLC, is on the allow-list, so nothing marks it, in
   * lists or on badges.
   */
  readonly allowed: Readonly<Record<KindId, boolean>>;
  /** Per kind: the kind's badge shows, by its settings. Ignored games and other states aside. */
  readonly badged: Readonly<Record<KindId, boolean>>;
  /** How many chips the placement shows before the "+N" chip. */
  readonly maxChips: number;
  /** Where the badge goes; undefined when the placement shows none (a thumbnail too small). */
  readonly slot: BadgeSlot | undefined;
  /** False where hiding would break the list (virtualized, carousel); hide then dims. */
  readonly hideable: boolean;
  /** A lookup or a retry round will answer for the game again, so a failure is not final yet. */
  readonly pending: boolean;
}

/**
 * Draws one host. Idempotent: rendering the same view again keeps what is there, a new view
 * replaces it, and a badge a store re-render dropped is put back.
 */
export interface HostRenderer {
  render(view: HostView): void;
}
