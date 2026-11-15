"""Check our wording against rule 4 (AGENTS.md): we report what Steam and developers say, and we
never judge a game.

The messages of every catalog (src/locales/ and tests/locales/), README.md and the store copy
under docs/store/ must not say "uses AI", "AI-free", "no AI", "slop", "clean", "human" or
"AI-generated content". Catalog descriptions are notes for translators and are not scanned.
Quoted names are removed before matching: Steam's own heading (DETECTION_CONSTANTS) and the names
of other projects that the README credits.

Usage: check_wording.py
"""

import re
from pathlib import Path

from catalogs import load
from check_i18n import DETECTION_CONSTANTS
from repo import ROOT, fail

FORBIDDEN = re.compile(
    r"\b(?:uses AI|AI-free|no AI|slop|clean|humans?|AI[- ]generated content)\b", re.IGNORECASE
)
# Names of other projects, quoted as their authors wrote them (README, prior art).
OTHER_NAMES = frozenset({"AI Generated Content Filter for Steam", "Slop-Inator"})
QUOTED = DETECTION_CONSTANTS | OTHER_NAMES
CATALOGS = ("src/locales/*/messages.json", "tests/locales/*/messages.json")
README = "README.md"
STORE_COPY = "docs/store"
COPY_SUFFIXES = {".md", ".mdx", ".html", ".json", ".txt"}


def hits(text: str) -> list[str]:
    """The forbidden phrases in a text, once the quoted names are removed."""
    for quoted in QUOTED:
        text = text.replace(quoted, "")
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


def copy_files(root: Path) -> list[Path]:
    """README.md and the text files of the store copy."""
    store = sorted(
        path
        for path in (root / STORE_COPY).rglob("*")
        if path.is_file() and path.suffix in COPY_SUFFIXES
    )
    return [path for path in [root / README, *store] if path.is_file()]


def copy_problems(root: Path) -> list[str]:
    problems: list[str] = []
    for path in copy_files(root):
        where = path.relative_to(root).as_posix()
        lines = path.read_text(encoding="utf-8").splitlines()
        problems += [
            f"{where}:{number}: forbidden wording {hit!r} (rule 4)"
            for number, line in enumerate(lines, start=1)
            for hit in hits(line)
        ]
    return problems


def wording_problems(root: Path) -> list[str]:
    return catalog_problems(root) + copy_problems(root)


def main() -> None:
    problems = wording_problems(ROOT)
    if problems:
        print("\n".join(problems))
        fail(f"{len(problems)} wording problem(s)")


if __name__ == "__main__":
    main()
