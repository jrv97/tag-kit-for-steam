import { describe, expect, it, vi } from "vitest";
import { setBody } from "../../../tests/helpers/dom";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { pageTransition } from "../../../tests/helpers/surfaces";
import { createGetItemsDetector, DEFAULT_BATCH_LIMITS } from "../detect/getitems";
import { MAX_RETRIES } from "../detect/retry";
import { framePhases } from "../dom";
import { isIgnored } from "../ignored";
import type { AiVerdict } from "../kinds/ai";
import { KIND_IDS, type KindId } from "../kinds/id";
import { type KindVerdicts, type Relations, UNKNOWN_KINDS } from "../kinds/verdicts";
import type { Detector } from "../ports";
import { createLoadProgress } from "../progress";
import { GENERIC, type Placement, type RowPlacement, STORE_LABELS } from "../scan/placements";
import type { CapsuleHost } from "../scan/renderer";
import type { AppId } from "../types";
import { type CapsuleUi, createCapsuleUi, type Resized, type SizeWatch } from "./capsules";
import type { HostView } from "./host";

const ROW: RowPlacement = {
  id: "row",
  host: "*",
  hideable: false,
  maxChips: 3,
  badge: "full",
  slot: "after",
  anchor: (host) => host.firstElementChild ?? undefined,
};

/** Image boxes: none yet, too small for a badge, and one for the text tier. */
const NO_SIZE = new DOMRect(0, 0, 0, 0);
const SMALL = new DOMRect(0, 0, 120, 45);
const TEXT_TIER = new DOMRect(0, 0, 231, 87);
/**
 * Store deal labels: in the image's top-left corner, in its top-right corner, under the image and
 * beside it.
 */
const LABEL_ON_IMAGE = new DOMRect(6, 6, 120.4, 19);
const LABEL_ON_IMAGE_END = new DOMRect(104.6, 6, 120.4, 19);
const LABEL_BELOW = new DOMRect(6, 90, 120, 19);
const LABEL_BESIDE = new DOMRect(-130, 6, 120, 19);

interface SetupOptions {
  readonly allowed?: ReadonlySet<AppId>;
  /** Verdicts of kinds other than the AI kind, for every app. */
  readonly others?: Partial<KindVerdicts>;
  /** Kinds whose badges are off in the settings. */
  readonly unbadged?: ReadonlySet<KindId>;
  /** What decides whether a game is ignored; the set of `allowed` IDs by default. */
  readonly isAllowed?: (id: AppId, kind: KindId, related: Relations) => boolean;
}

function setup(
  verdicts: ReadonlyMap<AppId, AiVerdict>,
  {
    allowed = new Set(),
    others = {},
    unbadged = new Set(),
    isAllowed = (id) => allowed.has(id),
  }: SetupOptions = {},
) {
  const detect = fake.spy((ids: readonly AppId[]) =>
    Promise.resolve(
      new Map(ids.flatMap((id) => {
        const verdict = verdicts.get(id);
        return verdict === undefined
          ? []
          : [[id, { ...make.verdicts({ ai: verdict }), ...others }] as const];
      })),
    )
  );
  const detector: Detector = { detect };
  const views: HostView[] = [];
  const frames: (() => void)[] = [];
  const watched = new Set<Element>();
  let disconnects = 0;
  let reportSized: (resized: readonly Resized[]) => void = () => undefined;
  const ui = createCapsuleUi({
    document,
    detector,
    renderers: [{
      render: (view) =>
        views.push({ ...view, allowed: { ...view.allowed }, badged: { ...view.badged } }),
    }],
    isAllowed,
    isBadged: (kind) => !unbadged.has(kind),
    frame: framePhases((callback) => frames.push(callback)),
    logger: fake.logger().logger,
    watchSize: (onSized): SizeWatch => {
      reportSized = onSized;
      return {
        observe: (element) => watched.add(element),
        unobserve: (e) => watched.delete(e),
        disconnect: () => {
          disconnects += 1;
          watched.clear();
        },
      };
    },
  });
  const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    for (const callback of frames.splice(0)) {
      callback();
    }
  };
  /** Reports a new box for `element`, as the size watch does. */
  const sized = (element: Element, box: DOMRect) => {
    reportSized([{ element, width: box.width }]);
  };
  return { ui, detect, views, flush, watched, sized, disconnects: () => disconnects };
}

function host(id: AppId, placement: Placement = ROW): CapsuleHost {
  setBody(
    `<div data-tks-appid="${String(id)}"><span class="line"></span><div class="art"></div></div>`,
  );
  const element = document.querySelector("[data-tks-appid]");
  const anchor = placement.anchor(element ?? document.body);
  if (element === null || anchor === undefined) {
    throw new TypeError();
  }
  return { element, appId: id, placement, anchor };
}

/** The view the renderers drew at `index`, counted from the end when negative. */
function viewAt(views: readonly HostView[], index: number): HostView {
  const view = views.at(index);
  if (view === undefined) {
    throw new RangeError(String(index));
  }
  return view;
}

/** A host whose image box measures `size`, for compact badges. */
function imageHost(id: AppId, size: DOMRect) {
  const found = host(id, {
    ...GENERIC,
    anchor: (element) => element.querySelector(".art") ?? undefined,
  });
  const box = vi.spyOn(found.anchor, "getBoundingClientRect");
  box.mockReturnValue(size);
  return { found, box };
}

/** Puts a store deal label with the box `rect` in the host. */
function labelOn(found: CapsuleHost, rect: DOMRect): void {
  found.element.insertAdjacentHTML("beforeend", make.page.storeLabel);
  const label = found.element.querySelector(STORE_LABELS);
  if (label === null) {
    throw new TypeError();
  }
  vi.spyOn(label, "getBoundingClientRect").mockReturnValue(rect);
}

describe("createCapsuleUi", () => {
  const AI = make.verdict.disclosed("ai");
  const PVP = make.verdict.disclosed("pvp");
  const NOT_DISCLOSED = make.verdict.notDisclosed();

  it("detects found hosts in one call and draws them with their full-badge slot", async () => {
    const id = make.appId();
    const { ui, detect, views, flush } = setup(new Map([[id, AI]]));
    const found = host(id);
    ui.render({ found: [found], changed: [] });
    await flush();
    expect(detect).toHaveBeenCalledTimes(1);
    expect(views).toHaveLength(1);
    expect(viewAt(views, 0).slot).toEqual({
      kind: "full",
      anchor: found.anchor,
      position: "afterend",
    });
    expect(viewAt(views, 0).hideable).toBe(false);
  });

  it.each(
    [
      ["no disclosure", NOT_DISCLOSED, {}, [], undefined],
      ["a disclosure in another kind", NOT_DISCLOSED, { pvp: PVP }, [], "full"],
      ["its only disclosure badged off", AI, {}, ["ai"], undefined],
      ["another disclosure badged on", AI, { pvp: PVP }, ["ai"], "full"],
    ] as const,
  )("gives a host with %s the slot %s", async (_name, ai, others, off, slot) => {
    const id = make.appId();
    const { ui, views, flush } = setup(new Map([[id, ai]]), { others, unbadged: new Set(off) });
    ui.render({ found: [host(id)], changed: [] });
    await flush();
    expect(viewAt(views, 0).slot?.kind).toBe(slot);
  });

  it("passes the chip allowance and the badge settings to the renderers", async () => {
    const id = make.appId();
    const { ui, views, flush } = setup(new Map([[id, AI]]), {
      unbadged: new Set<KindId>(["drm", "pvp"]),
    });
    ui.render({ found: [host(id, { ...ROW, maxChips: 2 })], changed: [] });
    await flush();
    const { maxChips, badged } = viewAt(views, 0);
    expect(maxChips).toBe(2);
    expect(KIND_IDS.filter((kind) => !badged[kind])).toEqual(["drm", "pvp"]);
  });

  it("draws a full badge of an end slot as the anchor's last child", async () => {
    const id = make.appId();
    const { ui, views, flush } = setup(new Map([[id, AI]]));
    const found = host(id, { ...ROW, slot: "end" });
    ui.render({ found: [found], changed: [] });
    await flush();
    expect(viewAt(views, 0).slot).toEqual({
      kind: "full",
      anchor: found.anchor,
      position: "beforeend",
    });
  });

  it("measures the image box for a compact badge and anchors a static box", async () => {
    const id = make.appId();
    const { ui, views, flush } = setup(new Map([[id, AI]]));
    const { found } = imageHost(id, TEXT_TIER);
    ui.render({ found: [found], changed: [] });
    await flush();
    expect(viewAt(views, 0).slot).toMatchObject({
      kind: "compact",
      size: "text",
      position: "beforeend",
      width: TEXT_TIER.width,
      reserve: 0,
    });
    expect(found.anchor.hasAttribute("data-tks-anchor")).toBe(true);
  });

  it.each([
    ["on the image", LABEL_ON_IMAGE, "ltr", Math.ceil(LABEL_ON_IMAGE.right - TEXT_TIER.left)],
    [
      "on a right-to-left image",
      LABEL_ON_IMAGE_END,
      "rtl",
      Math.ceil(
        TEXT_TIER.right - LABEL_ON_IMAGE_END.left,
      ),
    ],
    ["below it", LABEL_BELOW, "ltr", 0],
    ["beside it", LABEL_BESIDE, "ltr", 0],
  ])("reserves the reach of a store label %s", async (_name, label, direction, reserve) => {
    const id = make.appId();
    const { ui, views, flush } = setup(new Map([[id, AI]]));
    const { found } = imageHost(id, TEXT_TIER);
    found.anchor.setAttribute("style", `direction: ${direction}`);
    labelOn(found, label);
    ui.render({ found: [found], changed: [] });
    await flush();
    expect(viewAt(views, 0).slot).toMatchObject({ kind: "compact", reserve });
  });

  it("gives a small image no slot", async () => {
    const id = make.appId();
    const { ui, views, flush } = setup(new Map([[id, AI]]));
    ui.render({ found: [imageHost(id, SMALL).found], changed: [] });
    await flush();
    expect(viewAt(views, 0).slot).toBeUndefined();
  });

  it("draws a compact host again at each new width of its image box, until it leaves", async () => {
    const id = make.appId();
    const { ui, detect, views, flush, watched, sized } = setup(new Map([[id, AI]]));
    const { found, box } = imageHost(id, NO_SIZE);
    ui.render({ found: [found], changed: [] });
    await flush();
    expect(viewAt(views, 0).slot).toBeUndefined();
    expect([...watched]).toEqual([found.anchor]);
    box.mockReturnValue(SMALL);
    sized(found.anchor, SMALL);
    await flush();
    expect(viewAt(views, 1).slot).toBeUndefined();
    box.mockReturnValue(TEXT_TIER);
    sized(found.anchor, TEXT_TIER);
    await flush();
    expect(viewAt(views, 2).slot).toMatchObject({ kind: "compact", size: "text" });
    expect([...watched]).toEqual([found.anchor]);
    found.element.remove();
    sized(found.anchor, SMALL);
    await flush();
    expect(views).toHaveLength(3);
    expect(watched.size).toBe(0);
    expect(detect).toHaveBeenCalledTimes(1);
  });

  it.each([["the same width", TEXT_TIER], ["no width", NO_SIZE]])(
    "keeps a compact host as drawn when its image box reports %s",
    async (_name, next) => {
      const id = make.appId();
      const { ui, views, flush, sized } = setup(new Map([[id, AI]]));
      const { found } = imageHost(id, TEXT_TIER);
      ui.render({ found: [found], changed: [] });
      await flush();
      sized(found.anchor, next);
      await flush();
      expect(views).toHaveLength(1);
    },
  );

  it("lets go of the size watch on pagehide and watches again on a return", async () => {
    const id = make.appId();
    const { ui, flush, watched, disconnects } = setup(new Map([[id, AI]]));
    const { found } = imageHost(id, NO_SIZE);
    ui.render({ found: [found], changed: [] });
    await flush();
    expect(watched.size).toBe(1);
    window.dispatchEvent(pageTransition("pagehide"));
    expect(disconnects()).toBe(1);
    expect(watched.size).toBe(0);
    window.dispatchEvent(pageTransition("pageshow"));
    await flush();
    expect([...watched]).toEqual([found.anchor]);
  });

  it("stops listening for pagehide when stopped", () => {
    const { ui, disconnects } = setup(new Map());
    ui.stop();
    expect(disconnects()).toBe(0);
    window.dispatchEvent(new Event("pagehide"));
    expect(disconnects()).toBe(0);
  });

  it("watches a small image, which may grow, but not a host without a badge", async () => {
    const small = make.appId();
    const unbadged = make.appId();
    const { ui, flush, watched } = setup(
      new Map<AppId, AiVerdict>([[small, AI], [unbadged, NOT_DISCLOSED]]),
    );
    const { found } = imageHost(small, SMALL);
    ui.render({ found: [found], changed: [] });
    await flush();
    ui.render({ found: [imageHost(unbadged, NO_SIZE).found], changed: [] });
    await flush();
    expect([...watched]).toEqual([found.anchor]);
  });

  it("lets go of an image box once its host has no badge to show", async () => {
    const id = make.appId();
    const allowed = new Set<AppId>();
    const { ui, flush, watched } = setup(new Map([[id, AI]]), { allowed });
    ui.render({ found: [imageHost(id, TEXT_TIER).found], changed: [] });
    await flush();
    expect(watched.size).toBe(1);
    allowed.add(id);
    ui.refresh();
    await flush();
    expect(watched.size).toBe(0);
  });

  it("draws a changed host again from its known verdict, without a new detection", async () => {
    const id = make.appId();
    const { ui, detect, views, flush } = setup(new Map([[id, NOT_DISCLOSED]]));
    const found = host(id);
    ui.render({ found: [found], changed: [] });
    await flush();
    ui.render({ found: [], changed: [found] });
    await flush();
    expect(detect).toHaveBeenCalledTimes(1);
    expect(views).toHaveLength(2);
  });

  it("gives the renderers a verdict and an allow-list flag for every kind", async () => {
    const id = make.appId();
    const { ui, views, flush } = setup(new Map([[id, AI]]));
    ui.render({ found: [host(id)], changed: [] });
    await flush();
    expect(Object.keys(viewAt(views, 0).verdicts)).toStrictEqual([...KIND_IDS]);
    expect(Object.keys(viewAt(views, 0).allowed)).toStrictEqual([...KIND_IDS]);
  });

  it("redraws the hosts of an app after an allow-list change", async () => {
    const id = make.appId();
    const allowed = new Set<AppId>();
    const { ui, views, flush } = setup(new Map([[id, AI]]), { allowed });
    ui.render({ found: [host(id)], changed: [] });
    await flush();
    allowed.add(id);
    ui.refresh(new Set([id]));
    await flush();
    expect(views.map((view) => view.allowed.ai)).toEqual([false, true]);
    ui.refresh(new Set([make.appId()]));
    await flush();
    expect(views).toHaveLength(2);
  });

  it("asks again about the hosts whose verdicts are stale, and draws the new answer", async () => {
    const id = make.appId();
    const { ui, detect, views, flush } = setup(new Map([[id, AI]]));
    ui.render({ found: [host(id)], changed: [] });
    await flush();
    ui.redetect(() => false);
    await flush();
    expect(detect).toHaveBeenCalledTimes(1);
    ui.redetect((verdicts) => verdicts.ai.state === "disclosed");
    await flush();
    expect(detect.mock.calls.map(([ids]) => ids)).toStrictEqual([[id], [id]]);
    expect(views).toHaveLength(2);
  });

  describe("for a DLC", () => {
    const BASE = make.appId();
    const DLC = make.appId();

    /** The real predicate over an ignore list, as the composition root wires it. */
    function ignoring(setupList: (ignored: ReturnType<typeof make.ignored>) => void) {
      const ignored = make.ignored();
      setupList(ignored);
      return (id: AppId, kind: KindId, related: Relations) => isIgnored(ignored, id, kind, related);
    }

    it("asks whether the game is ignored with the base game Steam named", async () => {
      const asked = fake.spy((_id: AppId, _kind: KindId, _related: Relations) => false);
      const { ui, flush } = setup(new Map([[DLC, AI]]), {
        others: { parent: BASE },
        isAllowed: asked,
      });
      ui.render({ found: [host(DLC)], changed: [] });
      await flush();
      expect(asked).toHaveBeenCalledWith(DLC, "ai", expect.objectContaining({ parent: BASE }));
      expect(asked).toHaveBeenCalledTimes(KIND_IDS.length);
    });

    it("flags a DLC of a base game ignored for one kind in that kind only", async () => {
      const isAllowed = ignoring((ignored) => ignored.games.ai.add(BASE));
      const { ui, views, flush } = setup(new Map([[DLC, AI]]), {
        others: { parent: BASE, pvp: PVP },
        isAllowed,
      });
      ui.render({ found: [host(DLC)], changed: [] });
      await flush();
      expect(viewAt(views, 0).allowed.ai).toBe(true);
      expect(viewAt(views, 0).allowed.pvp).toBe(false);
      expect(viewAt(views, 0).slot).toMatchObject({ kind: "full" });
    });

    it("gives a DLC whose only disclosure is ignored through its base game no slot", async () => {
      const isAllowed = ignoring((ignored) => ignored.games.all.add(BASE));
      const { ui, views, flush } = setup(new Map([[DLC, AI]]), {
        others: { parent: BASE },
        isAllowed,
      });
      ui.render({ found: [host(DLC)], changed: [] });
      await flush();
      const { slot, allowed } = viewAt(views, 0);
      expect(slot).toBeUndefined();
      expect(KIND_IDS.every((kind) => allowed[kind])).toBe(true);
    });

    it("draws the DLC again when its base game is ignored or restored, and only then", async () => {
      const ignored = make.ignored();
      const { ui, views, flush } = setup(new Map([[DLC, AI]]), {
        others: { parent: BASE },
        isAllowed: (id, kind, related) => isIgnored(ignored, id, kind, related),
      });
      ui.render({ found: [host(DLC)], changed: [] });
      await flush();
      ignored.games.ai.add(BASE);
      ui.refresh(new Set([BASE]));
      await flush();
      ui.refresh(new Set([make.appId()]));
      await flush();
      ignored.games.ai.delete(BASE);
      ui.refresh(new Set([BASE]));
      await flush();
      expect(views.map((view) => view.allowed.ai)).toEqual([false, true, false]);
    });

    it("leaves a DLC with no known base game on its own entries", async () => {
      const isAllowed = ignoring((ignored) => ignored.games.all.add(BASE));
      const { ui, views, flush } = setup(new Map([[DLC, AI]]), { isAllowed });
      ui.render({ found: [host(DLC)], changed: [] });
      await flush();
      expect(viewAt(views, 0).allowed.ai).toBe(false);
    });
  });

  it("draws and counts each GetItems batch before the next one answers", async () => {
    const ids = make.appIds(2);
    setBody(ids.map((id) => `<div data-tks-appid="${String(id)}"><span></span></div>`).join(""));
    const hosts = [...document.querySelectorAll("[data-tks-appid]")].map((element, index) => ({
      element,
      appId: ids[index] ?? make.appId(),
      placement: ROW,
      anchor: element.firstElementChild ?? element,
    }));
    const http = fake.heldHttp([make.item.route(ids.map((id) => make.item.disclosed(id)))]);
    const progress = createLoadProgress(() => undefined);
    const frames = fake.queue();
    const drawn: Element[] = [];
    const ui = createCapsuleUi({
      document,
      detector: createGetItemsDetector({
        http,
        language: "english",
        limits: { ...DEFAULT_BATCH_LIMITS, maxIds: 1 },
      }),
      renderers: [{ render: (view) => drawn.push(view.host) }],
      isAllowed: () => false,
      isBadged: () => true,
      frame: framePhases(frames.frame),
      progress,
      logger: fake.logger().logger,
    });
    const answer = async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      http.answerNext();
      await new Promise((resolve) => setTimeout(resolve, 0));
      frames.run();
    };
    ui.render({ found: hosts, changed: [] });
    await answer();
    expect(drawn).toStrictEqual([hosts[0]?.element]);
    expect(progress.snapshot()).toStrictEqual({ total: 2, answered: 1, unknown: 0, failed: 0 });
    await answer();
    expect(drawn).toStrictEqual(hosts.map((each) => each.element));
    expect(http.calls).toHaveLength(2);
  });

  it.each(
    [
      ["an ID the answer leaves out", fake.partialDetector(new Map()), 0],
      ["a lookup that rejects, and logs it", fake.rejectingDetector(), 1],
    ] as const,
  )("counts and draws as failed %s", async (_name, detector, logged) => {
    const { logger, sink } = fake.logger();
    const progress = createLoadProgress(() => undefined);
    const frames = fake.queue();
    const views: HostView[] = [];
    const ui = createCapsuleUi({
      document,
      detector,
      renderers: [{ render: (view) => views.push(view) }],
      isAllowed: () => false,
      isBadged: () => true,
      frame: framePhases(frames.frame),
      progress,
      logger,
    });
    ui.render({ found: [host(make.appId())], changed: [] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    frames.run();
    expect(progress.snapshot()).toStrictEqual({ total: 1, answered: 1, unknown: 1, failed: 1 });
    expect(viewAt(views, -1)).toMatchObject({ verdicts: UNKNOWN_KINDS.error, pending: false });
    expect(sink.error).toHaveBeenCalledTimes(logged);
  });

  describe("after a transient answer", () => {
    const DISCLOSED = make.verdicts({ ai: AI });
    const ERROR = make.verdicts.uniform("error");
    const MISSING = make.verdicts.uniform("missing");
    const LIMITED = make.verdicts.uniform("rate-limited");
    const MALFORMED = make.verdicts.uniform("malformed");
    const stay = (_found: CapsuleHost) => undefined;
    const leave = (found: CapsuleHost) => {
      found.element.remove();
    };

    /** A capsule UI on manual frames and retry timers, whose detector answers each call in turn. */
    function retrying(answers: readonly [KindVerdicts, ...KindVerdicts[]]) {
      const frames = fake.queue();
      const timers = fake.queue();
      const views: HostView[] = [];
      const detector = fake.turnDetector(answers);
      const progress = createLoadProgress(() => undefined);
      const ui = createCapsuleUi({
        document,
        detector,
        renderers: [{ render: (view) => views.push(view) }],
        isAllowed: () => false,
        isBadged: () => true,
        frame: framePhases(frames.frame),
        delay: timers.delay,
        progress,
        logger: fake.logger().logger,
      });
      /** Lets the pending lookup answer, then draws. */
      const answered = async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        frames.run();
      };
      return { ui, detector, timers, views, answered, progress };
    }

    // After the calls: whether the last draw shows chips and waits for a retry, then how many
    // games the load progress counts as still unknown and as failed
    it.each(
      [
        ["unknown error: asked again", [ERROR, DISCLOSED], stay, 2, true, false, 0, 0],
        ["unknown rate-limited: asked again", [LIMITED, DISCLOSED], stay, 2, true, false, 0, 0],
        [
          "a host that left the page: not asked again",
          [ERROR, DISCLOSED],
          leave,
          1,
          false,
          true,
          1,
          1,
        ],
        [
          "unknown missing, which is stored: not asked again",
          [MISSING, DISCLOSED],
          stay,
          1,
          false,
          false,
          1,
          0,
        ],
        [
          "rate-limited every time: asked twice more",
          [LIMITED],
          stay,
          1 + MAX_RETRIES,
          false,
          false,
          1,
          1,
        ],
      ] as const,
    )("%s", async (_name, answers, after, calls, chips, pending, unknown, failed) => {
      const { ui, detector, timers, views, answered, progress } = retrying(answers);
      const found = host(make.appId());
      ui.render({ found: [found], changed: [] });
      for (let round = 0; round <= MAX_RETRIES + 1; round++) {
        await answered();
        after(found);
        timers.run();
      }
      expect(detector.calls).toHaveLength(calls);
      expect(timers.size).toBe(0);
      expect(viewAt(views, -1).pending).toBe(pending);
      expect(viewAt(views, -1).slot !== undefined).toBe(chips);
      expect(progress.snapshot()).toStrictEqual({ total: 1, answered: 1, unknown, failed });
    });

    it.each<readonly [string, (ui: CapsuleUi) => void]>([
      ["pagehide", () => window.dispatchEvent(new Event("pagehide"))],
      ["stop", (ui) => {
        ui.stop();
      }],
    ])("cancels the pending retry on %s, counts its game as unknown and draws no more", async (
      _end,
      end,
    ) => {
      const { ui, timers, views, answered, progress } = retrying([ERROR]);
      ui.render({ found: [host(make.appId())], changed: [] });
      await answered();
      expect(timers.size).toBe(1);
      const drawn = views.length;
      end(ui);
      await answered();
      expect(timers.size).toBe(0);
      expect(views).toHaveLength(drawn);
      expect(progress.snapshot()).toStrictEqual({ total: 1, answered: 1, unknown: 1, failed: 1 });
    });

    const GAME = make.appId();
    const DEMO = { ...MALFORMED, demo: true, parent: GAME } as const;
    it.each<
      readonly [
        string,
        readonly [KindVerdicts, ...KindVerdicts[]],
        (ui: CapsuleUi, found: CapsuleHost) => void,
        (id: AppId) => { games?: readonly AppId[]; forget?: readonly AppId[]; },
      ]
    >([
      ["a lookup that failed for good: the game", [MALFORMED], () => undefined, (id) => ({
        games: [id],
        forget: [id],
      })],
      ["a demo's failed lookup: with its full game", [DEMO], () => undefined, (id) => ({
        games: [id],
        forget: [id, GAME],
      })],
      ["a lookup with a retry round ahead: nothing", [ERROR], () => undefined, () => ({})],
      ["an answer: nothing", [DISCLOSED], () => undefined, () => ({})],
      ["a host that left the page: nothing", [MALFORMED], (_ui, found) => {
        leave(found);
      }, () => ({})],
      ["a host taken by a recheck before: nothing", [MALFORMED], (ui) => {
        ui.recheck();
      }, () => ({})],
    ])("takes to recheck %s", async (_name, answers, arrange, expected) => {
      const { ui, answered } = retrying(answers);
      const found = host(make.appId());
      ui.render({ found: [found], changed: [] });
      await answered();
      arrange(ui, found);
      const taken = ui.recheck();
      expect({ games: taken?.games, forget: taken?.forget }).toStrictEqual({
        games: undefined,
        forget: undefined,
        ...expected(found.appId),
      });
    });

    it("asks once more for a taken host and draws its answer", async () => {
      const { ui, detector, views, answered, progress } = retrying([MALFORMED, DISCLOSED]);
      ui.render({ found: [host(make.appId())], changed: [] });
      await answered();
      ui.recheck()?.lookUp();
      await answered();
      expect(detector.calls).toHaveLength(2);
      expect(viewAt(views, -1).slot).toBeDefined();
      expect(progress.snapshot()).toMatchObject({ unknown: 0, failed: 0 });
    });
  });
});
