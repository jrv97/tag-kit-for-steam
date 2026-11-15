import type { LoadProgress, ProgressSource } from "../../core/progress";

// The popup's load strip reads the store tab's progress over a runtime port, with no permission
// or background script (rule 3). The content script serves it here and hears one recheck back.
// tab-progress.ts is the popup's end, and ext.ts binds both ends to the WebExtension API.

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
