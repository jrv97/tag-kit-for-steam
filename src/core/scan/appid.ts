import { type AppId, toAppId } from "../types";

const STORE_HOST = "store.steampowered.com";
const DIGITS = /^\d+$/;
/** `/app/<id>`, then a slash or the end: slugs, queries and hashes pass, `/app/12abc` does not. */
const APP_PATH = /^\/app\/(\d+)(?:\/|$)/;

/**
 * The app ID in a `data-ds-appid` value. Only a single numeric ID counts: a comma list belongs to
 * a package or bundle capsule and names no single app.
 */
export function appIdFromDataAttribute(value: string): AppId | undefined {
  const trimmed = value.trim();
  return DIGITS.test(trimmed) ? toAppId(Number(trimmed)) : undefined;
}

/** The id prefix of the app block in Steam's classic hover card, `hover_app_<id>`. */
export const HOVER_APP_PREFIX = "hover_app_";

/** The app ID in the id of a classic hover card's app block, `hover_app_<id>`. */
export function appIdFromHoverId(id: string): AppId | undefined {
  return id.startsWith(HOVER_APP_PREFIX)
    ? appIdFromDataAttribute(id.slice(HOVER_APP_PREFIX.length))
    : undefined;
}

/**
 * The app ID an `href` links to, when it resolves to a store app page. Relative links resolve
 * against `base` (the document's base URL). Other hosts, steamcommunity.com included, and store
 * paths such as `/agecheck/app/<id>` name no app.
 */
export function appIdFromHref(href: string, base: string): AppId | undefined {
  const url = URL.parse(href, base);
  if (url === null || url.hostname !== STORE_HOST) {
    return undefined;
  }
  const digits = APP_PATH.exec(url.pathname)?.[1];
  return digits === undefined ? undefined : toAppId(Number(digits));
}
