"""Exercise report publication against disposable local Git remotes.

Run with: python3 -m unittest discover -s tests -v
"""

import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "publish-digest.sh"


class PublishDigestTests(unittest.TestCase):
    def git(self, directory, *args):
        return subprocess.run(
            ["git", "-C", str(directory), *args],
            check=True, capture_output=True, text=True,
        ).stdout.strip()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="repo-digest-publish-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.remote = self.root / "remote.git"
        self.git(self.root, "init", "--bare", "--initial-branch=main", str(self.remote))
        seed = self.root / "seed"
        self.git(self.root, "init", "--initial-branch=main", str(seed))
        self.git(seed, "config", "user.name", "Test Author")
        self.git(seed, "config", "user.email", "test@example.com")
        (seed / "README.md").write_text("Source repository, not a report.\n")
        self.git(seed, "add", "README.md")
        self.git(seed, "commit", "-m", "Initial source commit")
        self.git(seed, "remote", "add", "origin", str(self.remote))
        self.git(seed, "push", "origin", "main")
        self.main_commit = self.git(self.remote, "rev-parse", "main")
        self.artifacts = self.root / "downloaded"
        self.artifacts.mkdir()
        self.report = self.artifacts / "digest-2026-10-28.md"
        self.report.write_text("# verl Daily Digest - 2026-10-28\n\nA training fix.\n")
        self.summary = self.root / "summary.md"

    def checkout(self):
        checkout = Path(tempfile.mkdtemp(prefix="checkout-", dir=self.root))
        self.git(self.root, "clone", str(self.remote), str(checkout))
        return checkout

    def publish(self, checkout=None, check=True, project="verl"):
        checkout = checkout or self.checkout()
        return subprocess.run(
            ["bash", str(SCRIPT), str(self.artifacts), str(checkout), project],
            env={
                **os.environ,
                "GITHUB_STEP_SUMMARY": str(self.summary),
                "GITHUB_REPOSITORY": "example/repo-digest",
                "GITHUB_SERVER_URL": "https://github.com",
                "GIT_TERMINAL_PROMPT": "0",
            },
            capture_output=True, text=True, check=check,
        )

    def test_first_publication_isolated_from_main_and_readable_in_summary(self):
        self.publish()
        files = self.git(self.remote, "ls-tree", "-r", "--name-only", "digest-reports")
        self.assertEqual(files.splitlines(), [
            "reports/verl/2026-10-28.md", "reports/verl/latest.md",
        ])
        for name in ("2026-10-28.md", "latest.md"):
            self.assertEqual(
                self.git(self.remote, "show", f"digest-reports:reports/verl/{name}"),
                self.report.read_text().strip(),
            )
        self.assertEqual(self.git(self.remote, "rev-parse", "main"), self.main_commit)
        self.assertIn(self.report.read_text(), self.summary.read_text())
        self.assertIn(
            "https://github.com/example/repo-digest/blob/digest-reports/reports/verl/latest.md",
            self.summary.read_text(),
        )

    def test_identical_rerun_does_not_create_a_commit(self):
        self.publish()
        first = self.git(self.remote, "rev-parse", "digest-reports")
        self.publish()
        self.assertEqual(self.git(self.remote, "rev-parse", "digest-reports"), first)

    def test_next_day_preserves_history_and_other_projects(self):
        self.publish()
        self.publish(project="other")
        old_report = self.report.read_text().strip()
        self.report.unlink()
        self.report = self.artifacts / "digest-2026-10-29.md"
        self.report.write_text("# verl Daily Digest - 2026-10-29\n\nA rollout fix.\n")
        self.publish()
        self.assertEqual(
            self.git(self.remote, "show", "digest-reports:reports/verl/2026-10-28.md"),
            old_report,
        )
        self.assertEqual(
            self.git(self.remote, "show", "digest-reports:reports/other/latest.md"),
            old_report,
        )
        self.assertEqual(
            self.git(self.remote, "show", "digest-reports:reports/verl/latest.md"),
            self.report.read_text().strip(),
        )

    def test_missing_empty_or_ambiguous_artifacts_fail_without_publishing(self):
        self.report.unlink()
        self.assertNotEqual(self.publish(check=False).returncode, 0)
        self.report.touch()
        self.assertNotEqual(self.publish(check=False).returncode, 0)
        self.report.write_text("A report\n")
        (self.artifacts / "digest-2026-10-29.md").write_text("Another report\n")
        self.assertNotEqual(self.publish(check=False).returncode, 0)
        self.assertEqual(self.git(self.remote, "branch", "--list"), "* main")

    def test_dirty_checkout_is_not_switched_or_published(self):
        checkout = self.checkout()
        (checkout / "README.md").write_text("Uncommitted work\n")
        result = self.publish(checkout, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("clean, disposable checkout", result.stderr)
        self.assertEqual((checkout / "README.md").read_text(), "Uncommitted work\n")
        self.assertEqual(self.git(checkout, "branch", "--show-current"), "main")

    def test_remote_lookup_failure_does_not_create_a_branch(self):
        checkout = self.checkout()
        self.git(checkout, "remote", "set-url", "origin", str(self.root / "missing.git"))
        self.assertNotEqual(self.publish(checkout, check=False).returncode, 0)
        self.assertEqual(self.git(checkout, "branch", "--show-current"), "main")

    def test_rejected_push_fails_but_report_remains_in_run_summary(self):
        hook = self.remote / "hooks" / "pre-receive"
        hook.write_text("#!/bin/sh\nexit 1\n")
        hook.chmod(0o755)
        self.assertNotEqual(self.publish(check=False).returncode, 0)
        self.assertEqual(self.git(self.remote, "branch", "--list"), "* main")
        self.assertIn(self.report.read_text(), self.summary.read_text())
        self.assertNotIn("[Latest report]", self.summary.read_text())


if __name__ == "__main__":
    unittest.main()
