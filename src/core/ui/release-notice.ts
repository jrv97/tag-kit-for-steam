import * as v from "valibot";
import type { KeyValueStore } from "../ports";
import { ALLOW_KEY, SETTINGS_KEY, UI_STATE_KEY, VERSION_KEY } from "../storage-keys";

/** What the toolbar popup says once: an intro on its first open, or the release it updated to. */
export type ReleaseNotice = "intro" | "updated";

/** Keys only an install that someone used holds; the content script alone writes none of them. */
const USED_KEYS = [SETTINGS_KEY, ALLOW_KEY, UI_STATE_KEY] as const;
const VersionSchema = v.string();

/**
 * The notice for a popup opening on `version`, compared with the release stored in `v2:version`,
 * which this call then replaces. Without a stored release, settings, an ignore list or a
 * remembered tab mark an install from before this record, which gets the update line too.
 * A failed read gives no notice; a failed write still gives it, and the next open tries again.
 */
export async function takeReleaseNotice(
  store: KeyValueStore,
  version: string,
): Promise<ReleaseNotice | undefined> {
  let stored: ReadonlyMap<string, unknown>;
  try {
    stored = await store.get([VERSION_KEY, ...USED_KEYS]);
  } catch {
    return undefined;
  }
  const seen = v.safeParse(VersionSchema, stored.get(VERSION_KEY));
  if (seen.success && seen.output === version) {
    return undefined;
  }
  try {
    await store.set(new Map([[VERSION_KEY, version]]));
  } catch {
    // The notice shows now and again on the next open, which retries the write.
  }
  const used = seen.success || USED_KEYS.some((key) => stored.has(key));
  return used ? "updated" : "intro";
}
