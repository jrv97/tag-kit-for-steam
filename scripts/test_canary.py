"""Unit tests for canary.py's page checks (run by `mise run release:test`)."""

import unittest

from canary import PageScan, heading_problems
from testdata import Canary


class HeadingTest(unittest.TestCase):
    def test_a_problem_only_when_the_page_and_getitems_disagree(self) -> None:
        for page, declared, disagree in Canary.HEADING_CASES:
            with self.subTest(page=page, declared=declared):
                scan = PageScan()
                scan.feed(page)
                problems = heading_problems(Canary.WHERE, scan, declared=declared)
                self.assertEqual(len(problems), int(disagree))


if __name__ == "__main__":
    unittest.main()
