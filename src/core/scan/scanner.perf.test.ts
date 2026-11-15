// @vitest-environment-options {"url":"https://store.steampowered.com/search/?term=roguelike"}
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { make } from "../../../tests/helpers/factory";
import {
  launchScanner,
  settle,
  type StartedScanner,
  useScanTimers,
} from "../../../tests/helpers/scanner";
import { loadPage, setBody, the } from "../../../tests/helpers/surfaces";

// Wall-clock scan budgets in happy-dom. The perf project in vitest.config.ts runs this file alone,
// after the unit tests. The renderer only records batches, so badge drawing is not timed.

/** Untimed runs first, so the JIT and happy-dom's caches warm up. */
const WARMUP_RUNS = 3;
/** Timed runs; their median ignores a run that a busy runner slows down. */
const TIMED_RUNS = 9;

const GRID_IDS = make.appIds(200);
const GRID = make.page.capsuleGrid(GRID_IDS);
const APPENDED_IDS = make.appIds(50);

beforeEach(useScanTimers);

afterEach(() => {
  vi.useRealTimers();
});

/** A scan to time: `prepare` builds a fresh page and returns the step to time. */
interface TimedScan {
  readonly name: string;
  readonly prepare: () => Promise<() => Promise<StartedScanner>>;
  /** Hosts every run must report, so a scan that finds nothing cannot pass. */
  readonly found: number;
  /** About five times the slowest median a laptop showed with other jobs running. */
  readonly budgetMs: number;
}

const TIMED_SCANS: readonly TimedScan[] = [
  {
    // A laptop's median: 75 ms alone, 160 ms beside other jobs.
    name: "a page scan of 200 capsules",
    prepare: () => {
      setBody(GRID);
      return Promise.resolve(() => launchScanner());
    },
    found: GRID_IDS.length,
    budgetMs: 800,
  },
  {
    // A laptop's median: 2 ms alone, 6 ms beside other jobs. The fake clock's steps count too.
    name: "a scan of 50 appended search rows",
    prepare: async () => {
      loadPage(make.page.surface("search"));
      const started = await launchScanner();
      const container = the("#search_resultsRows");
      for (const id of APPENDED_IDS) {
        container.append(make.page.searchRow(id));
      }
      return async () => {
        await settle();
        return started;
      };
    },
    found: APPENDED_IDS.length,
    budgetMs: 30,
  },
];

/** The timed runs' times and every run's last report count. */
interface Timing {
  readonly times: readonly number[];
  readonly found: readonly (number | undefined)[];
}

async function timeScans(timed: TimedScan): Promise<Timing> {
  const times: number[] = [];
  const found: (number | undefined)[] = [];
  for (let run = 0; run < WARMUP_RUNS + TIMED_RUNS; run += 1) {
    const scan = await timed.prepare();
    const start = performance.now();
    const { scanner, reports } = await scan();
    times.push(performance.now() - start);
    scanner.stop();
    found.push(reports.at(-1)?.found);
  }
  return { times: times.slice(WARMUP_RUNS), found };
}

function median(values: readonly number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.POSITIVE_INFINITY;
}

it.each(TIMED_SCANS)("keeps $name within its time budget", async (timed) => {
  const { times, found } = await timeScans(timed);
  expect(new Set(found)).toStrictEqual(new Set([timed.found]));
  expect(median(times), times.map((time) => time.toFixed(1)).join(" ")).toBeLessThanOrEqual(
    timed.budgetMs,
  );
});
