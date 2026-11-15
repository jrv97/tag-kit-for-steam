import { isFailed } from "../cache/ttl";
import { KINDS } from "../kinds/registry";
import { HOST_FAILED, HOST_HIDEABLE, HOST_KINDS } from "../scan/marks";
import type { HostRenderer } from "./host";
import { setAttributeOnce } from "./kind-attributes";

/** Sets `name` to `value`, or removes it when `value` is empty. */
function setOrRemove(host: Element, name: string, value: string): void {
  if (value === "") {
    host.removeAttribute(name);
  } else {
    setAttributeOnce(host, name, value);
  }
}

/** Appends a kind id to a list of ids separated by spaces. */
function withId(list: string, id: string): string {
  return list === "" ? id : `${list} ${id}`;
}

/**
 * Records on each host which kinds it carries, for the list filter and the layout rules:
 * `data-tks-kinds` holds the ids of the kinds tagged for the game (disclosed, with a chosen value
 * for a kind with values, and not ignored), and `data-tks-hideable="false"` marks hosts where
 * hiding would break the list. The style rules turn the root's per-kind filters into dim or hide
 * on these hosts (`applyKindSettings`). `data-tks-failed` holds the kinds whose lookup failed with
 * no retry ahead, for the hidden results notice; nothing filters on it. Writes only what changed,
 * so a rescan or a setting change causes no mutation churn.
 */
export function createHostKindsRenderer(): HostRenderer {
  return {
    render({ host, verdicts, allowed, hideable, retrying }) {
      let present = "";
      let failed = "";
      for (const kind of KINDS) {
        const verdict = verdicts[kind.id];
        if (allowed[kind.id]) {
          continue;
        }
        if (verdict.state === "disclosed") {
          present = withId(present, kind.id);
        } else if (!retrying && isFailed(verdict)) {
          failed = withId(failed, kind.id);
        }
      }
      setOrRemove(host, HOST_KINDS, present);
      setOrRemove(host, HOST_FAILED, failed);
      if (hideable) {
        host.removeAttribute(HOST_HIDEABLE);
      } else {
        setAttributeOnce(host, HOST_HIDEABLE, String(false));
      }
    },
  };
}
