import { describe, expect, it } from "vitest";
import { progressSourceContract } from "../../tests/contracts/progress-source.contract";
import { make } from "../../tests/helpers/factory";
import { fake } from "../../tests/helpers/fakes";
import type { KindVerdicts } from "./kinds/verdicts";
import {
  createLoadProgress,
  followProgress,
  type LoadProgress,
  type PageProgress,
} from "./progress";

const KNOWN = make.verdicts.full();
const LIMITED = make.verdicts.uniform("rate-limited");
const MISSING = make.verdicts.uniform("missing");
const MALFORMED_PVP = { ...KNOWN, pvp: make.verdict.unknown("malformed") };

/** One answer: the index of the game among the three asked for, its verdicts, and a retry. */
type Answer = readonly [game: number, verdicts: KindVerdicts, retrying: boolean];

describe("createLoadProgress", () => {
  it.each<readonly [string, readonly Answer[], LoadProgress]>([
    ["nothing answered", [], { total: 3, answered: 0, unknown: 0, failed: 0 }],
    ["a known answer", [[0, KNOWN, false]], { total: 3, answered: 1, unknown: 0, failed: 0 }],
    ["an answer of only stored unknowns", [[0, MISSING, false]], {
      total: 3,
      answered: 1,
      unknown: 1,
      failed: 0,
    }],
    ["a transient answer with a retry ahead", [[0, LIMITED, true]], {
      total: 3,
      answered: 0,
      unknown: 0,
      failed: 0,
    }],
    ["a transient answer with no retry left", [[0, LIMITED, true], [0, LIMITED, false]], {
      total: 3,
      answered: 1,
      unknown: 1,
      failed: 1,
    }],
    ["a retry that answered", [[0, LIMITED, false], [0, KNOWN, false]], {
      total: 3,
      answered: 1,
      unknown: 0,
      failed: 0,
    }],
    ["one malformed kind among answers", [[0, MALFORMED_PVP, false]], {
      total: 3,
      answered: 1,
      unknown: 0,
      failed: 1,
    }],
  ])("counts %s", (_name, answers, expected) => {
    const ids = make.appIds(3);
    const progress = createLoadProgress(() => undefined);
    progress.asked([...ids, ...ids]);
    for (const [game, verdicts, retrying] of answers) {
      progress.answered(ids[game] ?? make.appId(), verdicts, retrying);
    }
    expect(progress.snapshot()).toStrictEqual(expected);
  });

  it.each<readonly [string, KindVerdicts, LoadProgress]>([
    ["keeps a known answer", KNOWN, { total: 1, answered: 1, unknown: 0, failed: 0 }],
    ["waits again for a failed one", LIMITED, { total: 1, answered: 0, unknown: 0, failed: 0 }],
  ])("asked for a game again, %s", (_name, verdicts, expected) => {
    const id = make.appId();
    const progress = createLoadProgress(() => undefined);
    progress.asked([id]);
    progress.answered(id, verdicts, false);
    progress.asked([id]);
    expect(progress.snapshot()).toStrictEqual(expected);
  });

  it("asks again for the failed games it rechecks, and stops counting the others as failed", () => {
    const [kept, left] = [make.appId(), make.appId()];
    const progress = createLoadProgress(() => undefined);
    progress.asked([kept, left]);
    progress.answered(kept, LIMITED, false);
    progress.answered(left, LIMITED, false);
    progress.recheck([kept]);
    expect(progress.snapshot()).toStrictEqual({ total: 2, answered: 1, unknown: 1, failed: 0 });
  });

  it("carries the breaker's pause while it runs", () => {
    const until = make.time();
    expect(createLoadProgress(() => until).snapshot()).toStrictEqual({
      total: 0,
      answered: 0,
      unknown: 0,
      failed: 0,
      pausedUntil: until,
    });
  });

  it("tells each listener once per microtask, only when the progress changed", async () => {
    const ids = make.appIds(2);
    const progress = createLoadProgress(() => undefined);
    const listener = fake.listener();
    const unsubscribe = progress.subscribe(listener);
    progress.asked(ids);
    for (const id of ids) {
      progress.answered(id, KNOWN, false);
    }
    await Promise.resolve();
    progress.asked(ids);
    await Promise.resolve();
    unsubscribe();
    progress.asked(make.appIds(1));
    await Promise.resolve();
    expect(listener).toHaveBeenCalledExactlyOnceWith({
      total: 2,
      answered: 2,
      unknown: 0,
      failed: 0,
    });
  });
});

progressSourceContract("followProgress", () => {
  const page = fake.pageProgress(make.progress());
  let start = (_running: PageProgress | undefined): void => undefined;
  const running = new Promise<PageProgress | undefined>((resolve) => {
    start = resolve;
  });
  return {
    source: followProgress(running),
    open: (open) => {
      start(open ? page : undefined);
    },
    send: (progress) => {
      page.send(progress);
    },
    rechecks: () => page.rechecks,
  };
});
