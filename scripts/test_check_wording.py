"""Unit tests for the wording guard of check_wording.py (run by `mise run release:test`)."""

import tempfile
import unittest
from pathlib import Path

from check_wording import hits, wording_problems
from testdata import CheckWording, write_tree


class HitsTest(unittest.TestCase):
    def test_finds_each_forbidden_phrase_outside_quoted_names(self) -> None:
        for text, expected in CheckWording.HITS:
            with self.subTest(text=text):
                self.assertEqual(hits(text), expected)


class ScanTest(unittest.TestCase):
    def test_scans_catalog_messages_the_readme_and_the_store_copy(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            write_tree(root, CheckWording.FILES)
            self.assertEqual(wording_problems(root), list(CheckWording.PROBLEMS))


if __name__ == "__main__":
    unittest.main()
