import type { AnyDisclosed } from "../../src/core/kinds/verdicts";
import type { CardTriggers } from "../../src/core/ui/hover-card";

/** What one `bind` call gave a trigger. */
interface Binding {
  readonly entries: readonly AnyDisclosed[];
  readonly ownPage: boolean | undefined;
}

export interface RecordingTriggers {
  readonly card: CardTriggers;
  /** The last binding of each trigger. */
  readonly bound: ReadonlyMap<Element, Binding>;
}

/** Card triggers that record what each element was bound to, and open nothing. */
export function recordingTriggers(): RecordingTriggers {
  const bound = new Map<Element, Binding>();
  return {
    bound,
    card: {
      bind(trigger, entries, ownPage) {
        bound.set(trigger, { entries, ownPage });
      },
    },
  };
}
