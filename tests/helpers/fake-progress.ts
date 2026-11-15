import type { LoadProgress, ProgressSource } from "../../src/core/progress";
import type { PortMessage, TabPort } from "../../src/platform/extension/progress-port";

export interface FakeProgressSource extends ProgressSource {
  /** Tells every listener a new progress, or that no store page answers. */
  send(progress: LoadProgress | undefined): void;
  /** How many listeners are subscribed now. */
  readonly listening: number;
  /** How many times the page was asked to look up its failed games again. */
  readonly rechecks: number;
}

/** A `ProgressSource` a test drives by hand. */
export function fakeProgressSource(): FakeProgressSource {
  const listeners = new Set<(progress: LoadProgress | undefined) => void>();
  let rechecks = 0;
  return {
    send(progress) {
      for (const listener of listeners) {
        listener(progress);
      }
    },
    get listening() {
      return listeners.size;
    },
    get rechecks() {
      return rechecks;
    },
    recheck() {
      rechecks += 1;
    },
    subscribe(listener) {
      const own = (progress: LoadProgress | undefined): void => {
        listener(progress);
      };
      listeners.add(own);
      return () => {
        listeners.delete(own);
      };
    },
  };
}

export interface FakeTabPort extends TabPort {
  /** What this end posted, in order. */
  readonly posted: readonly PortMessage[];
  /** Whether this end closed the port. */
  readonly closed: boolean;
  /** Delivers a message from the other end. */
  receive(message: unknown): void;
  /** The other end leaves, or never answered. */
  drop(): void;
}

/** One end of a runtime port that a test drives as the other end. */
export function fakeTabPort(): FakeTabPort {
  const posted: PortMessage[] = [];
  const onMessage: ((message: unknown) => void)[] = [];
  const onDisconnect: (() => void)[] = [];
  let closed = false;
  return {
    posted,
    get closed() {
      return closed;
    },
    receive(message) {
      for (const listener of onMessage) {
        listener(message);
      }
    },
    drop() {
      for (const listener of onDisconnect) {
        listener();
      }
    },
    post(message) {
      posted.push(message);
    },
    onMessage(listener) {
      onMessage.push(listener);
    },
    onDisconnect(listener) {
      onDisconnect.push(listener);
    },
    disconnect() {
      closed = true;
    },
  };
}
