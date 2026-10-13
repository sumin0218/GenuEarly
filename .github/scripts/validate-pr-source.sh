#!/usr/bin/env bash
# main 대상 PR은 release/vX.Y.Z 브랜치에서만 출발할 수 있다 (CONTRIBUTING.md 2절).

set -euo pipefail

base_ref="${1:?base branch is required}"
head_ref="${2:?head branch is required}"
release_pattern='^release/v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'

if [[ "$base_ref" == "main" && ! "$head_ref" =~ $release_pattern ]]; then
  echo "main 대상 PR은 release/vX.Y.Z 브랜치에서만 시작할 수 있습니다: $head_ref" >&2
  exit 1
fi
