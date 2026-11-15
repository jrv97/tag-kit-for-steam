"""Check the built bundles in dist/ (and artifacts/ when present) against the project rules.

- Manifests: permissions exactly ["storage"], no host permissions, and only the background script
  that sets the toolbar icon, as a service worker in Chromium and an event page in Gecko (rule 3,
  ADR 0027); the action's default icon is the dimmed set; content scripts match the store only;
  Gecko settings only in the Gecko build; every __MSG_*__ resolves; every file the manifest names
  exists, and each icon is a PNG of the size its key declares.
- THIRD_PARTY_NOTICES.md is in each extension build, extension zip and the source archive, and its
  valibot text equals node_modules/valibot/LICENSE.md once whitespace is normalized.
- Extension pages carry no copy (rule 9): only whitespace text, and `data-i18n` keys that resolve.
  Each page links an icon that exists, or its browser tab shows a puzzle piece.
- Userscript: header present, no @connect, exact @match, @updateURL, @downloadURL, @homepageURL,
  @supportURL and @icon (the 48 px icon as a data URI); every `GM` name in the bundle has an
  @grant and every @grant is used; valibot's license block is in the body; no userscript header
  in any other bundle.
- Manifests declare only the top-level keys they use today, so web_accessible_resources,
  externally_connectable or a content_security_policy needs an ADR first. Every content script
  runs in the isolated world, and without the `scripting` permission no code can register or
  inject a script into the page (rules 2 and 3).
- No bundle runs code from a string: eval, Function or a string timer (rule 2). No URL outside the
  two Valve hosts, except the feedback links of the settings footer and the release notes prefix
  of the popup, as whole string literals in options.js and the userscript.
- No bundle writes a cookie through `document.cookie` or `cookieStore` (rule 1).
- The extension bundles build no <script>, parsed markup or inline handler, which would run outside
  their isolated code. The userscript and the dev bundle run in the page world by design (ADR 0029).
- Catalogs: each shipped bundle carries exactly the messages its code reads (decision 58). Every
  key or plural base that a string literal of its code names is in its inlined catalogs, and every
  message there is named, so a missing key fails here and never falls back to the raw key on a
  store page. scripts/gen_catalogs.py writes each entry's catalogs by the same reading.
- Size budgets, unminified (rule 13): content.js 250 KiB, options.js 260 KiB, announce.js and
  background.js 1 KiB each, and the userscript 440 KiB. Each is a measured size plus 2 to 3
  percent of headroom. Raise one only with a measurement, and give it in the pull request.
- The STEAM_API_KEY value, when set, appears nowhere in dist/ or artifacts/, zip members
  included (rule 16).
- The dev injection bundle is never packaged into artifacts/, and when artifacts/ exists it holds
  exactly the five release artifacts, with a manifest at the root of each extension zip. The source
  archive holds no dist/, artifacts/ or node_modules/, and from docs/ only the design tokens.
"""

import os
import re
import zipfile
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath

from bundle_keys import carried_keys, message_names, name_of, read_names
from catalogs import DEFAULT_LOCALE, load, plural_bases
from repo import (
    ARTIFACTS,
    DIST,
    EXTENSION_TARGETS,
    ISSUES_URL,
    OFF_ICON_SIZES,
    REPO_URL,
    ROOT,
    SLUG,
    USERSCRIPT_ICON,
    VALIBOT_LICENSE,
    fail,
    json_object,
    json_string,
    package_version,
    png_data_uri,
    png_size,
    read_json,
    valibot_notice,
)

KIB = 1024
BUDGETS = {
    **{DIST / target / "content.js": 250 * KIB for target in EXTENSION_TARGETS},
    **{DIST / target / "options.js": 260 * KIB for target in EXTENSION_TARGETS},
    **{DIST / target / "announce.js": 1 * KIB for target in EXTENSION_TARGETS},
    **{DIST / target / "background.js": 1 * KIB for target in EXTENSION_TARGETS},
    DIST / "userscript" / f"{SLUG}.user.js": 440 * KIB,
}
# The one background script each build ships (rule 3, ADR 0027).
BACKGROUND = {
    "chromium": {"service_worker": "background.js"},
    "gecko": {"scripts": ["background.js"]},
}
OFF_ICONS = {str(size): f"icons/icon-off-{size}.png" for size in OFF_ICON_SIZES}
ENGLISH = ROOT / "src" / "locales" / DEFAULT_LOCALE / "messages.json"
STORE_MATCH = ["https://store.steampowered.com/*"]
RELEASE_BASE = f"{REPO_URL}/releases/latest/download"
ALLOWED_HOSTS = {"api.steampowered.com", "store.steampowered.com"}
# The links of the settings (src/core/feedback-links.ts): plain links a person opens in a tab,
# never requested. Only these whole string literals, quotes included, and only in the bundles that
# show the settings.
SETTINGS_LINKS = tuple(
    f'"{link}"'
    for link in (
        f"{REPO_URL}#faq",
        f"{ISSUES_URL}/new?template=bug_report.yml",
        f"{ISSUES_URL}/new?template=feature_request.yml",
        f"{REPO_URL}/releases/tag/",
    )
)
SETTINGS_BUNDLES = {"options.js", f"{SLUG}.user.js"}
HEADER_START = "// ==UserScript=="
HEADER_END = "// ==/UserScript=="
REMOTE_CODE = re.compile(r"\beval\b|\bFunction\s*\(|\bset(?:Timeout|Interval)\(\s*[\"'`]")
COOKIE_WRITE = re.compile(
    r"\bdocument\s*(?:\.\s*cookie|\[\s*[\"'`]cookie[\"'`]\s*\])\s*(?:\+|\|\||\?\?|&&)?=(?!=)"
    r"|\bcookieStore\s*\??\.\s*(?:set|delete)\b"
)
# Ways for an extension bundle to run code or markup outside its own isolated code.
PAGE_CODE = re.compile(
    r"\bcreateElement(?:NS)?\([^)]*?[\"'`](?i:script)[\"'`]|\bcreateContextualFragment\b"
    r"|\binsertAdjacentHTML\b|\b(?:inner|outer)HTML\s*=(?!=)|\bsrcdoc\b"
    r"|\bsetAttribute\(\s*[\"'`]on"
)
# The top-level keys a manifest may declare. Any other, such as web_accessible_resources, a host
# permission or a content_security_policy, needs an ADR first (rules 2 and 3).
MANIFEST_KEYS = {
    "action",
    "background",
    "content_scripts",
    "default_locale",
    "description",
    "icons",
    "manifest_version",
    "name",
    "options_ui",
    "permissions",
    "short_name",
    "version",
}
GECKO_SETTINGS = "browser_specific_settings"
URL = re.compile(r"(?:https?|wss?)://([A-Za-z0-9.-]+)")
GM_NAME = re.compile(r"\bGM(?:\.[A-Za-z_]\w*|_[A-Za-z]\w*)")
HEADER_FIELD = re.compile(r"^//\s+(@[\w:-]+)[ \t]*(.*?)\s*$", re.MULTILINE)
MSG = re.compile(r"__MSG_([A-Za-z0-9_@]+)__")
# The only file of docs/ that the source archive keeps: scripts/gen_styles.py reads it to build.
SOURCE_DOCS = {"docs/design/tokens.css"}
NOTICES = "THIRD_PARTY_NOTICES.md"


def paths(value: object, where: str) -> list[str]:
    """The file paths in a manifest value: a path, a list of paths or an object of them."""
    if value is None:
        return []
    if isinstance(value, list):
        return [json_string(item, where) for item in value]
    if isinstance(value, dict):
        return [json_string(item, where) for item in value.values()]
    return [json_string(value, where).split("?", 1)[0]]


def manifest_files(manifest: dict[str, object], where: str) -> list[str]:
    """Every packaged file the manifest names: icons, scripts, styles and pages."""
    files = paths(manifest.get("icons"), where)
    scripts = manifest.get("content_scripts")
    for script in scripts if isinstance(scripts, list) else []:
        entry = json_object(script, where)
        files += paths(entry.get("js"), where) + paths(entry.get("css"), where)
    action = json_object(manifest.get("action", {}), where)
    files += paths(action.get("default_icon"), where) + paths(action.get("default_popup"), where)
    files += paths(json_object(manifest.get("options_ui", {}), where).get("page"), where)
    for script in json_object(manifest.get("background", {}), where).values():
        files += paths(script, where)
    return files


class PageText(HTMLParser):
    """Collects the text, the `data-i18n` keys and the icon links of an extension page."""

    def __init__(self) -> None:
        super().__init__()
        self.text: list[str] = []
        self.keys: list[str] = []
        self.icons: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.keys += [value for name, value in attrs if name == "data-i18n" and value is not None]
        if tag == "link" and ("rel", "icon") in attrs:
            self.icons += [value for name, value in attrs if name == "href" and value is not None]

    def handle_data(self, data: str) -> None:
        if data.strip():
            self.text.append(data.strip())


def page_problems(path: Path, catalog: dict[str, object]) -> list[str]:
    where = path.relative_to(DIST.parent).as_posix()
    parser = PageText()
    parser.feed(path.read_text(encoding="utf-8"))
    problems = [f"{where}: copy belongs in the catalog, found {text!r}" for text in parser.text]
    problems += [
        f"{where}: data-i18n key {key} has no message" for key in parser.keys if key not in catalog
    ]
    if not parser.icons:
        problems.append(f'{where}: no <link rel="icon">')
    problems += [
        f"{where}: icon {href} is missing"
        for href in parser.icons
        if not (path.parent / href).is_file()
    ]
    return problems


def manifest_where(target: str) -> str:
    return f"dist/{target}/manifest.json"


def packaged_problems(
    target: str, manifest: dict[str, object], catalog: dict[str, object]
) -> list[str]:
    """The files the manifest names exist, and its pages carry no copy."""
    root = DIST / target
    problems: list[str] = []
    for name in sorted(set(manifest_files(manifest, manifest_where(target)))):
        if not (root / name).is_file():
            problems.append(f"dist/{target}/manifest.json: names {name}, which is missing")
        elif name.endswith(".html"):
            problems += page_problems(root / name, catalog)
    return problems


def icon_problems(target: str, manifest: dict[str, object]) -> list[str]:
    """Each icon the manifest declares by size is a PNG of exactly that size."""
    where = manifest_where(target)
    action = json_object(manifest.get("action", {}), where)
    declared = [manifest.get("icons", {}), action.get("default_icon", {})]
    problems: list[str] = []
    for icons in declared:
        for size, name in json_object(icons, where).items():
            path = DIST / target / json_string(name, where)
            if not size.isdigit() or not path.is_file():
                continue
            found = png_size(path)
            if found != (int(size), int(size)):
                problems.append(f"{where}: {name} is {found or 'no PNG'}, declared {size}x{size}")
    return list(dict.fromkeys(problems))


def normalized(text: str) -> str:
    return " ".join(text.split())


def notices_text_problems(where: str, text: str) -> list[str]:
    if normalized(VALIBOT_LICENSE.read_text(encoding="utf-8")) in normalized(text):
        return []
    return [f"{where}: the valibot text differs from node_modules/valibot/LICENSE.md"]


def notices_problems(where: str, path: Path) -> list[str]:
    if not path.is_file():
        return [f"{where}: missing"]
    return notices_text_problems(where, path.read_text(encoding="utf-8"))


def manifest_shape_problems(target: str, manifest: dict[str, object]) -> list[str]:
    """The keys a manifest may declare and the exact values the rules allow (rules 2 and 3)."""
    where = manifest_where(target)
    allowed = MANIFEST_KEYS | ({GECKO_SETTINGS} if target == "gecko" else set())
    problems = [f"{where}: {key} is not allowed" for key in sorted(manifest.keys() - allowed)]
    if manifest.get("permissions") != ["storage"]:
        problems.append(f'{where}: permissions must be exactly ["storage"]')
    if manifest.get("background") != BACKGROUND[target]:
        problems.append(f"{where}: background must be exactly {BACKGROUND[target]}")
    if json_object(manifest.get("action", {}), where).get("default_icon") != OFF_ICONS:
        problems.append(f"{where}: the action's default_icon must be {OFF_ICONS}")
    scripts = manifest.get("content_scripts")
    if not isinstance(scripts, list) or not scripts:
        problems.append(f"{where}: content_scripts is missing")
    else:
        for script in scripts:
            entry = json_object(script, where)
            if entry.get("matches") != STORE_MATCH:
                problems.append(f"{where}: content script matches must be {STORE_MATCH}")
            if entry.get("world", "ISOLATED") != "ISOLATED":
                problems.append(f"{where}: content scripts must run in the isolated world")
    if target == "gecko" and GECKO_SETTINGS not in manifest:
        problems.append(f"{where}: {GECKO_SETTINGS} is missing")
    return problems


def manifest_problems(target: str) -> list[str]:
    root = DIST / target
    where = manifest_where(target)
    manifest = json_object(read_json(root / "manifest.json"), where)
    problems = manifest_shape_problems(target, manifest)
    locale = json_string(manifest.get("default_locale"), f"{where} default_locale")
    catalog = json_object(read_json(root / "_locales" / locale / "messages.json"), locale)
    for key in MSG.findall((root / "manifest.json").read_text(encoding="utf-8")):
        if key not in catalog:
            problems.append(f"{where}: __MSG_{key}__ has no message in _locales/{locale}")
    return (
        problems
        + packaged_problems(target, manifest, catalog)
        + icon_problems(target, manifest)
        + notices_problems(f"dist/{target}/{NOTICES}", root / NOTICES)
    )


def split_header(text: str) -> tuple[str, str]:
    if not text.startswith(HEADER_START) or HEADER_END not in text:
        return "", text
    end = text.index(HEADER_END) + len(HEADER_END)
    return text[:end], text[end:]


def header_fields(header: str) -> dict[str, list[str]]:
    fields: dict[str, list[str]] = {}
    for key, value in HEADER_FIELD.findall(header):
        fields.setdefault(key, []).append(value)
    return fields


def fixed_header_fields() -> dict[str, list[str]]:
    """The userscript header fields whose values are fixed, by key."""
    return {
        "@match": STORE_MATCH,
        "@updateURL": [f"{RELEASE_BASE}/{SLUG}.meta.js"],
        "@downloadURL": [f"{RELEASE_BASE}/{SLUG}.user.js"],
        "@homepageURL": [REPO_URL],
        "@supportURL": [ISSUES_URL],
        "@icon": [png_data_uri(USERSCRIPT_ICON)],
    }


def header_problems(where: str, header: str) -> list[str]:
    """Each fixed header field that is missing or holds another value, and a missing @noframes."""
    fields = header_fields(header)
    problems: list[str] = []
    for key, values in fixed_header_fields().items():
        if fields.get(key) != values:
            problems.append(f"{where}: {key} must be {values}")
    if "@noframes" not in fields:
        problems.append(f"{where}: @noframes is missing")
    return problems


def grant_problems(where: str, header: str, body: str) -> list[str]:
    granted = set(header_fields(header).get("@grant", []))
    used = set(GM_NAME.findall(body))
    return [f"{where}: {name} is used without an @grant" for name in sorted(used - granted)] + [
        f"{where}: @grant {name} is never used" for name in sorted(granted - used)
    ]


def notice_problems(where: str, body: str) -> list[str]:
    if valibot_notice() in body:
        return []
    return [f"{where}: valibot's license text is missing from the userscript"]


def script_problems(where: str, text: str, isolated: bool) -> list[str]:
    """A bundle's problems: its userscript header, then its code."""
    name = PurePosixPath(where).name
    problems: list[str] = []
    header, body = split_header(text)
    if name.endswith((".user.js", ".meta.js")):
        if not header:
            problems.append(f"{where}: the userscript header is missing")
        if "@connect" in header:
            problems.append(f"{where}: @connect is not allowed")
        if header:
            problems += header_problems(where, header)
            if name.endswith(".user.js"):
                problems += grant_problems(where, header, body)
                problems += notice_problems(where, body)
    elif HEADER_START in text:
        problems.append(f"{where}: a userscript header belongs in the userscript only")
    if name.endswith(".meta.js"):
        return problems
    return problems + code_problems(where, body, isolated)


def code_problems(where: str, body: str, isolated: bool) -> list[str]:
    """Remote code, cookie writes and hosts in a bundle's code. An isolated bundle (the extension's)
    also builds no script, markup or inline handler; the userscript and the dev bundle run in the
    page world by design (ADR 0029)."""
    problems: list[str] = []
    if REMOTE_CODE.search(body):
        problems.append(f"{where}: runs code from a string")
    if COOKIE_WRITE.search(body):
        problems.append(f"{where}: writes a cookie")
    if isolated and PAGE_CODE.search(body):
        problems.append(f"{where}: builds a <script>, markup or an inline handler")
    if PurePosixPath(where).name in SETTINGS_BUNDLES:
        for link in SETTINGS_LINKS:
            body = body.replace(link, "")
    for host in sorted(set(URL.findall(body)) - ALLOWED_HOSTS):
        problems.append(f"{where}: URL to a host outside the allowlist: {host}")
    return problems


def catalog_problems(paths: list[Path]) -> list[str]:
    """Each shipped bundle carries the messages its code reads, and no other."""
    english = load(ENGLISH)
    names = message_names(english)
    bases = plural_bases(english)
    problems: list[str] = []
    for path in paths:
        where = path.relative_to(DIST.parent).as_posix()
        script = path.read_text(encoding="utf-8")
        read = read_names(script, names)
        carried = {name_of(key, bases) for key in carried_keys(script)}
        problems += [
            f"{where}: reads {name}, which its catalogs lack" for name in sorted(read - carried)
        ]
        problems += [
            f"{where}: carries {name}, which its code never reads"
            for name in sorted(carried - read)
        ]
    return problems


def holds(path: Path, needle: bytes) -> bool:
    """Whether a file holds the bytes; a zip archive is read member by member."""
    if path.suffix == ".zip":
        with zipfile.ZipFile(path) as archive:
            return any(needle in archive.read(name) for name in archive.namelist())
    return needle in path.read_bytes()


def secret_problems(roots: list[Path]) -> list[str]:
    secret = os.environ.get("STEAM_API_KEY", "")
    if len(secret) < 8:
        return []
    needle = secret.encode()
    return [
        f"{path}: contains the STEAM_API_KEY value"
        for root in roots
        for path in sorted(root.rglob("*"))
        if path.is_file() and holds(path, needle)
    ]


def zip_member(path: Path, name: str, folder: bool) -> str | None:
    """A member's text: at the zip root, or under the single folder of the source archive."""
    with zipfile.ZipFile(path) as archive:
        for entry in archive.namelist():
            if (entry.split("/", 1)[1] if folder and "/" in entry else entry) == name:
                return archive.read(entry).decode("utf-8")
    return None


def zip_notices_problems(where: str, path: Path, folder: bool) -> list[str]:
    text = zip_member(path, NOTICES, folder)
    if text is None:
        return [f"{where}: {NOTICES} is missing"]
    return notices_text_problems(f"{where}: {NOTICES}", text)


def zip_names(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as archive:
        return archive.namelist()


def artifact_problems() -> list[str]:
    """The artifacts/ folder holds exactly the five release files, and no dev bundle."""
    version = package_version()
    extensions = [f"{SLUG}-{target}-{version}.zip" for target in EXTENSION_TARGETS]
    source = f"{SLUG}-source-{version}.zip"
    expected = {*extensions, source, f"{SLUG}.user.js", f"{SLUG}.meta.js"}
    present = {path.name for path in ARTIFACTS.iterdir()}
    problems = [f"artifacts/{name}: missing" for name in sorted(expected - present)]
    problems += [f"artifacts/{name}: unexpected" for name in sorted(present - expected)]
    for name in extensions:
        if name not in present:
            continue
        names = zip_names(ARTIFACTS / name)
        if "manifest.json" not in names:
            problems.append(f"artifacts/{name}: manifest.json is not at the zip root")
        problems += zip_notices_problems(f"artifacts/{name}", ARTIFACTS / name, folder=False)
        problems += [
            f"artifacts/{name}: {entry} is a dev bundle file"
            for entry in names
            if entry.startswith("dev/") or entry.endswith("inject.js")
        ]
    if source in present:
        problems += zip_notices_problems(f"artifacts/{source}", ARTIFACTS / source, folder=True)
        names = [entry.split("/", 1)[1] for entry in zip_names(ARTIFACTS / source) if "/" in entry]
        roots = {name.split("/", 1)[0] for name in names if name}
        problems += [
            f"artifacts/{source}: contains {root}/"
            for root in ("dist", "artifacts", "node_modules")
            if root in roots
        ]
        docs = {name for name in names if name.startswith("docs/") and not name.endswith("/")}
        if docs != SOURCE_DOCS:
            problems.append(f"artifacts/{source}: docs/ must hold only {sorted(SOURCE_DOCS)}")
    return problems


def main() -> None:
    if not DIST.is_dir():
        fail("dist/ is missing; run `mise run build` first")
    problems: list[str] = []
    for target in EXTENSION_TARGETS:
        problems += manifest_problems(target)
    for path in sorted(DIST.rglob("*.js")):
        where = path.relative_to(DIST.parent).as_posix()
        isolated = path.relative_to(DIST).parts[0] in EXTENSION_TARGETS
        problems += script_problems(where, path.read_text(encoding="utf-8"), isolated)
    problems += catalog_problems([path for path in BUDGETS if path.is_file()])
    for path, budget in BUDGETS.items():
        if not path.is_file():
            problems.append(f"{path}: missing")
        elif path.stat().st_size > budget:
            problems.append(f"{path}: {path.stat().st_size} bytes, budget {budget}")
    roots = [DIST] + ([ARTIFACTS] if ARTIFACTS.is_dir() else [])
    problems += secret_problems(roots)
    if ARTIFACTS.is_dir():
        problems += artifact_problems()
    if problems:
        print("\n".join(problems))
        fail(f"{len(problems)} bundle problem(s)")


if __name__ == "__main__":
    main()
