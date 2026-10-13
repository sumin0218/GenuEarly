#!/usr/bin/env bash
# commitlint 규칙이 실제로 거르는지 본다.
# 규칙은 켜 놓고 확인하지 않으면 조용히 죽는다 — 오타 하나로 type-enum이 비어도 모든 메시지가
# 통과한다. 그래서 통과해야 하는 예와 막혀야 하는 예를 함께 먹인다.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

failures=0

lint() {
  printf '%s' "$1" | npx --no -- commitlint >/dev/null 2>&1
}

expect_pass() {
  if ! lint "$1"; then
    echo "통과해야 하는 메시지가 막혔습니다: $1" >&2
    failures=$((failures + 1))
  fi
}

expect_fail() {
  if lint "$1"; then
    echo "막혀야 하는 메시지가 통과했습니다: $1" >&2
    failures=$((failures + 1))
  fi
}

# --- 통과 -------------------------------------------------------------------
expect_pass 'feat: 기사 배지 4단계 표시 구현'
expect_pass 'fix: 포털 목록에서 배지가 중복으로 붙는 문제 수정'
expect_pass 'security: 메시지 핸들러에 sender 출처 검증 추가'
expect_pass 'release: v1.0.0 출시'
expect_pass 'chore: bump dependencies'

for type in feat fix docs design cicd refactor test chore security release; do
  expect_pass "$type: 형식 확인"
done

# Jira 키 검사는 `GE-숫자`만 막는다. 아래는 걸리면 안 되는 평범한 표기다.
expect_pass 'fix: 응답 인코딩을 UTF-8로 고정'
expect_pass 'refactor: PAGE-7 레이아웃 상수를 공통 모듈로 이동'
expect_pass 'feat: 이미지 태그를 보존하도록 수정'

# --- 거절 -------------------------------------------------------------------
expect_fail 'wip: 대충 저장'
expect_fail '기사 배지 구현'
expect_fail 'feat:'
expect_fail 'feat(extension): 배지 추가'
expect_fail 'feat: 기사 배지 구현 #110'
expect_fail 'fix: 공유 알림 수정 (#91)'
expect_fail "docs: $(printf '가%.0s' $(seq 1 80))"

# 제목에 Jira 키를 넣지 않는다. 연결은 브랜치 이름과 PR 본문이 한다.
expect_fail 'feat: GE-12 기사 배지 구현'
expect_fail 'fix: 공유 알림 수정 (GE-31)'
expect_fail 'chore: ge-7 설정 정리'

if [ "$failures" -ne 0 ]; then
  echo "commitlint 규칙 검사 실패: $failures건" >&2
  exit 1
fi
echo "commitlint 규칙 검사 통과"
