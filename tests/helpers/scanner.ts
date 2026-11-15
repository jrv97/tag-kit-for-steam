import { vi } from "vitest";
import {
  createScanner,
  DEBOUNCE_MS,
  type Scanner,
  type ScanReport,
} from "../../src/core/scan/scanner";
import { type RecordingRenderer, recordingRenderer } from "./recording-renderer";

/** One animation frame under fake timers. */
export const FRAME_MS = 16;

/** A started scanner with the renderer and the reports it feeds. */
export interface StartedScanner {
  readonly scanner: Scanner;
  readonly renderer: RecordingRenderer;
  readonly reports: readonly ScanReport[];
}

/** Fakes the timers a scanner waits on. `performance.now` stays real. */
export function useScanTimers(): void {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"],
  });
}

/** Starts a scanner on the current page and lets its first page scan run. */
export async function launchScanner(
  options: { readonly badges?: boolean; } = {},
): Promise<StartedScanner> {
  const renderer = recordingRenderer(options);
  const reports: ScanReport[] = [];
  const scanner = createScanner({ document, renderer, onReport: (report) => reports.push(report) });
  scanner.start();
  await vi.advanceTimersByTimeAsync(FRAME_MS);
  return { scanner, renderer, reports };
}

/** Lets a debounced scan run after the last mutation. */
export async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + FRAME_MS);
}
