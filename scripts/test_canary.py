"""Unit tests for canary.py's page checks (run by `mise run release:test`)."""

import unittest

from canary import PageScan, heading_problems
from testdata import Canary


class HeadingTest(unittest.TestCase):
    def test_a_problem_only_when_the_page_and_getitems_disagree(self) -> None:
        for case, page, declared, expected in Canary.HEADING_CASES:
            with self.subTest(case):
                scan = PageScan()
                scan.feed(page)
                problems = heading_problems(Canary.WHERE, scan, declared=declared)
                self.assertEqual(len(problems), expected)


if __name__ == "__main__":
    unittest.main()
