from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import run


class BootstrapDependencyTest(unittest.TestCase):
    def test_reuses_complete_bootstrap_directory(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            marker = Path("single_include") / "nlohmann" / "json.hpp"
            temporary = root / "json.bootstrap"
            destination = root / "json"
            (temporary / marker).parent.mkdir(parents=True)
            (temporary / marker).write_text("header", encoding="utf-8")

            with (
                patch.object(run, "find_git", return_value=Path("git")),
                patch.object(run, "run_checked") as run_checked,
            ):
                run.clone_with_fallback(
                    "nlohmann/json",
                    destination,
                    marker,
                    "https://example.invalid/gitee.git",
                    "https://example.invalid/github.git",
                )

            run_checked.assert_not_called()
            self.assertTrue((destination / marker).is_file())
            self.assertFalse(temporary.exists())

    def test_copies_when_windows_directory_replace_is_denied(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "json.bootstrap"
            destination = root / "json"
            marker = source / "single_include" / "nlohmann" / "json.hpp"
            marker.parent.mkdir(parents=True)
            marker.write_text("header", encoding="utf-8")

            with patch.object(
                run.os,
                "replace",
                side_effect=PermissionError(5, "Access is denied"),
            ):
                run.install_dependency_tree(source, destination)

            self.assertEqual(
                (destination / "single_include" / "nlohmann" / "json.hpp").read_text(
                    encoding="utf-8"
                ),
                "header",
            )
            self.assertFalse(source.exists())


if __name__ == "__main__":
    unittest.main()
