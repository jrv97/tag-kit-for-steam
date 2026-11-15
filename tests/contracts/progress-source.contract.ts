import { describe, expect, it } from "vitest";
import type { LoadProgress, ProgressSource } from "../../src/core/progress";
import { make } from "../helpers/factory";

/** A `ProgressSource` over a store page the test opens and drives by hand. */
export interface ProgressSourceHarness {
  readonly source: ProgressSource;
  /** Lets the store page answer, or tells that no store page answers. */
  readonly open: (page: boolean) => void;
  /** The open page tells a new progress. */
  readonly send: (progress: LoadProgress) => void;
  /** How many rechecks reached the page. */
  readonly rechecks: () => number;
}

/** Lets pending promises and zero-delay timers settle. */
function settled(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * The behavior every `ProgressSource` must have (src/core/AGENTS.md, "The contract-test rule"):
 * the load strip reads the same progress and sends the same recheck whatever stands behind it.
 */
export function progressSourceContract(name: string, harness: () => ProgressSourceHarness): void {
  describe(`ProgressSource contract: ${name}`, () => {
    /** A harness with one listener that records what it hears. */
    function listening() {
      const each = harness();
      const heard: (LoadProgress | undefined)[] = [];
      const unsubscribe = each.source.subscribe((progress) => heard.push(progress));
      return { ...each, heard, unsubscribe };
    }

    it("hears the open page's progress as it changes", async () => {
      const { open, send, heard } = listening();
      open(true);
      await settled();
      const sent = make.progress();
      send(sent);
      expect(heard.at(-1)).toStrictEqual(sent);
    });

    it("hears no store page when none answers", async () => {
      const { open, heard } = listening();
      open(false);
      await settled();
      expect(heard).toStrictEqual([undefined]);
    });

    it("hears nothing once unsubscribed", async () => {
      const { open, send, heard, unsubscribe } = listening();
      unsubscribe();
      open(true);
      await settled();
      send(make.progress());
      expect(heard).toStrictEqual([]);
    });

    it.each<readonly [string, boolean, number]>([
      ["passes a recheck on to the open page once", true, 1],
      ["passes no recheck on without a store page", false, 0],
    ])("%s", async (_name, page, expected) => {
      const { source, open, rechecks } = listening();
      open(page);
      await settled();
      source.recheck();
      await settled();
      expect(rechecks()).toBe(expected);
    });
  });
}
