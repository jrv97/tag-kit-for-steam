import type { SteamLanguage } from "./i18n/locale";
import type { KindId } from "./kinds/id";
import { KINDS } from "./kinds/registry";
import {
  isKindVerdicts,
  type KindVerdict,
  type KindVerdicts,
  withRelations,
} from "./kinds/verdicts";
import type { Detector } from "./ports";
import type { AppId } from "./types";

/** Called when the open page and Steam's data give different answers for one kind. */
export type Disagree = (kind: KindId, page: KindVerdict, data: KindVerdict) => void;

/**
 * One kind from the page and from Steam's data. A kind the page cannot say, or Steam could not
 * answer, takes the other. When both know, a disclosure wins over none, and a disagreement is
 * reported. The data wins when it discloses, and the page when only the page does. On a demo's
 * page the full game's disclosure is no disagreement, and the demo's own wins over it.
 */
function mergeKind(
  kind: KindId,
  page: KindVerdict,
  data: KindVerdict,
  disagree: Disagree,
): KindVerdict {
  if (page.state === "unknown" && page.reason === "missing") {
    return data;
  }
  if (data.state === "disclosed" && data.fullGame === true) {
    return page.state === "disclosed" ? page : data;
  }
  if (data.state === "disclosed") {
    if (page.state !== "disclosed") {
      disagree(kind, page, data);
    }
    return data;
  }
  if (data.state === "unknown") {
    return page;
  }
  if (page.state === "disclosed") {
    disagree(kind, page, data);
    return page;
  }
  return data;
}

/**
 * The verdicts of an English page read from its own document, merged with Steam's data for the
 * game. Only a kind that can be read from the page (`fromAppPage`) takes the page into account.
 * What the app is related to comes from the data alone, as the page does not carry it.
 */
export function mergeVerdicts(
  page: KindVerdicts,
  data: KindVerdicts,
  disagree: Disagree,
): KindVerdicts {
  const merged: Partial<Record<KindId, KindVerdict>> = {};
  for (const kind of KINDS) {
    merged[kind.id] = kind.fromAppPage === undefined
      ? data[kind.id]
      : mergeKind(kind.id, page[kind.id], data[kind.id], disagree);
  }
  return isKindVerdicts(merged) ? withRelations(merged, data) : data;
}

/**
 * Whether a verdict holds the app's own developer text from the API in another language than the
 * page's. A demo's borrowed disclosure is left as it is.
 */
function needsTranslation(verdict: KindVerdict, language: SteamLanguage): boolean {
  return verdict.state === "disclosed" && verdict.fullGame !== true && verdict.source === "api"
    && "language" in verdict && verdict.language !== language;
}

/**
 * The verdicts of a page in another language than English: Steam's data, with the developer text
 * of each `translated` kind asked for again when the cached text is in another language.
 */
export async function translatedVerdicts(
  id: AppId,
  language: SteamLanguage,
  detected: KindVerdicts,
  getItems: Detector,
): Promise<KindVerdicts> {
  const stale = KINDS.filter((kind) =>
    kind.translated === true && needsTranslation(detected[kind.id], language)
  );
  if (stale.length === 0) {
    return detected;
  }
  const fresh = (await getItems.detect([id])).get(id);
  const swapped: Partial<Record<KindId, KindVerdict>> = {};
  let changed = false;
  for (const kind of KINDS) {
    const again = fresh?.[kind.id];
    if (again?.state === "disclosed" && stale.includes(kind)) {
      swapped[kind.id] = again;
      changed = true;
    } else {
      swapped[kind.id] = detected[kind.id];
    }
  }
  return changed && isKindVerdicts(swapped) ? { ...detected, ...swapped } : detected;
}
