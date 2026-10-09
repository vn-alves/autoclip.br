"""Release-version regression checks; run with python3 scripts/test_desktop_version.py."""

import ast
import json
from pathlib import Path
import tomllib
import unittest

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_VERSION = "2.0.7"


def read_json(path):
    return json.loads((ROOT / path).read_text())


class DesktopVersionTests(unittest.TestCase):
    def test_installer_and_rust_versions(self):
        config = read_json("src-tauri/tauri.conf.json")
        windows = read_json("src-tauri/tauri.windows.conf.json")
        self.assertEqual(config["version"], EXPECTED_VERSION)
        self.assertEqual({**config, **windows}["version"], EXPECTED_VERSION)
        cargo = tomllib.loads((ROOT / "src-tauri/Cargo.toml").read_text())
        self.assertEqual(cargo["package"]["version"], EXPECTED_VERSION)
        lock = tomllib.loads((ROOT / "src-tauri/Cargo.lock").read_text())
        package = next(p for p in lock["package"] if p["name"] == "autoclip-desktop")
        self.assertEqual(package["version"], EXPECTED_VERSION)

    def test_frontend_and_desktop_package_versions(self):
        for folder in ("frontend", "src-tauri"):
            with self.subTest(folder=folder):
                self.assertEqual(read_json(f"{folder}/package.json")["version"], EXPECTED_VERSION)
                lock = read_json(f"{folder}/package-lock.json")
                self.assertEqual(lock["version"], EXPECTED_VERSION)
                self.assertEqual(lock["packages"][""]["version"], EXPECTED_VERSION)

    def test_backend_version_default_and_override(self):
        tree = ast.parse((ROOT / "backend/core/desktop_config.py").read_text())
        getter = next(n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == "app_version")
        return_node = next(n for n in getter.body if isinstance(n, ast.Return))
        expression = ast.Expression(body=return_node.value)
        import os
        from unittest.mock import patch

        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(eval(compile(expression, "desktop_config.py", "eval"), {"os": os}), EXPECTED_VERSION)
        with patch.dict(os.environ, {"AUTOCLIP_APP_VERSION": "9.8.7"}):
            self.assertEqual(eval(compile(expression, "desktop_config.py", "eval"), {"os": os}), "9.8.7")


if __name__ == "__main__":
    unittest.main()