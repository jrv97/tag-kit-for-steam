import type { LoadProgress, ProgressSource } from "../../core/progress";

// The load strip of the toolbar popup reads the store tab's progress through a runtime port: the
// popup connects to the active tab (tab-progress.ts), the content script answers (this module).
// The popup sends one message back, which asks the page's failed games again. No permission and
// no background script are involved (rule 3). Neither module names a WebExtension API; ext.ts
// binds them.

/** The name both ends give the port, so the content script ignores any other. */
export const PROGRESS_PORT = "tks-progress";
/** What the popup posts to ask the page's failed games again. */
export const RECHECK_MESSAGE = "tks-recheck";

/** What crosses the port: progress from the page, a recheck from the popup. */
export type PortMessage = LoadProgress | typeof RECHECK_MESSAGE;

/** One end of a runtime port, as far as the load strip uses it. */
export interface TabPort {
  post(message: PortMessage): void;
  onMessage(listener: (message: unknown) => void): void;
  /** Hears the other end leave, or that no end answered the connection. */
  onDisconnect(listener: () => void): void;
  disconnect(): void;
}

/**
 * The content script's end: posts the page's progress on connect and on each change, asks the
 * failed games again on the popup's recheck, and stops listening when the popup goes. A page
 * whose app did not start closes the port.
 */
export function serveProgress(source: ProgressSource, port: TabPort): void {
  port.onMessage((message) => {
    if (message === RECHECK_MESSAGE) {
      source.recheck();
    }
  });
  const unsubscribe = source.subscribe((progress) => {
    if (progress === undefined) {
      port.disconnect();
    } else {
      port.post(progress);
    }
  });
  port.onDisconnect(unsubscribe);
}
