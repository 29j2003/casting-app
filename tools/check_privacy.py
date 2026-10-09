"""Check that no personal email address is published with the code.

    python tools/check_privacy.py

Fails (exit code 1) if
  - a commit's author or committer email is not a "noreply" address (GitHub: Settings → Emails →
    "Keep my email addresses private" gives you <id>+<name>@users.noreply.github.com), a commit message names
    another address (e.g. a Co-Authored-By line), or a tag's author is not a noreply address, or
  - a tracked text file contains an email address (fonts and other binary files are skipped; their
    license data names the font makers).

The CI runs this on every push (.github/workflows/build.yml, job "checks"). It cannot un-publish a push –
GitHub's "Block command line pushes that expose my email" stops it before that – but it makes every slip visible.
"""

import re
import subprocess
import sys

# exactly the noreply forms (a private address with "noreply" somewhere in it does not count)
NOREPLY = re.compile(r"(\d+\+)?[A-Za-z0-9._-]+@users\.noreply\.github\.com|noreply@(github|anthropic)\.com", re.I)
EMAIL = re.compile(rb"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")
# commits made before this check existed; listed so that only NEW slips fail (see docs/ENTWICKLUNG.md, "Privatsphäre")
KNOWN_OLD_COMMITS = {"e28bf8884c4f1bc5f5a4f05dc25a3178faf63101"}
TEXT_ALLOWED = {"noreply@anthropic.com", "noreply@github.com"}      # attribution lines in docs/commits


def git(*args: str) -> str:
    return subprocess.run(["git", *args], check=True, capture_output=True, text=True).stdout


def commit_problems() -> list[str]:
    """Author, committer and every address in the message (e.g. Co-Authored-By lines) of all commits; tag authors."""
    problems = []
    for record in git("log", "--all", "--format=%H%x00%ae%x00%ce%x00%B%x1e").split("\x1e"):
        if not record.strip():
            continue
        sha, author, committer, message = (record.strip("\n").split("\x00") + ["", "", ""])[:4]
        if sha in KNOWN_OLD_COMMITS:
            continue
        if not all(NOREPLY.fullmatch(e) for e in (author, committer)):
            problems.append(f"Commit {sha[:9]}: private E-Mail-Adresse im Commit")
        elif any(not NOREPLY.fullmatch(m.group(0).decode()) for m in EMAIL.finditer(message.encode())):
            problems.append(f"Commit {sha[:9]}: E-Mail-Adresse in der Commit-Nachricht")
    for line in git("for-each-ref", "refs/tags", "--format=%(refname:short) %(taggeremail)").splitlines():
        name, _, email = line.partition(" ")
        email = email.strip().strip("<>")
        if email and not NOREPLY.fullmatch(email):
            problems.append(f"Tag {name}: private E-Mail-Adresse")
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
            if address.lower() not in TEXT_ALLOWED and not NOREPLY.fullmatch(address):
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
