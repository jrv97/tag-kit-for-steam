// @vitest-environment-options {"url":"https://store.steampowered.com/search/?term=roguelike"}
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { loadPage, setBody, the } from "../../../tests/helpers/surfaces";
import { createScanner, DEBOUNCE_MS, type Scanner, type ScanReport } from "./scanner";

// Wall-clock scan budgets. The `perf` project in vitest.config.ts runs this file alone, after the
// unit tests, so other test files do not share the CPU. The DOM call counts in scanner.test.ts are
// the machine-independent bound; these catch a slow selector or DOM call that the counts miss.

/** One animation frame under fake timers. */
const FRAME_MS = 16;
/** Untimed runs first, so the JIT and happy-dom's caches warm up. */
const WARMUP_RUNS = 3;
/** Timed runs; their median ignores a run that a busy runner slows down. */
const TIMED_RUNS = 9;

const GRID_IDS = make.appIds(200);
const GRID = make.page.capsuleGrid(GRID_IDS);
const APPENDED_IDS = make.appIds(50);

let started: Scanner[] = [];
let reports: ScanReport[] = [];

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"],
  });
});

afterEach(() => {
  stopAll();
  vi.useRealTimers();
});

/** Starts a scanner on the current page and lets its first page scan run. */
async function startScanner(): Promise<void> {
  const scanner = createScanner({
    document,
    renderer: fake.renderer(),
    onReport: (report) => reports.push(report),
  });
  started.push(scanner);
  scanner.start();
  await vi.advanceTimersByTimeAsync(FRAME_MS);
}

/** Lets a debounced scan run after the last mutation. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + FRAME_MS);
}

function stopAll(): void {
  for (const scanner of started) {
    scanner.stop();
  }
  started = [];
}

/** A scan to time: `prepare` builds a fresh page, `scan` is the part timed. */
interface TimedScan {
  readonly name: string;
  readonly prepare: () => Promise<void>;
  readonly scan: () => Promise<void>;
  /** Hosts the timed scan must report, so a scan that finds nothing cannot pass. */
  readonly found: number;
  /** About five times the median measured on a laptop with other jobs running, for CI. */
  readonly budgetMs: number;
}

const TIMED_SCANS: readonly TimedScan[] = [
  {
    // Median measured 75 to 160 ms.
    name: "a page scan of 200 capsules",
    prepare: () => {
      setBody(GRID);
      return Promise.resolve();
    },
    scan: startScanner,
    found: GRID_IDS.length,
    budgetMs: 500,
  },
  {
    // Median measured 2 to 6 ms.
    name: "a scan of 50 appended search rows",
    prepare: async () => {
      loadPage(make.page.surface("search"));
      await startScanner();
      the("#search_resultsRows").append(...APPENDED_IDS.map((id) => make.page.searchRow(id)));
    },
    scan: settle,
    found: APPENDED_IDS.length,
    budgetMs: 30,
  },
];

/** The median wall-clock time of `timed.scan` over the timed runs, after the warm-up runs. */
async function medianScanMs(timed: TimedScan): Promise<number> {
  const times: number[] = [];
  for (let run = 0; run < WARMUP_RUNS + TIMED_RUNS; run += 1) {
    reports = [];
    await timed.prepare();
    const start = performance.now();
    await timed.scan();
    times.push(performance.now() - start);
    stopAll();
  }
  const sorted = times.slice(WARMUP_RUNS).toSorted((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.POSITIVE_INFINITY;
}

it.each(TIMED_SCANS)("keeps $name within its time budget", async (timed) => {
  const median = await medianScanMs(timed);
  expect(reports.at(-1)?.found).toBe(timed.found);
  expect(median).toBeLessThanOrEqual(timed.budgetMs);
});
