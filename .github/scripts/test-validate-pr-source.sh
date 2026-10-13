#!/usr/bin/env bash
# validate-pr-source.sh 규칙 자체를 검사한다.

set -euo pipefail

script="$(dirname "${BASH_SOURCE[0]}")/validate-pr-source.sh"
failures=0

expect_pass() {
  if ! bash "$script" "$1" "$2" >/dev/null 2>&1; then
    echo "통과해야 하는 조합이 막혔습니다: $2 -> $1" >&2
    failures=$((failures + 1))
  fi
}

expect_fail() {
  if bash "$script" "$1" "$2" >/dev/null 2>&1; then
    echo "막혀야 하는 조합이 통과했습니다: $2 -> $1" >&2
    failures=$((failures + 1))
  fi
}

expect_pass main release/v1.0.0
expect_pass main release/v1.12.3
expect_pass develop feat/GE-12-article-badge
expect_pass develop fix/GE-31-share-alert
expect_pass develop release/v1.0.0
expect_pass release/v1.0.0 fix/GE-42-release-blocker

expect_fail main develop
expect_fail main feat/GE-12-article-badge
expect_fail main release/1.0.0
expect_fail main release/v1.0
expect_fail main release/v01.0.0

if [ "$failures" -ne 0 ]; then
  echo "PR 출발 브랜치 규칙 검사 실패: $failures건" >&2
  exit 1
fi
echo "PR 출발 브랜치 규칙 검사 통과"
