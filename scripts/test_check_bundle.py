"""Unit tests for the gates of check_bundle.py (run by `mise run release:test`)."""

import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from check_bundle import manifest_shape_problems, script_problems, secret_problems
from testdata import CheckBundle


class ManifestTest(unittest.TestCase):
    def test_reports_each_key_and_value_the_rules_forbid(self) -> None:
        for target, overrides, expected in CheckBundle.MANIFESTS:
            with self.subTest(target=target, overrides=overrides):
                manifest = CheckBundle.manifest(target, overrides)
                where = f"dist/{target}/manifest.json"
                self.assertEqual(
                    manifest_shape_problems(target, manifest), [f"{where}: {p}" for p in expected]
                )


class ScriptTest(unittest.TestCase):
    def test_reports_remote_code_hosts_cookies_page_world_and_headers(self) -> None:
        for where, text, isolated, expected in CheckBundle.SCRIPTS:
            with self.subTest(where=where, text=text, isolated=isolated):
                self.assertEqual(
                    script_problems(where, text, isolated), [f"{where}: {p}" for p in expected]
                )


class SecretTest(unittest.TestCase):
    def test_reports_each_file_that_holds_the_api_key(self) -> None:
        for secret, files, holders in CheckBundle.SECRETS:
            with (
                self.subTest(files=files),
                tempfile.TemporaryDirectory() as folder,
                mock.patch.dict(os.environ, {"STEAM_API_KEY": secret}),
            ):
                root = Path(folder)
                for name, text in files.items():
                    (root / name).parent.mkdir(parents=True, exist_ok=True)
                    (root / name).write_text(text, encoding="utf-8")
                self.assertEqual(
                    secret_problems([root]),
                    [f"{root / name}: contains the STEAM_API_KEY value" for name in holders],
                )


if __name__ == "__main__":
    unittest.main()
