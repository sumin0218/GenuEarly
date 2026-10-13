#!/usr/bin/env bash
# validate-branch-name.sh 규칙 자체를 검사한다.

set -euo pipefail

script="$(dirname "${BASH_SOURCE[0]}")/validate-branch-name.sh"
failures=0

expect_pass() {
  if ! bash "$script" "$1" >/dev/null 2>&1; then
    echo "통과해야 하는 브랜치 이름이 막혔습니다: $1" >&2
    failures=$((failures + 1))
  fi
}

expect_fail() {
  if bash "$script" "$1" >/dev/null 2>&1; then
    echo "막혀야 하는 브랜치 이름이 통과했습니다: $1" >&2
    failures=$((failures + 1))
  fi
}

# --- 통과 -------------------------------------------------------------------
expect_pass feat/GE-12-article-badge
expect_pass fix/GE-31-share-alert
expect_pass docs/GE-4-jev-notes
expect_pass security/GE-108-message-origin-check
expect_pass chore/GE-7-commit-hooks
expect_pass release/v1.0.0
expect_pass release/v0.1.0
expect_pass release/v1.12.3

# --- 거절 -------------------------------------------------------------------
expect_fail feat/12-article-badge           # Jira 키 없음 — 이슈 자동 연결이 안 된다
expect_fail feat/GE12-article-badge         # 하이픈 없음
expect_fail feat/ge-12-article-badge        # 키는 대문자
expect_fail feat/GE-12                      # slug 없음
expect_fail feat/GE-0-article-badge         # 번호는 1부터
expect_fail feat/GE-12-Article-Badge        # slug는 소문자
expect_fail feat/GE-12-article_badge        # 하이픈만 쓴다
expect_fail feat/GE-12-기사-배지            # slug는 영어
expect_fail wip/GE-12-article-badge         # 목록에 없는 type
expect_fail release/GE-12-article-badge     # release는 버전 형식만
expect_fail GE-12-article-badge             # type 없음
expect_fail release/v1.0                    # 세 자리 버전
expect_fail release/1.0.0                   # v 없음
expect_fail develop
expect_fail main

if [ "$failures" -ne 0 ]; then
  echo "브랜치 이름 규칙 검사 실패: $failures건" >&2
  exit 1
fi
echo "브랜치 이름 규칙 검사 통과"
