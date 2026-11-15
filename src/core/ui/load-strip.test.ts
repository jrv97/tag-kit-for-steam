import { afterEach, describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { englishI18n } from "../../../tests/helpers/i18n";
import type { LoadProgress } from "../progress";
import { createLoadStrip } from "./load-strip";

const i18n = englishI18n();
const T0 = make.time();
const SECOND = 1000;
const RECHECK = ".tks-load-recheck";

/** A strip over a fake source, on a fixed clock and manual timers; `attached` in the page. */
function setup(attached = false) {
  const source = fake.progressSource();
  const clock = fake.clock(T0);
  const timers = fake.queue();
  const strip = createLoadStrip(document, i18n, source, {
    idPrefix: make.text.token(),
    now: () => clock.now(),
    delay: timers.delay,
  });
  if (attached) {
    document.body.append(strip.element);
  }
  const part = (name: string) => strip.element.querySelector(`.tks-load-${name}`);
  const read = () => ({
    state: strip.element.getAttribute("data-tks-load"),
    message: part("message")?.textContent,
    bold: part("message")?.querySelector("strong")?.textContent,
    count: part("count")?.textContent,
    countShown: part("count")?.hasAttribute("hidden") === false,
    now: part("bar")?.getAttribute("aria-valuenow"),
    max: part("bar")?.getAttribute("aria-valuemax"),
    recheck: part("recheck")?.hasAttribute("hidden") === false,
  });
  const recheck = () => {
    const button = strip.element.querySelector<HTMLButtonElement>(RECHECK);
    if (button === null) {
      throw new TypeError(RECHECK);
    }
    return button;
  };
  /** Lets the next draw run, a second after the last one. */
  const nextDraw = () => {
    clock.advance(SECOND);
    timers.run();
  };
  return {
    source,
    timers,
    strip,
    read,
    recheck,
    nextDraw,
    status: () => part("status"),
    bar: () => part("bar"),
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("createLoadStrip", () => {
  const seconds = i18n.t("options_progress_seconds", { seconds: "42" });
  const loading = {
    state: "loading",
    message: i18n.t("options_progress_loading"),
    bold: undefined,
    count: i18n.plural("options_progress_loading_count", 48, { answered: "12" }),
    countShown: true,
    now: "12",
    max: "48",
    recheck: false,
  };
  const done = {
    state: "done",
    message: i18n.plural("options_progress_done", 48),
    bold: undefined,
    count: i18n.t("options_progress_count", { answered: "48", total: "48" }),
    countShown: true,
    now: "48",
    max: "48",
    recheck: false,
  };
  const none = { bold: undefined, count: "", countShown: true, now: "0", max: "1", recheck: false };
  it.each<
    readonly [string, LoadProgress | undefined, ReturnType<ReturnType<typeof setup>["read"]>]
  >(
    [
      ["loading", make.progress({ total: 48, answered: 12 }), loading],
      [
        "loading once Steam's pause is over",
        make.progress({
          total: 48,
          answered: 12,
          pausedUntil: T0,
        }),
        loading,
      ],
      [
        "loading with failed lookups",
        make.progress({ total: 48, answered: 12, failed: 2 }),
        loading,
      ],
      ["paused", make.progress({ total: 48, answered: 12, pausedUntil: T0 + 41 * SECOND + 1 }), {
        ...loading,
        state: "paused",
        message: i18n.t("options_progress_paused", { time: seconds }),
        bold: seconds,
        count: i18n.t("options_progress_count", { answered: "12", total: "48" }),
      }],
      ["done", make.progress({ total: 48, answered: 48 }), done],
      ["done with games left unknown", make.progress({ total: 48, answered: 48, unknown: 2 }), {
        ...done,
        message: i18n.plural("options_progress_done_unknown", 46, { unknown: "2" }),
      }],
      [
        "done with failed lookups",
        make.progress({
          total: 48,
          answered: 48,
          unknown: 2,
          failed: 3,
        }),
        {
          ...done,
          message: i18n.plural("options_progress_done_failed", 46, { failed: "3" }),
          countShown: false,
          recheck: true,
        },
      ],
      ["a page that asked for no game yet", make.progress({ total: 0, answered: 0 }), {
        ...none,
        state: "empty",
        message: i18n.t("options_progress_no_games"),
      }],
      ["no store page", undefined, {
        ...none,
        state: "none",
        message: i18n.t("options_progress_no_page"),
      }],
    ],
  )("draws %s", (_name, progress, expected) => {
    const { source, read } = setup();
    source.send(progress);
    expect(read()).toStrictEqual(expected);
  });

  it("draws at most once a second, and counts down once a second while paused", () => {
    const { source, timers, read, nextDraw } = setup();
    source.send(make.progress({ total: 2, answered: 0, pausedUntil: T0 + 2 * SECOND }));
    source.send(make.progress({ total: 2, answered: 1, pausedUntil: T0 + 2 * SECOND }));
    expect(read().now).toBe("0");
    nextDraw();
    expect(read()).toMatchObject({
      now: "1",
      bold: i18n.t("options_progress_seconds", { seconds: "1" }),
    });
    nextDraw();
    expect(read().state).toBe("loading");
    expect(timers.size).toBe(0);
  });

  it("asks once per progress by Check again, named by its text and the status", () => {
    const { source, recheck, status } = setup();
    const failed = make.progress({ answered: 1, total: 1, failed: 1 });
    source.send(failed);
    recheck().click();
    recheck().click();
    source.send(failed);
    recheck().click();
    expect(source.rechecks).toBe(2);
    expect(recheck().textContent).toBe(i18n.t("options_progress_recheck"));
    expect(recheck().getAttribute("aria-describedby")).toBe(status()?.id);
  });

  it("moves focus from Check again to the bar, outside the live status, as it hides", () => {
    const { source, recheck, bar, nextDraw } = setup(true);
    source.send(make.progress({ answered: 1, total: 1, failed: 1 }));
    recheck().focus();
    source.send(make.progress({ answered: 0, total: 1 }));
    nextDraw();
    expect(document.activeElement).toBe(bar());
    expect(bar()?.closest("[role=status], [aria-live]")).toBeNull();
  });

  it("stops listening and drawing when stopped", () => {
    const { source, timers, strip } = setup();
    source.send(make.progress({ total: 2, answered: 0, pausedUntil: T0 + SECOND }));
    strip.stop();
    expect(source.listening).toBe(0);
    expect(timers.size).toBe(0);
  });
});
