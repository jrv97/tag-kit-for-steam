"""Test data for the script tests: the inputs and expected values they would build by hand.

One namespace per script under test. Tables pair inputs with expected results.
"""

import json
import zipfile
from datetime import date
from pathlib import Path
from typing import Final

from calver import MAX_SEGMENT, Version
from catalogs import Catalog, Entry, used_placeholders
from check_bundle import (
    BACKGROUND,
    HEADER_END,
    HEADER_START,
    OFF_ICONS,
    SETTINGS_LINKS,
    STORE_MATCH,
    fixed_header_fields,
)
from repo import SLUG
from ts_literals import Literal

# A description that every test catalog entry shares; the checks never read it.
DESCRIPTION: Final = "A description."


def catalog(**messages: str) -> Catalog:
    """A catalog of these messages by key."""
    return {
        key: Entry(key, message, DESCRIPTION, used_placeholders(message))
        for key, message in messages.items()
    }


def keyed_catalog(*keys: str) -> Catalog:
    """A catalog whose messages repeat their keys."""
    return catalog(**{key: key for key in keys})


class Calver:
    """Versions and tags for calver.py."""

    DAY: Final = date(2026, 10, 5)

    PARSED: Final[tuple[tuple[str, Version], ...]] = (
        ("2026.10.5", (2026, 10, 5, 0)),
        ("2026.1.31.2", (2026, 1, 31, 2)),
        (f"2026.12.31.{MAX_SEGMENT}", (2026, 12, 31, MAX_SEGMENT)),
    )

    UNPARSABLE: Final = (
        "2026.10.05",
        "2026.01.5",
        "2026.10.5.01",
        "2026.10.5.0",
        "v2026.10.5",
        "2026.10",
        "2026.10.5.1.1",
        "2026.13.1",
        "2026.2.30",
        f"2026.10.5.{MAX_SEGMENT + 1}",
        "0.0.0",
        "2026.10.5-1",
    )

    # (today, tags, next version): first release unpadded, recuts from one, other days and tags
    # ignored, never more than four segments.
    NEXT: Final[tuple[tuple[date, tuple[str, ...], str], ...]] = (
        (DAY, (), "2026.10.5"),
        (date(2027, 1, 9), ("2026.10.5",), "2027.1.9"),
        (DAY, ("2026.10.5",), "2026.10.5.1"),
        (DAY, ("2026.10.5", "2026.10.5.1"), "2026.10.5.2"),
        (DAY, ("2026.10.5.2", "2026.10.5"), "2026.10.5.3"),
        (DAY, ("2026.10.4", "2026.10.4.7", "nightly", "v1.0.0", "2026.10.05"), "2026.10.5"),
        (DAY, ("2026.10.5", "2026.10.5.9"), "2026.10.5.10"),
    )

    # (today, tags) with no next version: the segment limit, a tag newer than today.
    NO_NEXT: Final[tuple[tuple[date, tuple[str, ...]], ...]] = (
        (DAY, ("2026.10.5", f"2026.10.5.{MAX_SEGMENT}")),
        (DAY, ("2026.10.6",)),
    )


class CheckI18n:
    """Catalogs, literals and source files for the literal-copy check of check_i18n.py."""

    HEADING: Final = "AI Generated Content Disclosure"
    ENGLISH: Final = catalog(
        banner_undo="Undo",
        notice_settings_saved="Saved.",
        userscript_menu_settings="Settings",
        options_version="Version $version$",
        options_allow_restore_label="Stop ignoring $name$",
        banner_source="In the developer's own words:",
        options_privacy_lookup="To check a game, it asks Valve's own store servers.",
        only_placeholder="$count$",
        short_with_placeholder="$n$ ok",
        ext_description=f"Tags: {HEADING}, PvP.",
    )
    SPANISH: Final = catalog(banner_undo="Deshacer", banner_source="En palabras del desarrollador:")
    CATALOGS: Final = {"en": ENGLISH, "es": SPANISH}
    HIT: Final = "catalog text in a string literal"

    # (literal parts, matching keys) over CATALOGS.
    MATCHES: Final[tuple[tuple[tuple[str, ...], list[str]], ...]] = (
        # A literal equal to a short message matches; a short word inside a longer one does not
        (("Undo",), ["banner_undo"]),
        (("Saved.",), ["notice_settings_saved"]),
        ((" Undo ",), ["banner_undo"]),
        (("Deshacer",), ["banner_undo (es)"]),
        (("Undo the change",), []),
        (("parseSettings",), []),
        (("Accept-Settings",), []),
        (("undo",), []),
        (("Sav",), []),
        # A placeholder message matches when the whole literal fits
        (("Version 2026.10.20",), ["options_version"]),
        (("Stop ignoring Some Game",), ["options_allow_restore_label"]),
        (("Version",), []),
        (("Versions of 3",), []),
        # A template expression stands for a placeholder
        (("Version ", ""), ["options_version"]),
        (("Stop ignoring ", ""), ["options_allow_restore_label"]),
        (("", "Undo", " now"), ["banner_undo"]),
        (("", " is ", ""), []),
        (("Versions ", ""), []),
        # Placeholder messages with little static text never match everything
        (("anything at all",), []),
        (("3 ok",), []),
        # Long catalog text matches inside a longer literal, and so does a long piece of it
        (("<p>In the developer's own words: <b>x</b></p>",), ["banner_source"]),
        (("En palabras del desarrollador: x",), ["banner_source (es)"]),
        (("asks Valve's own store",), ["options_privacy_lookup"]),
        (("own words",), []),
        # A detection constant may repeat a message
        ((HEADING,), []),
        ((f"Tags: {HEADING}, PvP.",), ["ext_description"]),
        # Matching is case-sensitive, and an empty literal never matches
        (("in the developer's own words:",), []),
        (("Banner_Undo",), []),
        (("",), []),
        (("   ",), []),
    )

    # A catalog where a message equals the detection constant.
    HEADING_CATALOGS: Final = {
        "en": catalog(ext_description=f"Tags: {HEADING}, PvP.", banner_heading=HEADING)
    }

    # (file, source): a test file under src and a helper under tests, each with seeded copy.
    REPORTED_FILES: Final = (
        ("src/core/ui/banner.test.ts", 'expect(button.textContent).toBe("Undo");\n'),
        ("tests/helpers/a.ts", 'const a = 1;\nconst b = `Saved.${x}`;\nf("Deshacer");\n'),
    )
    REPORTED: Final = (
        f"src/core/ui/banner.test.ts:1: banner_undo: {HIT}",
        f"tests/helpers/a.ts:2: notice_settings_saved: {HIT}",
        f"tests/helpers/a.ts:3: banner_undo (es): {HIT}",
    )

    HEADING_FILE: Final = "src/core/kinds/ai.ts"
    HEADING_SOURCE: Final = f'const HEADING = "{HEADING}";\n'
    HEADING_COPY_FILE: Final = "src/core/ui/a.ts"
    HEADING_COPY_SOURCE: Final = f'const a = "{HEADING} (copy)";\n'

    COMMENTED_FILE: Final = "src/core/settings.ts"
    COMMENTED_SOURCE: Final = (
        '// Undo the change. Saved.\ntype Settings = { parseSettings: () => "kept" };\n'
    )

    SEEDED_SOURCE: Final = 'export const text = "Undo";\n'
    SKIPPED_FILES: Final = (
        "src/core/i18n/keys.gen.ts",
        "tests/locales/keys.gen.ts",
        "tests/locales/messages.ts",
        "tests/fixtures/page.ts",
        "docs/design/previews/a.ts",
    )
    SOURCE_CATALOG_FILE: Final = "src/locales/en/messages.json"
    SOURCE_CATALOG: Final = '{"banner_undo": {"message": "Undo"}}'

    EMPTY_MODULE: Final = "export {};\n"
    SCANNED_FILES: Final = ("src/a.ts", "src/deep/b.mts", "tests/c.test.ts", "tests/helpers/d.d.ts")
    UNSCANNED_FILE: Final = "src/notes.md"


class TsLiterals:
    """TypeScript sources and the literals ts_literals.py reads from them."""

    # (source, the parts of every literal, flat): quotes, escapes and empty strings.
    QUOTED: Final[tuple[tuple[str, list[str]], ...]] = (
        ("""a("one", 'two');""", ["one", "two"]),
        ("""x = "it's"; y = 'say "hi"';""", ["it's", 'say "hi"']),
        (
            r"""x = ["a\"b", 'c\'d', "e\nf", "\u00e1", "\u{1F600}", "\x41", "g\
h", "\q"];""",
            ['a"b', "c'd", "e\nf", "\u00e1", "\U0001f600", "A", "gh", "q"],
        ),
        ('const url = "https://example.test/a";', ["https://example.test/a"]),
        ("""a("", '');""", ["", ""]),
    )

    # (source, the parts of every literal, flat): comments, regex literals, division and names.
    SKIPPED: Final[tuple[tuple[str, list[str]], ...]] = (
        (
            """// it's "quoted"
/* 'block'
   "comment" */
const real = "kept";""",
            ["kept"],
        ),
        ("""const a = /["']/g; const b = x.replace(/`/, "ok"); if (/'/.test(s)) {}""", ["ok"]),
        ("""const a = /[/"]/; const b = "x";""", ["x"]),
        ("""const half = total / 2; const s = "after";""", ["after"]),
        ("""const r = (a + b) / 2 + "x" / 3;""", ["x"]),
        (
            """type Settings = { parseSettings: () => void };
function openSettingsDialog(): Settings { return create(); }""",
            [],
        ),
    )

    # (source, literals): a template is one literal with a part per static chunk.
    TEMPLATES: Final[tuple[tuple[str, list[Literal]], ...]] = (
        ("`Version ${version} of ${name}.`", [Literal(1, ("Version ", " of ", "."))]),
        ("`plain`", [Literal(1, ("plain",))]),
        (
            'x = `a${"b"}c${`d${e}f`}g`;',
            [Literal(1, ("b",)), Literal(1, ("d", "f")), Literal(1, ("a", "c", "g"))],
        ),
        (
            "x = `a${fn({ k: 1 })}b`; y = 'after';",
            [Literal(1, ("a", "b")), Literal(1, ("after",))],
        ),
        (r"x = `a\`b\${c}\n`;", [Literal(1, ("a`b${c}\n",))]),
    )

    LINES: Final = """const a = 1;
/* two
   lines */
const b = "here";
const c = `
  multi ${d} line
`;"""
    LINE_LITERALS: Final = [Literal(4, ("here",)), Literal(5, ("\n  multi ", " line\n"))]


class BundleKeys:
    """Catalog keys and bundle code for bundle_keys.py."""

    ENGLISH: Final = keyed_catalog(
        "banner_undo", "options_title", "notice_hidden_one", "notice_hidden_other"
    )
    NAMES: Final = {"banner_undo", "options_title", "notice_hidden"}
    PLURAL_BASES: Final = {"notice_hidden"}
    # (key, the name it goes by among PLURAL_BASES)
    NAMED: Final = (("notice_hidden_few", "notice_hidden"), ("banner_undo", "banner_undo"))

    @staticmethod
    def bundle(*code: str, entries: tuple[str, ...] = ()) -> str:
        """Bundle text as esbuild prints it: code lines, then an inlined catalog with `entries`."""
        lines = [*code, "  var CATALOGS = {", '    "en": {']
        lines += [f'      "{key}": {{ message: "Text for {key}" }},' for key in entries]
        lines += ["    }", "  };"]
        return "\n".join(lines)

    @classmethod
    def read(cls) -> tuple[tuple[str, set[str]], ...]:
        """(bundle, names read): key and plural base literals count; entries and comments not."""
        return (
            (
                cls.bundle('i18n.t("banner_undo");', "i18n.plural('notice_hidden', n);"),
                {"banner_undo", "notice_hidden"},
            ),
            (
                cls.bundle(
                    '// i18n.t("options_title")',
                    'el.className = "options_title_row";',
                    entries=("banner_undo", "options_title"),
                ),
                set(),
            ),
        )

    @classmethod
    def carried(cls) -> tuple[str, set[str]]:
        """A bundle with inlined catalog entries, and their keys."""
        entries = ("banner_undo", "notice_hidden_one")
        return cls.bundle('i18n.t("banner_undo");', entries=entries), set(entries)

    @classmethod
    def computed(cls) -> tuple[str, list[str]]:
        """A bundle with templates that start keys, and their shapes."""
        script = cls.bundle("i18n.t(`options_${part}`);", "i18n.t(`banner_${a}_${b}`);")
        return script, ["options_${}", "banner_${}_${}"]

    # Templates that start no key.
    UNKEYED_TEMPLATES: Final = ("`${base}_other`", "`tks-${name}`", "`options`", "`kind_${id}`")


class Cws:
    """Publisher, item and archive for cws.py."""

    PUBLISHER: Final = "pub"
    EXTENSION: Final = "ext"
    ITEM: Final = f"publishers/{PUBLISHER}/items/{EXTENSION}"
    ARCHIVE_NAME: Final = "chrome.zip"
    ARCHIVE: Final = b"zip-bytes"


class Notes:
    """Release notes for notes.py."""

    FOOTER: Final = "Full notes: https://example.test/releases/tag/1"
    SHORT: Final = "### Added\n- One."
    LONG_LINE_PREFIX: Final = "- Item "
    LONG: Final = "### Added\n" + "\n".join(f"- Item {n} " + "x" * 200 for n in range(40))
    TRAILING_HEADING: Final = "### Changed"
    WITH_TRAILING_HEADING: Final = "### Added\n- " + "a" * 40 + "\n### Changed\n- " + "b" * 3000
    TRAILING_HEADING_LIMIT: Final = 120
    ONE_LONG_LINE: Final = "### Added\n- " + "c" * 500
    ONE_LONG_LINE_LIMIT: Final = 200
    CUT_LINE_END: Final = "c...\n"


def write_tree(root: Path, files: dict[str, str]) -> None:
    """Writes each file under the root; a `.zip` name becomes a deflated archive of one member."""
    for name, text in files.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.suffix == ".zip":
            with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("member.txt", text)
        else:
            path.write_text(text, encoding="utf-8")


def userscript_header(*extra: str, noframes: bool = True) -> str:
    """A userscript header whose fixed fields all pass, with these lines added."""
    fields = [
        f"// {key} {value}" for key, values in fixed_header_fields().items() for value in values
    ]
    frames = ["// @noframes"] if noframes else []
    return "\n".join([HEADER_START, *fields, *frames, *extra, HEADER_END]) + "\n"


def catalog_json(**messages: str) -> str:
    """A catalog file of these messages by key, each with a description that breaks rule 4."""
    return json.dumps(
        {
            key: {"message": message, "description": "Never call a game slop."}
            for key, message in messages.items()
        }
    )


class CheckBundle:
    """Manifests, bundles and secrets for the gates of check_bundle.py."""

    CONTENT: Final = "dist/chromium/content.js"
    OPTIONS: Final = "dist/gecko/options.js"
    BACKGROUND_JS: Final = "dist/chromium/background.js"
    DEV: Final = "dist/dev/inject.js"
    USERSCRIPT_META: Final = f"dist/userscript/{SLUG}.meta.js"
    STORE_SCRIPT: Final[dict[str, object]] = {"matches": STORE_MATCH, "js": ["content.js"]}
    # The keys every target's manifest needs, and the ones of each target.
    SHARED: Final[dict[str, object]] = {
        "permissions": ["storage"],
        "action": {"default_icon": OFF_ICONS},
        "content_scripts": [STORE_SCRIPT],
    }
    OWN: Final[dict[str, dict[str, object]]] = {
        "chromium": {"background": BACKGROUND["chromium"]},
        "gecko": {"background": BACKGROUND["gecko"], "browser_specific_settings": {}},
    }

    @classmethod
    def manifest(cls, target: str, overrides: dict[str, object]) -> dict[str, object]:
        """A manifest that passes every shape rule for its target; a None override drops a key."""
        merged = {**cls.SHARED, **cls.OWN[target], **overrides}
        return {key: value for key, value in merged.items() if value is not None}

    # (target, overrides, problems after the manifest path): keys outside the allowlist in sorted
    # order, the permissions, the content script's world and matches, the background script, the
    # action icon and the Gecko settings both ways.
    MANIFESTS: Final[tuple[tuple[str, dict[str, object], tuple[str, ...]], ...]] = (
        ("chromium", {}, ()),
        ("gecko", {}, ()),
        (
            "chromium",
            {
                "web_accessible_resources": [{"resources": ["icons/*"], "matches": STORE_MATCH}],
                "host_permissions": STORE_MATCH,
                "externally_connectable": {"matches": STORE_MATCH},
                "content_security_policy": {},
            },
            (
                "content_security_policy is not allowed",
                "externally_connectable is not allowed",
                "host_permissions is not allowed",
                "web_accessible_resources is not allowed",
            ),
        ),
        (
            "gecko",
            {"permissions": ["storage", "tabs"]},
            ('permissions must be exactly ["storage"]',),
        ),
        (
            "chromium",
            {"content_scripts": [{**STORE_SCRIPT, "world": "MAIN"}]},
            ("content scripts must run in the isolated world",),
        ),
        ("gecko", {"content_scripts": [{**STORE_SCRIPT, "world": "ISOLATED"}]}, ()),
        (
            "chromium",
            {"content_scripts": [{**STORE_SCRIPT, "matches": ["<all_urls>"]}]},
            (f"content script matches must be {STORE_MATCH}",),
        ),
        ("gecko", {"content_scripts": []}, ("content_scripts is missing",)),
        (
            "chromium",
            {"background": BACKGROUND["gecko"]},
            (f"background must be exactly {BACKGROUND['chromium']}",),
        ),
        ("gecko", {"action": {}}, (f"the action's default_icon must be {OFF_ICONS}",)),
        (
            "chromium",
            {"browser_specific_settings": {}},
            ("browser_specific_settings is not allowed",),
        ),
        ("gecko", {"browser_specific_settings": None}, ("browser_specific_settings is missing",)),
    )

    STORE_FETCH: Final = (
        'fetch("https://api.steampowered.com/IStoreBrowseService/GetItems/v1");'
        'fetch("https://store.steampowered.com/app/1");'
    )
    COOKIE: Final = "writes a cookie"
    PAGE_CODE: Final = "builds a <script>, markup or an inline handler"
    REMOTE_CODE: Final = "runs code from a string"
    GITHUB: Final = "URL to a host outside the allowlist: github.com"

    # (bundle path, text, isolated, problems after the path): each form of remote code, cookie
    # write and page code, hosts and the settings links, and userscript headers.
    SCRIPTS: Final[tuple[tuple[str, str, bool, tuple[str, ...]], ...]] = (
        (CONTENT, STORE_FETCH, True, ()),
        (CONTENT, "eval(code);", True, (REMOTE_CODE,)),
        (CONTENT, "(0, eval)(code);", True, (REMOTE_CODE,)),
        (CONTENT, "new Function(code);", True, (REMOTE_CODE,)),
        (CONTENT, "Function(code)();", True, (REMOTE_CODE,)),
        (DEV, 'setTimeout("run()", 1);', False, (REMOTE_CODE,)),
        (CONTENT, "setTimeout(run, 1); isFunction(x); evaluate(x);", True, ()),
        (CONTENT, 'document.cookie = "a=1";', True, (COOKIE,)),
        (OPTIONS, 'document.cookie+="a=1";', True, (COOKIE,)),
        (CONTENT, 'document["cookie"] ??= "a=1";', True, (COOKIE,)),
        (DEV, 'cookieStore.set("a", "1");', False, (COOKIE,)),
        (CONTENT, "cookieStore?.delete(name);", True, (COOKIE,)),
        (CONTENT, "const jar = document.cookie; if (document.cookie == jar) {}", True, ()),
        (CONTENT, 'document.createElement("script");', True, (PAGE_CODE,)),
        (OPTIONS, "document.createElementNS(ns, 'SCRIPT');", True, (PAGE_CODE,)),
        (CONTENT, "range.createContextualFragment(html);", True, (PAGE_CODE,)),
        (CONTENT, 'node.insertAdjacentHTML("beforeend", html);', True, (PAGE_CODE,)),
        (CONTENT, "node.innerHTML = html;", True, (PAGE_CODE,)),
        (CONTENT, 'node.setAttribute("onclick", code);', True, (PAGE_CODE,)),
        (DEV, 'document.createElement("script"); node.innerHTML = html;', False, ()),
        (CONTENT, 'document.createElement("div"); const html = node.innerHTML;', True, ()),
        (
            CONTENT,
            'fetch("https://example.com/x");',
            True,
            ("URL to a host outside the allowlist: example.com",),
        ),
        (
            CONTENT,
            'new WebSocket("wss://example.com");',
            True,
            ("URL to a host outside the allowlist: example.com",),
        ),
        (OPTIONS, "".join(SETTINGS_LINKS), True, ()),
        (CONTENT, SETTINGS_LINKS[0], True, (GITHUB,)),
        (BACKGROUND_JS, SETTINGS_LINKS[0], True, (GITHUB,)),
        (OPTIONS, SETTINGS_LINKS[-1].replace('/"', '/evil"'), True, (GITHUB,)),
        (
            OPTIONS,
            SETTINGS_LINKS[2].replace('"', "", 1),
            True,
            ("URL to a host outside the allowlist: forms.gle",),
        ),
        (
            CONTENT,
            userscript_header(),
            True,
            ("a userscript header belongs in the userscript only",),
        ),
        (USERSCRIPT_META, "", False, ("the userscript header is missing",)),
        (USERSCRIPT_META, userscript_header(), False, ()),
        (
            USERSCRIPT_META,
            userscript_header("// @connect example.com"),
            False,
            ("@connect is not allowed",),
        ),
        (
            USERSCRIPT_META,
            userscript_header("// @match https://example.com/*"),
            False,
            (f"@match must be {STORE_MATCH}",),
        ),
        (USERSCRIPT_META, userscript_header(noframes=False), False, ("@noframes is missing",)),
    )

    PLANTED_KEY: Final = "fake-steam-api-key-0123"
    # (STEAM_API_KEY value, files by path, the files that hold it, in path order): a value under 8
    # characters checks nothing, and a zip archive is searched member by member.
    SECRETS: Final[tuple[tuple[str, dict[str, str], tuple[str, ...]], ...]] = (
        ("1234567", {"content.js": "1234567"}, ()),
        ("12345678", {"content.js": "x12345678x"}, ("content.js",)),
        (
            PLANTED_KEY,
            {
                "content.js": PLANTED_KEY,
                "gecko/options.js": "nothing",
                "gecko/source.zip": PLANTED_KEY,
            },
            ("content.js", "gecko/source.zip"),
        ),
    )


class CheckWording:
    """Phrases and repo files for the wording guard of check_wording.py."""

    # (text, forbidden phrases found): each phrase in any case and both languages; Steam's AI
    # headings and the names of other projects pass, a claim before a heading does not, and a
    # phrase inside a longer word is no phrase.
    HITS: Final[tuple[tuple[str, list[str]], ...]] = (
        ("This game uses AI.", ["uses AI"]),
        ("AI-free!", ["AI-free"]),
        ("Contains no AI", ["no AI"]),
        ("More AI slop", ["slop"]),
        ("A Clean store", ["Clean"]),
        ("Made by humans, for a human", ["humans", "human"]),
        ("human-made", ["human"]),
        ("It has AI-generated content", ["AI-generated content"]),
        ("ai generated content", ["ai generated content"]),
        ("AI Generated Content Disclosure", []),
        ("No AI Generated Content Disclosure", ["No AI"]),
        ("AI Generated Content Filter for Steam and Slop-Inator", []),
        ("cleaning, sloppy, humane, piano AI", []),
        ("Este juego usa IA, sin IA", ["usa IA", "sin IA"]),
        ("Libre de IA y limpio, hecho por humanos", ["Libre de IA", "limpio", "humanos"]),
        ("Tiene contenido generado por IA", ["contenido generado por IA"]),
        ("Informaci\u00f3n sobre contenido generado por IA", []),
    )

    # Files under a repo root: the catalogs, README.md and the store copy's text files are
    # scanned; a binary store file, other docs and catalog descriptions are not.
    FILES: Final[dict[str, str]] = {
        "src/locales/en/messages.json": catalog_json(kind_ai_chip="AI", kind_ai_line="No AI here"),
        "tests/locales/xx/messages.json": catalog_json(banner_undo="It uses AI"),
        "README.md": "# Tag Kit\nA clean store.\n",
        "docs/store/listing.mdx": "Made by humans.\n",
        "docs/store/assets/graphics.css": ".chip { color: red; }\n/* AI-generated content */\n",
        "docs/store/assets/tile.png": "\0slop",
        "docs/adr/0001-example.mdx": "slop",
    }
    PROBLEMS: Final = (
        "src/locales/en/messages.json: kind_ai_line: forbidden wording 'No AI' (rule 4)",
        "tests/locales/xx/messages.json: banner_undo: forbidden wording 'uses AI' (rule 4)",
        "README.md:2: forbidden wording 'clean' (rule 4)",
        "docs/store/assets/graphics.css:2: forbidden wording 'AI-generated content' (rule 4)",
        "docs/store/listing.mdx:1: forbidden wording 'humans' (rule 4)",
    )
