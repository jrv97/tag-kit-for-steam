import type { KeyValueStore } from "../ports";
import { RELEASE_KEY } from "../storage-keys";

/** What the toolbar popup says once: an intro on its first open, or the release it updated to. */
export type ReleaseNotice = "intro" | "updated";

/** The notice of one popup open, and the write that spends it. */
export interface ReleaseCheck {
  /** Undefined for the release stored now, or when storage cannot be read. */
  readonly notice: ReleaseNotice | undefined;
  /** Stores the release once the notice is drawn; a failed write leaves it for the next open. */
  record(): Promise<void>;
}

const NOTHING: ReleaseCheck = { notice: undefined, record: () => Promise.resolve() };

/** Compares `version` with `v2:release`: no stored release is an intro, another value an update. */
export async function checkRelease(store: KeyValueStore, version: string): Promise<ReleaseCheck> {
  let stored: ReadonlyMap<string, unknown>;
  try {
    stored = await store.get([RELEASE_KEY]);
  } catch {
    return NOTHING;
  }
  if (stored.get(RELEASE_KEY) === version) {
    return NOTHING;
  }
  return {
    notice: stored.has(RELEASE_KEY) ? "updated" : "intro",
    async record() {
      try {
        await store.set(new Map([[RELEASE_KEY, version]]));
      } catch {
        // The next open shows the notice again and retries the write.
      }
    },
  };
}
