import { isFailed } from "../cache/ttl";
import { KINDS } from "../kinds/registry";
import { HOST_FAILED, HOST_HIDEABLE, HOST_KINDS } from "../scan/marks";
import type { HostRenderer } from "./host";
import { setOrRemove } from "./kind-attributes";

/**
 * Marks each host for the list filter: `data-tks-kinds` holds its tagged kinds, `data-tks-failed`
 * the kinds whose lookup failed for good, and `data-tks-hideable="false"` a host that cannot hide.
 * It writes only what changed, so a rescan or a setting change causes no mutation churn.
 */
export function createHostKindsRenderer(): HostRenderer {
  return {
    render({ host, verdicts, allowed, hideable, pending }) {
      const present: string[] = [];
      const failed: string[] = [];
      for (const kind of KINDS) {
        const verdict = verdicts[kind.id];
        if (allowed[kind.id]) {
          continue;
        }
        if (verdict.state === "disclosed") {
          present.push(kind.id);
        } else if (!pending && isFailed(verdict)) {
          failed.push(kind.id);
        }
      }
      setOrRemove(host, HOST_KINDS, present.join(" "));
      setOrRemove(host, HOST_FAILED, failed.join(" "));
      setOrRemove(host, HOST_HIDEABLE, hideable ? "" : String(false));
    },
  };
}
