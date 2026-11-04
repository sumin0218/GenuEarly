#!/usr/bin/env bash
# validate-assignee.sh 규칙 자체를 검사한다.

set -euo pipefail

script="$(dirname "${BASH_SOURCE[0]}")/validate-assignee.sh"
failures=0

expect_pass() {
  if ! bash "$script" "$1" >/dev/null 2>&1; then
    echo "통과해야 하는 값이 막혔습니다: '$1'" >&2
    failures=$((failures + 1))
  fi
}

expect_fail() {
  if bash "$script" "$1" >/dev/null 2>&1; then
    echo "막혀야 하는 값이 통과했습니다: '$1'" >&2
    failures=$((failures + 1))
  fi
}

expect_pass sumin0218
expect_pass 'sumin0218 SeungwonKwon'

expect_fail ''
# 공백만 온 경우. 워크플로의 join 이 비면 빈 문자열이지만, 식을 고치다
# 공백이 섞여 들어와도 "담당자 없음" 과 똑같이 막아야 한다.
expect_fail ' '
expect_fail '   '

# 인자 자체가 없는 경우. 식이 깨져 env 가 비면 조용히 통과해서는 안 된다.
if bash "$script" >/dev/null 2>&1; then
  echo "인자가 없는데 통과했습니다" >&2
  failures=$((failures + 1))
fi

if [ "$failures" -ne 0 ]; then
  echo "담당자 규칙 검사 실패: $failures건" >&2
  exit 1
fi
echo "담당자 규칙 검사 통과"
