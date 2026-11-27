import { failedForGood } from "../cache/ttl";
import { createTransientRetry, type Delay } from "../detect/retry";
import { animationFrame, type FramePhases, framePhases } from "../dom";
import type { KindId } from "../kinds/id";
import { KINDS, perKind } from "../kinds/registry";
import { type KindVerdicts, recheckIds, type Relations, UNKNOWN_KINDS } from "../kinds/verdicts";
import type { Logger } from "../log";
import type { Detector } from "../ports";
import type { LoadTracker, Recheck } from "../progress";
import { sameLayer } from "../scan/layers";
import { HOST_APPID } from "../scan/marks";
import { type RowPlacement, STORE_LABEL_BOX, STORE_LABELS } from "../scan/placements";
import type { CapsuleHost, CapsuleRenderer, ScanBatch } from "../scan/renderer";
import type { AppId } from "../types";
import { compactSize } from "./badge";
import type { BadgeSlot, HostRenderer } from "./host";

/** Where a full badge goes for each row slot, relative to its anchor. */
const ROW_POSITION = {
  after: "afterend",
  end: "beforeend",
} as const satisfies Record<RowPlacement["slot"], InsertPosition>;
/** Set on a capsule image box that computes to `position: static`; CSS makes it relative. */
const ANCHOR_MARK = "data-tks-anchor";
/** Positions that already contain an absolutely placed badge. */
const POSITIONED: ReadonlySet<string> = new Set(["relative", "absolute", "fixed", "sticky"]);

/** Watches elements for a change of size; `ResizeObserver` fits it as is. */
export interface SizeWatch {
  observe(element: Element): void;
  unobserve(element: Element): void;
  /** Stops watching every element. */
  disconnect(): void;
}

/** An element whose box changed size, with its new layout width in whole pixels: 0 with no box. */
export interface Resized {
  readonly element: Element;
  readonly width: number;
}

/** Makes a size watch that reports elements whose box changed size, a removed one included. */
type SizeWatchFactory = (onSized: (resized: readonly Resized[]) => void) => SizeWatch;

/** One `ResizeObserver` for the page; a no-op where the document has no window. */
function resizeWatch(doc: Document): SizeWatchFactory {
  return (onSized) => {
    const view = doc.defaultView;
    if (view === null) {
      return { observe: () => undefined, unobserve: () => undefined, disconnect: () => undefined };
    }
    return new view.ResizeObserver((entries) => {
      onSized(entries.map((entry) => ({
        element: entry.target,
        width: Math.round(entry.borderBoxSize[0]?.inlineSize ?? entry.contentRect.width),
      })));
    });
  };
}

/**
 * The element's layout size in whole pixels, transforms left out, as the size watch reports it. A
 * hover scale changes neither.
 */
function layoutSize(element: Element, box: DOMRect): { width: number; height: number; } {
  return element instanceof HTMLElement
    ? { width: element.offsetWidth, height: element.offsetHeight }
    : { width: Math.round(box.width), height: Math.round(box.height) };
}

/** The host's own box for the store's deal labels, outside any store layer inside the host. */
function labelBoxOf(host: Element): Element | undefined {
  for (const labels of host.querySelectorAll(STORE_LABEL_BOX)) {
    if (sameLayer(labels, host)) {
      return labels;
    }
  }
  return undefined;
}

/**
 * Whole pixels from the image box's inline-start edge to the far edge of the store's deal labels
 * on it, or 0 with none. The compact chips end a gap short of that edge. A label inside a store
 * layer of the host, as in a hover card, does not count.
 */
function reserveOf(host: Element, box: DOMRect, rtl: boolean): number {
  let reserve = 0;
  for (const label of host.querySelectorAll(STORE_LABELS)) {
    const edge = label.getBoundingClientRect();
    const overlaps = edge.width > 0 && edge.bottom > box.top && edge.top < box.bottom
      && edge.right > box.left && edge.left < box.right;
    if (overlaps && sameLayer(label, host)) {
      reserve = Math.max(reserve, rtl ? box.right - edge.left : edge.right - box.left);
    }
  }
  return Math.ceil(reserve);
}

export interface CapsuleUiOptions {
  readonly document: Document;
  readonly detector: Detector;
  /** Drawn in order for every host: state marks, badges. */
  readonly renderers: readonly HostRenderer[];
  /** Whether the game is ignored for the kind now, given what Valve's data relates it to. */
  readonly isAllowed: (id: AppId, kind: KindId, related: Relations) => boolean;
  /** Whether the kind's badges show now, by its settings. */
  readonly isBadged: (kind: KindId) => boolean;
  /** What the renderers draw of an app's verdicts now (`taggedView`); the verdicts by default. */
  readonly tagged?: (verdicts: KindVerdicts) => KindVerdicts;
  /**
   * Runs the reads, then the writes, of a frame; one per `requestAnimationFrame` by default. The
   * badge renderer shares it, which keeps its fit check's reads before any write.
   */
  readonly frame?: FramePhases;
  /** Watches the image boxes of compact badges for a new size; one `ResizeObserver` by default. */
  readonly watchSize?: SizeWatchFactory;
  /** Waits out a retry round after a transient answer; `setTimeout` by default. */
  readonly delay?: Delay;
  /** Hears which games the hosts ask for and how each answer lands. */
  readonly progress?: LoadTracker;
  /** Logs a lookup that failed. */
  readonly logger: Pick<Logger, "error">;
}

/** The scanner's renderer, plus a way to draw known hosts again after a change. */
export interface CapsuleUi extends CapsuleRenderer {
  /**
   * Draws every known host again, or only those of `ids` and the DLC and demos whose base or full
   * game is in `ids`, as after an allow-list change.
   */
  refresh(ids?: ReadonlySet<AppId>): void;
  /**
   * Asks again, in one call, about the known hosts whose verdicts are `stale`, as when a kind that
   * reads a section their answers lack turns on. They keep drawing what they hold meanwhile.
   */
  redetect(stale: (verdicts: KindVerdicts) => boolean): void;
  /**
   * Takes the known hosts whose lookup failed with no retry ahead, to ask again in one call once
   * the cache dropped their failed answers; undefined when there are none. A host taken stays
   * out of the next recheck until its answer lands.
   */
  recheck(): Recheck | undefined;
  /** Stops watching image boxes, cancels a pending retry and stops listening for `pagehide`. */
  stop(): void;
}

interface HostRecord {
  host: CapsuleHost;
  verdicts: KindVerdicts | undefined;
  /** Per kind: the game is ignored. Each draw refreshes it, so drawing allocates nothing. */
  readonly allowed: Record<KindId, boolean>;
  /** Per kind: the badge shows. Refreshed by each draw like `allowed`. */
  readonly badged: Record<KindId, boolean>;
  /** A lookup in flight or a retry round will answer for the game again. */
  pending: boolean;
  /** The layout width of a compact badge's image box at its last read, in whole pixels. */
  width: number;
  /** The box of the store's deal labels on the image, in the size watch beside the image. */
  labels: Element | undefined;
  /** The layout width of `labels` at its last read, in whole pixels. */
  labelsWidth: number;
}

const NOT_ALLOWED: Readonly<Record<KindId, boolean>> = perKind(() => false);
const ALL_BADGED: Readonly<Record<KindId, boolean>> = perKind(() => true);

/** One host's draw, decided in the read phase. */
interface Draw {
  readonly record: HostRecord;
  readonly verdicts: KindVerdicts;
  readonly allowed: Readonly<Record<KindId, boolean>>;
  readonly badged: Readonly<Record<KindId, boolean>>;
  readonly slot: BadgeSlot | undefined;
  readonly markAnchor: boolean;
}

/** Where a host's badge goes, and the widths of a compact badge's image box and label box. */
interface SlotRead {
  readonly slot: BadgeSlot | undefined;
  readonly markAnchor: boolean;
  readonly width: number;
  readonly labels: Element | undefined;
  readonly labelsWidth: number;
}

const NO_SLOT: SlotRead = {
  slot: undefined,
  markAnchor: false,
  width: 0,
  labels: undefined,
  labelsWidth: 0,
};

/**
 * The adapter between the scanner and the renderers. Found hosts are detected in one call per
 * scan batch (the detector batches and caches) and drawn as each part of its answer lands;
 * changed hosts are drawn again from their known verdicts. Drawing reads every image box first
 * and writes after, in one frame per pass. Records live in a `WeakMap` keyed by host, and a
 * refresh walks the marked hosts in the page, so no host outlives its element. The image box and
 * the deal label box of every host with a compact badge to show sit in one shared size watch,
 * which draws the host again when either takes a new width: a window resize, a box that had no
 * size, or a store label that shows late or resizes. A box that loses its size, as in a hidden
 * tab, keeps what it shows. Showing a hidden tab changes no node the scanner sees.
 */
export function createCapsuleUi(options: CapsuleUiOptions): CapsuleUi {
  const { document: doc, detector, renderers, isAllowed, isBadged, progress, logger } = options;
  const tagged = options.tagged ?? ((verdicts: KindVerdicts) => verdicts);
  const frame = options.frame ?? framePhases(animationFrame(doc));
  const records = new WeakMap<Element, HostRecord>();
  /** Image and label boxes of compact badges in the size watch, with the host to draw again. */
  let watched = new WeakMap<Element, HostRecord>();
  /** Watched hosts whose image had no size at its last read; `sweep` lets go of removed ones. */
  let unsized = new Set<HostRecord>();
  const watchSize = options.watchSize ?? resizeWatch(doc);
  let sizeWatch: SizeWatch | undefined;
  let queued = new Set<HostRecord>();
  const retry = createTransientRetry<HostRecord>((due) => {
    const connected = due.filter((record) => record.host.element.isConnected);
    giveUp(due.filter((record) => !record.host.element.isConnected));
    if (connected.length > 0) {
      void detect(connected);
    }
  }, options.delay);

  /**
   * Counts the games of hosts that will not be asked again as answered, with what they hold. It
   * queues no draw: these hosts left the page, or the UI stops.
   */
  function giveUp(records: readonly HostRecord[]): void {
    for (const record of records) {
      record.pending = false;
      if (record.verdicts !== undefined) {
        progress?.answered(record.host.appId, record.verdicts, false);
      }
    }
  }

  function slotOf(host: CapsuleHost): SlotRead {
    const { placement, anchor } = host;
    if (placement.badge === "full") {
      return {
        ...NO_SLOT,
        slot: { kind: "full", anchor, position: ROW_POSITION[placement.slot] },
      };
    }
    const box = anchor.getBoundingClientRect();
    const { width, height } = layoutSize(anchor, box);
    const size = compactSize(width, height);
    if (size === undefined) {
      return { ...NO_SLOT, width };
    }
    const style = doc.defaultView?.getComputedStyle(anchor);
    const markAnchor = !anchor.hasAttribute(ANCHOR_MARK) && !POSITIONED.has(style?.position ?? "");
    const reserve = reserveOf(host.element, box, style?.direction === "rtl");
    const labels = labelBoxOf(host.element);
    return {
      slot: { kind: "compact", anchor, position: "beforeend", size, width, reserve },
      markAnchor,
      width,
      labels,
      labelsWidth: labels === undefined
        ? 0
        : layoutSize(labels, labels.getBoundingClientRect()).width,
    };
  }

  /**
   * Draws a watched host again when its image box or its label box takes a new width, while both
   * are still the host's. A label the store adds late or a font that swaps in changes the label
   * box's width.
   */
  function onSized(resized: readonly Resized[]): void {
    sweep();
    for (const { element, width } of resized) {
      const record = watched.get(element);
      if (record === undefined || (element !== record.host.anchor && element !== record.labels)) {
        unwatch(element);
      } else if (!record.host.anchor.isConnected) {
        unsized.delete(record);
        unwatchHost(record);
      } else if (!element.isConnected) {
        // The label box left a host that stays; the next draw watches the one that took its place.
        unwatch(element);
        queue(record);
      } else if (width !== (element === record.labels ? record.labelsWidth : record.width)) {
        queue(record);
      }
    }
  }

  function observe(element: Element, record: HostRecord): void {
    if (!watched.has(element)) {
      sizeWatch ??= watchSize(onSized);
      sizeWatch.observe(element);
    }
    watched.set(element, record);
  }

  /** Watches the host's image box and `labels`, its label box when it has one. */
  function watch(record: HostRecord, labels: Element | undefined): void {
    observe(record.host.anchor, record);
    if (record.labels !== undefined && record.labels !== labels) {
      unwatch(record.labels);
    }
    record.labels = labels;
    if (labels !== undefined) {
      observe(labels, record);
    }
  }

  function unwatch(element: Element): void {
    if (watched.delete(element)) {
      sizeWatch?.unobserve(element);
    }
  }

  function unwatchHost(record: HostRecord): void {
    unwatch(record.host.anchor);
    if (record.labels !== undefined) {
      unwatch(record.labels);
      record.labels = undefined;
    }
  }

  /**
   * Lets go of the boxes of hosts that left the page while their image had no size. The size
   * watch reports no such removal.
   */
  function sweep(): void {
    for (const record of unsized) {
      if (!record.host.anchor.isConnected) {
        unsized.delete(record);
        unwatchHost(record);
      }
    }
  }

  /**
   * Lets go of the size watch and the pending retry, as on `pagehide`; a later draw starts a new
   * watch if it needs it.
   */
  function disconnect(): void {
    giveUp(retry.cancel());
    sizeWatch?.disconnect();
    sizeWatch = undefined;
    watched = new WeakMap();
    unsized = new Set();
  }

  /** Reads the queued hosts' image boxes, and returns the write that draws them. */
  function drawQueued(): () => void {
    sweep();
    const batch = queued;
    queued = new Set();
    const draws: Draw[] = [];
    for (const record of batch) {
      const { host, allowed, badged } = record;
      if (!host.element.isConnected) {
        unsized.delete(record);
        unwatchHost(record);
        continue;
      }
      if (record.verdicts === undefined) {
        continue;
      }
      const verdicts = tagged(record.verdicts);
      let shows = false;
      for (const kind of KINDS) {
        allowed[kind.id] = isAllowed(host.appId, kind.id, verdicts);
        badged[kind.id] = isBadged(kind.id);
        shows ||= verdicts[kind.id].state === "disclosed" && !allowed[kind.id]
          && badged[kind.id];
      }
      const { slot, markAnchor, width, labels, labelsWidth } = shows ? slotOf(host) : NO_SLOT;
      const compact = shows && host.placement.badge === "compact";
      if (compact) {
        watch(record, labels);
      } else {
        unwatchHost(record);
      }
      record.labelsWidth = labelsWidth;
      if (compact && width === 0) {
        unsized.add(record);
      } else {
        unsized.delete(record);
      }
      // A box that lost its size, as in a hidden tab, keeps what it shows until it has one again.
      const keeps = compact && width === 0 && record.width > 0;
      record.width = width;
      if (!keeps) {
        draws.push({ record, verdicts, allowed, badged, slot, markAnchor });
      }
    }
    return () => {
      for (const { record, verdicts, allowed, badged, slot, markAnchor } of draws) {
        if (markAnchor && slot !== undefined) {
          slot.anchor.setAttribute(ANCHOR_MARK, "");
        }
        const view = {
          host: record.host.element,
          verdicts,
          allowed,
          badged,
          maxChips: record.host.placement.maxChips,
          slot,
          hideable: record.host.placement.hideable,
          pending: record.pending,
        };
        for (const renderer of renderers) {
          renderer.render(view);
        }
      }
    };
  }

  /** Whether the host shows one of `ids`, or a DLC or demo of one of them. */
  function concerns(ids: ReadonlySet<AppId>, record: HostRecord): boolean {
    const parent = record.verdicts?.parent;
    return ids.has(record.host.appId) || (parent !== undefined && ids.has(parent));
  }

  /** The known hosts in the page whose record and verdicts `pick` takes. */
  function knownRecords(
    pick: (record: HostRecord, verdicts: KindVerdicts) => boolean,
  ): HostRecord[] {
    const picked: HostRecord[] = [];
    for (const element of doc.querySelectorAll(`[${HOST_APPID}]`)) {
      const record = records.get(element);
      if (record?.verdicts !== undefined && pick(record, record.verdicts)) {
        picked.push(record);
      }
    }
    return picked;
  }

  function queue(record: HostRecord): void {
    queued.add(record);
    if (queued.size === 1) {
      frame.read(drawQueued);
    }
  }

  /**
   * Asks for the hosts' games in one call and draws each host as its game's answer lands, which
   * may be before the call resolves. A host whose game got no answer draws as failed.
   */
  async function detect(found: readonly HostRecord[]): Promise<void> {
    const waiting = new Map<AppId, HostRecord[]>();
    for (const record of found) {
      record.pending = true;
      const { appId } = record.host;
      const records = waiting.get(appId);
      if (records === undefined) {
        waiting.set(appId, [record]);
      } else {
        records.push(record);
      }
    }
    progress?.asked(waiting.keys());
    const land = (verdicts: ReadonlyMap<AppId, KindVerdicts>): void => {
      for (const [id, answer] of verdicts) {
        let retrying = false;
        for (const record of waiting.get(id) ?? []) {
          record.verdicts = answer;
          record.pending = retry.offer(record, answer);
          queue(record);
          retrying ||= record.pending;
        }
        if (waiting.delete(id)) {
          progress?.answered(id, answer, retrying);
        }
      }
    };
    try {
      land(await detector.detect([...waiting.keys()], land));
    } catch (problem: unknown) {
      logger.error(problem);
    }
    // No answer landed for these IDs: the lookup failed, or a detector dropped them. Steam's own
    // `missing` answer never comes this way. They end their wait as a failure a recheck finds.
    for (const [id, left] of waiting) {
      for (const record of left) {
        record.verdicts = UNKNOWN_KINDS.error;
        record.pending = false;
        queue(record);
      }
      progress?.answered(id, UNKNOWN_KINDS.error, false);
    }
  }

  /** Watches the image boxes again after the page comes back from the back-forward cache. */
  function onPageShow(event: PageTransitionEvent): void {
    if (event.persisted) {
      for (const record of knownRecords(() => true)) {
        queue(record);
      }
    }
  }

  doc.defaultView?.addEventListener("pagehide", disconnect);
  doc.defaultView?.addEventListener("pageshow", onPageShow);

  return {
    render(batch: ScanBatch) {
      for (const host of batch.changed) {
        const record = records.get(host.element);
        if (record !== undefined) {
          record.host = host;
          if (record.verdicts !== undefined) {
            queue(record);
          }
        }
      }
      const found: HostRecord[] = [];
      for (const host of batch.found) {
        const record: HostRecord = {
          host,
          verdicts: undefined,
          allowed: { ...NOT_ALLOWED },
          badged: { ...ALL_BADGED },
          pending: false,
          width: 0,
          labels: undefined,
          labelsWidth: 0,
        };
        records.set(host.element, record);
        found.push(record);
      }
      if (found.length > 0) {
        void detect(found);
      }
    },

    refresh(ids) {
      for (const record of knownRecords((each) => ids === undefined || concerns(ids, each))) {
        queue(record);
      }
    },

    redetect(stale) {
      const due = knownRecords((_record, verdicts) => stale(verdicts));
      if (due.length > 0) {
        void detect(due);
      }
    },

    recheck() {
      const forget = new Set<AppId>();
      const due = knownRecords((record, verdicts) => {
        const failed = failedForGood(verdicts, record.pending);
        if (failed) {
          for (const id of recheckIds(record.host.appId, verdicts)) {
            forget.add(id);
          }
        }
        return failed;
      });
      if (due.length === 0) {
        return undefined;
      }
      for (const record of due) {
        record.pending = true;
      }
      return {
        games: [...new Set(due.map((record) => record.host.appId))],
        forget: [...forget],
        lookUp: () => {
          void detect(due);
        },
      };
    },

    stop() {
      disconnect();
      doc.defaultView?.removeEventListener("pagehide", disconnect);
      doc.defaultView?.removeEventListener("pageshow", onPageShow);
    },
  };
}
