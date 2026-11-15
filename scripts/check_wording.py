"""Check our wording against rule 4 (AGENTS.md): we report what Steam and developers say, and we
never judge a game.

The messages of every catalog (src/locales/ and tests/locales/), README.md and every text file of
the store copy under docs/store/ must not use these phrases, in any case:
- English: "uses AI", "AI-free", "no AI", "slop", "clean", "human" and "AI-generated content";
- Spanish: "usa IA", "sin IA", "libre de IA", "basura", "limpio", "humano" and "contenido
  generado por IA".
Steam's own AI headings ("AI Generated Content Disclosure" and its Spanish form) are the one
context where the content phrase may stand, and the names of other projects that the README
credits are quoted words. Catalog descriptions are notes for translators and are not scanned.

tests/catalog-wording.test.ts owns the other rule 4 wording check, a tag's absence stated as a
claim ("no" and a tag's name, "none", "<tag>-free"), because it reads the tag registry.

Usage: check_wording.py
"""

import re
from pathlib import Path

from catalogs import SHIPPED_DIR, TEST_DIR, load
from repo import ROOT, fail

FORBIDDEN = re.compile(
    r"\b(?:uses AI|AI-free|no AI|slop|clean|humans?|AI[- ]generated content(?! Disclosure)"
    r"|usa IA|sin IA|libre de IA|basura|limpi[oa]s?|human[oa]s?"
    r"|(?<!Informaci\u00f3n sobre )contenido generado por IA)\b",
    re.IGNORECASE,
)
# Names of other projects, quoted as their authors wrote them (README, prior art).
OTHER_NAMES = ("AI Generated Content Filter for Steam", "Slop-Inator")
CATALOGS = tuple(f"{folder}/*/messages.json" for folder in (SHIPPED_DIR, TEST_DIR))
README = "README.md"
STORE_COPY = "docs/store"


def hits(text: str) -> list[str]:
    """The forbidden phrases in a text, once the quoted names are removed."""
    for name in OTHER_NAMES:
        text = text.replace(name, "")
    return FORBIDDEN.findall(text)


def catalog_problems(root: Path) -> list[str]:
    problems: list[str] = []
    for pattern in CATALOGS:
        for path in sorted(root.glob(pattern)):
            where = path.relative_to(root).as_posix()
            problems += [
                f"{where}: {key}: forbidden wording {hit!r} (rule 4)"
                for key, entry in load(path).items()
                for hit in hits(entry.message)
            ]
    return problems


def text_of(path: Path) -> str | None:
    """A file's text, or None for a binary file such as a screenshot."""
    raw = path.read_bytes()
    try:
        return None if b"\0" in raw else raw.decode("utf-8")
    except UnicodeDecodeError:
        return None


def prose_problems(root: Path) -> list[str]:
    """README.md and the store copy, line by line."""
    store = sorted(path for path in (root / STORE_COPY).rglob("*") if path.is_file())
    problems: list[str] = []
    for path in [root / README, *store]:
        text = text_of(path) if path.is_file() else None
        lines = text.splitlines() if text is not None else []
        where = path.relative_to(root).as_posix()
        problems += [
            f"{where}:{number}: forbidden wording {hit!r} (rule 4)"
            for number, line in enumerate(lines, start=1)
            for hit in hits(line)
        ]
    return problems


def wording_problems(root: Path) -> list[str]:
    return catalog_problems(root) + prose_problems(root)


def main() -> None:
    problems = wording_problems(ROOT)
    if problems:
        print("\n".join(problems))
        fail(f"{len(problems)} wording problem(s)")


if __name__ == "__main__":
    main()
