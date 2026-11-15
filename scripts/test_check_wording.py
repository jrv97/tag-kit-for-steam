"""Unit tests for the wording guard of check_wording.py (run by `mise run release:test`)."""

import tempfile
import unittest
from pathlib import Path

from check_wording import hits, wording_problems
from testdata import CheckWording


class HitsTest(unittest.TestCase):
    def test_finds_each_forbidden_phrase_outside_quoted_names(self) -> None:
        for text, expected in CheckWording.HITS:
            with self.subTest(text=text):
                self.assertEqual(hits(text), expected)


class ScanTest(unittest.TestCase):
    def test_scans_catalog_messages_the_readme_and_the_store_copy(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name, text in CheckWording.FILES.items():
                (root / name).parent.mkdir(parents=True, exist_ok=True)
                (root / name).write_text(text, encoding="utf-8")
            self.assertEqual(wording_problems(root), list(CheckWording.PROBLEMS))


if __name__ == "__main__":
    unittest.main()
