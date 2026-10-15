import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location("floor", Path(__file__).with_name("security-floor.py"))
assert spec is not None and spec.loader is not None
floor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(floor)
class Floors(unittest.TestCase):
    def test_vulnerable_transitive_optional(self):
        for value in ["next@15.5.27", "next@16.4.0", "sharp@0.35.4", "next@15.5.28-canary.1", "next@14.2.0", "braces@3.0.3", "postcss-selector-parser@6.1.3", "postcss-selector-parser@7.1.5", "stream-json@1.9.1", "stream-json@3.5.0"]:
            with self.subTest(value=value):
                self.assertTrue(floor.check_pnpm("packages:\n  '" + value + "':\n    optional: true\n"))
    def test_override_is_not_a_resolution(self):
        self.assertEqual(floor.check_pnpm("overrides:\n  sharp@<0.35.5: 0.35.5\npackages:\n  sharp@0.35.5: {}\n"), [])
    def test_missing_resolution_section(self):
        self.assertTrue(floor.check_pnpm("lockfileVersion: '9.0'\n"))
    def test_peer_qualified_optional(self):
        self.assertTrue(floor.check_pnpm("snapshots:\n  next@15.5.19(react@19.1.0):\n    optional: true\n"))
    def test_safe(self):
        self.assertEqual(floor.check_pnpm("packages:\n  next@15.5.28: {}\n  next@16.4.1: {}\n  sharp@0.35.5: {}\n  postcss-selector-parser@7.1.6: {}\n  stream-json@3.6.0: {}\n"), [])
    def test_nested_occurrence(self):
        self.assertTrue(floor.check_pnpm("snapshots:\n  next@15.5.28: {}\n  next@15.5.19: {}\n"))
if __name__ == '__main__': unittest.main()
