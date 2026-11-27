/**
 * Takes `node` out of its parent, and does nothing for a detached node or none.
 * Prototype.js on Steam's store pages makes `Element#remove` throw on a detached element.
 * The userscript and the dev bundle run beside it in the page's own world.
 */
export function detach(node: ChildNode | undefined): void {
  node?.parentNode?.removeChild(node);
}

/** Schedules a callback for the next animation frame, or runs it now in a document without one. */
export function animationFrame(doc: Document): (callback: () => void) => void {
  return (callback) => {
    const view = doc.defaultView;
    if (view === null) {
      callback();
    } else {
      view.requestAnimationFrame(callback);
    }
  };
}

/** A frame's DOM read, which returns the write it decided on, or nothing to write. */
type FrameRead = () => (() => void) | undefined;

/** One read-then-write pass per frame; see `framePhases`. */
export interface FramePhases {
  /** Queues `read` for the next pass. */
  readonly read: (read: FrameRead) => void;
}

/** Hears a read or a write that threw. */
type Report = (problem: unknown) => void;

/** Throws `problem` again in a microtask of its own, where the page reports it. */
function rethrow(problem: unknown): void {
  queueMicrotask(() => {
    throw problem;
  });
}

/** Runs `step`, and hands what it throws to `report`. */
function attempt<T>(step: () => T, report: Report): T | undefined {
  try {
    return step();
  } catch (problem: unknown) {
    report(problem);
    return undefined;
  }
}

/**
 * Runs the reads queued for a frame, then every write they returned, so no write comes between two
 * reads. Modules that share one keep that order across them. A read queued meanwhile waits for
 * the next pass. A read or write that throws goes to `report`, and the rest of the pass runs.
 */
export function framePhases(
  frame: (callback: () => void) => void,
  report: Report = rethrow,
): FramePhases {
  let reads: FrameRead[] = [];
  return {
    read: (read) => {
      reads.push(read);
      if (reads.length > 1) {
        return;
      }
      frame(() => {
        const due = reads;
        reads = [];
        const writes = due.map((each) => attempt(each, report));
        for (const write of writes) {
          if (write !== undefined) {
            attempt(write, report);
          }
        }
      });
    },
  };
}
