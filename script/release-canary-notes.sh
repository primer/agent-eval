#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <version>" >&2
  exit 1
fi

awk -v version="$1" '
  $0 == "## " version {
    found = 1
    next
  }
  found && /^## / {
    exit
  }
  found {
    print
  }
  END {
    if (!found) {
      print "Could not find release notes for " version > "/dev/stderr"
      exit 1
    }
  }
' "$repository_root/packages/agent-eval/CHANGELOG.md"
