"""Check that no personal email address is published with the code.

    python tools/check_privacy.py

Fails (exit code 1) if
  - a commit's author or committer email is not a "noreply" address (GitHub: Settings → Emails →
    "Keep my email addresses private" gives you <id>+<name>@users.noreply.github.com), or
  - a tracked text file contains an email address (fonts and other binary files are skipped; their
    license data names the font makers).

The CI runs this on every push (.github/workflows/build.yml, job "privacy"). It cannot un-publish a push –
GitHub's "Block command line pushes that expose my email" stops it before that – but it makes every slip visible.
"""

import re
import subprocess
import sys

NOREPLY = re.compile(r"(^|[.+@])noreply\b|@users\.noreply\.github\.com$", re.I)
EMAIL = re.compile(rb"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")
# commits made before this check existed; listed so that only NEW slips fail (see ENTWICKLUNG.md, "Privatsphäre")
KNOWN_OLD_COMMITS = {"e28bf8884c4f1bc5f5a4f05dc25a3178faf63101"}
TEXT_ALLOWED = {"noreply@anthropic.com", "noreply@github.com"}      # attribution lines in docs/commits


def git(*args: str) -> str:
    return subprocess.run(["git", *args], check=True, capture_output=True, text=True).stdout


def commit_problems() -> list[str]:
    problems = []
    for line in git("log", "--all", "--format=%H %ae %ce").splitlines():
        sha, *emails = line.split()
        bad = [e for e in emails if not NOREPLY.search(e)]
        if bad and sha not in KNOWN_OLD_COMMITS:
            problems.append(f"Commit {sha[:9]}: private E-Mail-Adresse im Commit")
    return problems


def file_problems() -> list[str]:
    problems = []
    for path in git("ls-files").splitlines():
        try:
            data = open(path, "rb").read()
        except OSError:
            continue
        if b"\0" in data[:8000]:                      # binary (fonts, images)
            continue
        for match in EMAIL.finditer(data):
            address = match.group(0).decode("utf-8", "replace")
            if address.lower() not in TEXT_ALLOWED and not NOREPLY.search(address):
                problems.append(f"{path}: E-Mail-Adresse im Text")
                break
    return problems


def main() -> None:
    problems = commit_problems() + file_problems()
    for problem in problems:
        print("✗", problem)                            # never print the address itself – the log is public
    if problems:
        sys.exit(1)
    print("✓ keine privaten E-Mail-Adressen in Commits oder Dateien")


if __name__ == "__main__":
    main()
