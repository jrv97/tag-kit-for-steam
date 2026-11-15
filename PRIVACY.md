# Privacy

Tag Kit for Steam collects nothing. It has no analytics, no telemetry, no account and no server of its own, and its code contacts no host other than Valve's. It sends no reports anywhere, and nothing is sent to the developer.

## What is stored on your device

The extension keeps these keys in its local storage (`storage.local`), apart from `v2:origin`. The userscript keeps the same keys in your userscript manager's storage, apart from `v2:release` and `v2:origin`, which belong to the toolbar popup.

### Lookup results (`v1:a:<app ID>`)

One entry per app ID that was checked. Each entry holds:

- the time it was checked;
- which sections of Steam's store data the answer came with;
- for each tag, whether Steam's data discloses it, does not, or gives no answer (and why), whether the answer came from Steam's API or the app's store page, and the details Steam lists for a disclosed tag: the developer's AI report text, its language, the name of a named AI service and the game's name; the developer's Early Access note and the release date; the 3rd-party account text and whether it links to Steam; the 3rd-party DRM text and any activation limit; the names and links of 3rd-party EULAs; the anti-cheat name and its kernel-level details; the Family Sharing, Steam Deck or Steam Machine value; the PvP category IDs;
- the app ID of the base game of a DLC or the full game of a demo, and whether the item is a demo;
- the developer and publisher names with their Steam group (clan) IDs, up to 8 per role.

Each open store page also keeps up to 2,000 results in memory, and drops them when the page closes.

### Settings (`v2:settings`)

The language, the debug flag, the tag order, and for each tag: whether it is on, whether it shows a badge and a banner entry, its list filter mode (off, dim or hide), its color, your chip text for normal and small game images, and the values it tags.

### Ignore lists (`v2:allow`, `v2:allow-developers`, `v2:allow-publishers`)

The games, developers and publishers you chose to ignore, for all tags or for one tag. Each entry is an app ID, or a developer or publisher's Steam group ID (or Steam's name when there is no ID), with its name and the date you added it.

### Small records

- `v2:ui`: the settings tab you last opened, and the time the toolbar popup last asked the settings to open a tab.
- `v2:release`: the version the toolbar popup last opened on. The popup reads it to show its intro once and to say once that it updated.
- `v1:meta`: the cache format number and the time of the last cache sweep.
- `v1:breaker` and `v1:breaker:html`: a time about a minute ahead, written when Steam answers with a rate limit or a server error or a request fails. Until then no new request goes to that endpoint. The record stays after that time passes, until the next one replaces it.
- `v2:origin`: the ID of the browser tab you were on when you opened the settings from the toolbar popup, a number and never the page's address. Go back uses it to return to that tab. It sits in the extension's session storage (`storage.session`), which is kept in memory and cleared when the browser closes or the extension reloads. The settings page deletes it once it reads it while its own tab is in front.

### Older keys

`v1:settings` and `v1:allow` exist only on an install that ran an earlier version, and hold its settings and ignore lists. Whenever `v2:settings` or `v2:allow` is missing or unreadable, the extension copies the older key into it and leaves the older key in place. Nothing writes to the older keys.

None of these keys is sent anywhere. A backup file you save holds a copy of the settings and the lists.

## How long it is kept

A lookup result goes stale when the shortest time of its tags runs out:

- 6 hours for a tag Steam was asked about and gave no answer for;
- 12 hours when Steam's data has no AI disclosure, and 7 days when it has one;
- 2 days for an item in Early Access, and 7 days for one that is not;
- 7 days for every other tag.

A tag whose data was not requested, because the tag was off, sets no time of its own. A stale item is requested again the next time it shows up on a page, and so is an item that lacks the data a tag you turned on needs. When a store page opens, at most once a day, a sweep deletes the stale and unreadable results. A new cache format deletes all of them.

Settings, ignore lists and the small records other than `v2:origin` never expire. Removing the extension clears every key. For the userscript, your manager decides when a removed script's values are deleted.

## Clearing it yourself

The General tab of the settings, on the options page and in the userscript dialog, has two cards:

- Lookup results: Clear lookup results deletes every stored result, and Check unknown games again deletes the results that hold a tag Steam gave no answer for.
- Reset: Reset all settings puts every tag's settings and the tag order back to their defaults (the language and the debug flag stay), and Stop ignoring everything empties the three ignore lists.

Neither card touches `v2:ui`, `v2:release`, `v1:meta`, the back-off records or the older keys.

## Backup files

Download backup saves your settings and ignore lists to a JSON file through your browser's own download. Restore reads a file you pick. Neither sends the file anywhere. The file holds no lookup results and none of the small records.

## What is sent, and where

To find out which tags an item has, the app IDs of the items on the page you are viewing, and of the full game of a demo shown there, are sent to two Valve hosts:

- `https://api.steampowered.com/IStoreBrowseService/GetItems/v1`: its `input_json` holds the app IDs, in batches of up to 50, the page's Steam language to get the developer's text translated, a fixed country code of `US`, and which sections of store data to include. The country code is the same for everyone, and the request carries no location of yours.
- `https://store.steampowered.com/app/<id>/?l=english`: a fallback that fetches an app's store page when the API gives no answer, for up to 10 apps per page view. An English app page you have open is read in place, with no request.

Every one of these requests is made without cookies (`credentials: "omit"`) and without a Referer (`referrerPolicy: "no-referrer"`), and adds no headers of its own. Steam gets no login or session from them, and no address of the page you are on. Valve sees your IP address, the app IDs and the headers your browser adds to any request, such as its user agent and, on GetItems, the store's origin. These are the same hosts your browser talks to while you browse the store. Each store page spaces its requests to a host at least one second apart.

The extension's background script makes no request and stores nothing. It switches the toolbar icon to its normal look on store tabs; the store page tells it which tab, and nothing else. The extension requests only the `storage` permission and runs only on `https://store.steampowered.com/*`. The userscript declares no `@connect` hosts.

## Updates

The Chrome Web Store and Firefox Add-ons update the extension. Tampermonkey and Violentmonkey check the userscript's `@updateURL` and fetch its `@downloadURL`, both files of the latest release on GitHub (`github.com/jrv97/tag-kit-for-steam/releases/latest/download/`). GitHub sees those requests, as it does for any download.

## Links in the settings

The feedback links in the settings footer open GitHub's bug report and feature request forms, and the popup's update line opens the release notes on GitHub, each in a new tab. The name of each ignored game links to its store page. These are plain links that load only when you click them. Neither the extension nor the userscript requests them.

## What is never read or sent

The extension and the userscript do not read your Steam account, library, cookies or browsing history. On a wishlist page they read the app IDs shown, as on any store page. They send no app IDs, settings or other data to any host other than Valve's.

## Not affiliated with Valve

This is an independent project, not affiliated with or endorsed by Valve Corporation.

## Changes

If this policy changes, the change is made in this file and in the project's release notes.
