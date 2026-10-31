"""Test issue filtering and the generator's opt-in handoff without model calls."""

from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
SPEC = importlib.util.spec_from_file_location("collect_issues", SCRIPTS / "collect-issues.py")
collector = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(collector)
REPO_URL = "https://github.com/verl-project/verl"
START = "2026-10-21T13:00:00Z"
END = "2026-10-28T13:00:00Z"


def issue(number, created_at=START, **extra):
    return {
        "number": number, "title": f"Training issue {number}",
        "body": "A reported rollout failure.", "state": "open",
        "user": {"login": "reporter"}, "labels": [{"name": "bug"}],
        "created_at": created_at, "updated_at": END, **extra,
    }


class CollectIssuesTests(unittest.TestCase):
    def collect_pages(self, pages):
        with patch.object(collector.subprocess, "run") as run:
            run.return_value.stdout = json.dumps(pages)
            result = collector.collect(REPO_URL, START, END)
        command = run.call_args.args[0]
        self.assertIn("--paginate", command)
        self.assertIn("--slurp", command)
        self.assertIn("state=all", command)
        self.assertIn("per_page=100", command)
        return result

    def test_all_pages_filter_created_time_exclude_prs_and_deduplicate(self):
        result = self.collect_pages([
            [issue(1), issue(2, "2026-10-20T13:00:00Z"), issue(3, pull_request={})],
            [issue(4, END, state="closed", state_reason="completed"), issue(1)],
            [issue(5, "2026-10-28T13:00:01Z")],
        ])
        self.assertEqual([item["number"] for item in result["issues"]], [1, 4])
        self.assertEqual([item["state"] for item in result["issues"]], ["open", "closed"])
        self.assertEqual(result["issues"][1]["url"], f"{REPO_URL}/issues/4")
        self.assertEqual(result["issues"][0]["labels"], ["bug"])
        self.assertEqual((result["since"], result["until"]), (START, END))

    def test_empty_result_and_null_fields(self):
        self.assertEqual(self.collect_pages([[]])["issues"], [])
        result = self.collect_pages([[issue(1, body=None, user=None)]])
        self.assertEqual(result["issues"][0]["body"], "")
        self.assertIsNone(result["issues"][0]["author"])

    def test_api_failure_is_not_treated_as_no_issues(self):
        failure = subprocess.CalledProcessError(1, ["gh", "api"], stderr="rate limit")
        with patch.object(collector.subprocess, "run", side_effect=failure):
            with self.assertRaises(subprocess.CalledProcessError):
                collector.collect(REPO_URL, START, END)

    def test_invalid_response_is_rejected(self):
        for response in ('{"message":"rate limit"}', '[[{"number":1}]]', "invalid JSON"):
            with self.subTest(response=response):
                with patch.object(collector.subprocess, "run") as run:
                    run.return_value.stdout = response
                    with self.assertRaises((ValueError, KeyError)):
                        collector.collect(REPO_URL, START, END)

    def test_invalid_repository_or_window_does_not_call_api(self):
        for repo, start, end in (
            ("https://example.com/owner/repo", START, END),
            (REPO_URL, END, START),
            (REPO_URL, "2026-10-21T13:00:00", END),
        ):
            with self.subTest(repo=repo, start=start):
                with patch.object(collector.subprocess, "run") as run:
                    with self.assertRaises(ValueError):
                        collector.collect(repo, start, end)
                    run.assert_not_called()


class GenerateDigestIssueTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix="repo-digest-issues-test-")
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.env = {**os.environ, "PATH": f"{self.bin}:{os.environ['PATH']}", "DIGEST_JOBS": "1"}
        self.env.pop("DIGEST_SUMMARY_DIR", None)
        self.repo = self.root / "target"
        self.git("init", "--initial-branch=main", str(self.repo), cwd=self.root)
        self.git("config", "user.name", "Test Author")
        self.git("config", "user.email", "test@example.com")
        self.git("commit", "--allow-empty", "-m", "Old commit", env={
            **self.env, "GIT_AUTHOR_DATE": "2020-01-01T00:00:00Z",
            "GIT_COMMITTER_DATE": "2020-01-01T00:00:00Z",
        })
        self.config = self.root / "project.md"
        self.configure(issues=True)
        self.fixture = self.root / "issues-response.json"
        self.fixture.write_text(json.dumps([[issue(
            42, datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        )]]))
        self.fake_tool("gh", '''from pathlib import Path
Path("gh-called").touch()
print(Path("issues-response.json").read_text())
''')
        # Inspect the compiler's inputs, without pretending to exercise the LLM.
        self.fake_tool("claude", '''import json, os, sys
from pathlib import Path
agent = sys.argv[sys.argv.index("--agent") + 1]
if agent == "analyze-commit":
    print("PRIORITY: medium\\nENTRY:\\n- A training change")
else:
    source = Path("summaries/issues.json")
    Path("compiler-inputs.json").write_text(json.dumps({
        "issues": json.loads(source.read_text()) if source.exists() else None,
        "commits": len(list(Path("summaries").glob("*.md"))),
        "since": os.environ["DIGEST_WINDOW_START"],
        "until": os.environ["DIGEST_WINDOW_END"],
    }))
''')

    def git(self, *args, cwd=None, env=None):
        return subprocess.run(
            ["git", *args], cwd=cwd or self.repo, env=env or self.env,
            capture_output=True, text=True, check=True,
        )

    def configure(self, issues):
        self.config.write_text(
            f"- **path**: {self.repo}\n- **branch**: main\n- **url**: {REPO_URL}\n"
            + ("- **issue_scope**: created\n" if issues else "")
        )

    def fake_tool(self, name, source):
        path = self.bin / name
        path.write_text("#!/usr/bin/env python3\n" + source)
        path.chmod(0o755)

    def generate(self):
        return subprocess.run(
            ["bash", str(SCRIPTS / "generate-digest.sh"), str(self.config), "7"],
            cwd=self.root, env=self.env, capture_output=True, text=True,
        )

    def test_issue_only_window_reaches_compiler_with_shared_window(self):
        result = self.generate()
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads((self.root / "compiler-inputs.json").read_text())
        self.assertEqual(data["commits"], 0)
        self.assertEqual(data["issues"]["issues"][0]["number"], 42)
        self.assertEqual(data["since"], data["issues"]["since"])
        self.assertEqual(data["until"], data["issues"]["until"])
        self.assertEqual(
            (collector.timestamp(data["until"]) - collector.timestamp(data["since"])).days, 7,
        )

    def test_collection_failure_stops_before_compilation(self):
        self.fake_tool("gh", 'import sys\nprint("rate limit", file=sys.stderr)\nsys.exit(1)\n')
        result = self.generate()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Issue collection failed", result.stderr)
        self.assertFalse((self.root / "compiler-inputs.json").exists())
        self.assertFalse((self.root / "summaries/issues.json").exists())

    def test_commits_and_issues_are_handed_off_separately(self):
        self.git("commit", "--allow-empty", "-m", "Recent training change")
        result = self.generate()
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads((self.root / "compiler-inputs.json").read_text())
        self.assertEqual(data["commits"], 1)
        self.assertEqual(len(data["issues"]["issues"]), 1)

    def test_empty_issue_window_is_a_successful_collection(self):
        self.fixture.write_text("[[]]")
        result = self.generate()
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads((self.root / "compiler-inputs.json").read_text())
        self.assertEqual(data["issues"]["issues"], [])

    def test_project_without_opt_in_keeps_commit_analysis_and_skips_issues(self):
        self.configure(issues=False)
        self.git("commit", "--allow-empty", "-m", "Recent training change")
        # A prior run's issues must not leak into a project without issue scope.
        summaries = self.root / "summaries"
        summaries.mkdir()
        (summaries / "issues.json").write_text('{"issues":[{"number":99}]}')
        result = self.generate()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.root / "gh-called").exists())
        data = json.loads((self.root / "compiler-inputs.json").read_text())
        self.assertEqual(data["commits"], 1)
        self.assertIsNone(data["issues"])


if __name__ == "__main__":
    unittest.main()
