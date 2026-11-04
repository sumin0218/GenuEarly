#!/usr/bin/env bash
# PR 에는 담당자(assignee)가 한 명 이상 있어야 한다 (CONTRIBUTING.md 3절).
#
# 누가 끝까지 들고 갈 PR 인지가 보드에 남아야 한다. 작성자와 담당자가 늘 같지는
# 않아서 — 리뷰 지적을 다른 사람이 반영하는 일이 있다 — 작성자로 대신하지 않는다.
#
# 인자는 담당자 아이디를 공백으로 이은 것이다. 워크플로가
# `join(github.event.pull_request.assignees.*.login, ' ')` 를 넘긴다.
# 담당자가 없으면 빈 문자열이 온다.
#
# **`${1:?}` 를 쓰지 않는다.** 빈 문자열도 unset 과 같이 걸려서, 담당자가 없는
# 흔한 경우에 우리 안내문 대신 bash 의 영문 메시지가 나간다.

set -euo pipefail

assignees="${1-}"

if [ -z "${assignees//[[:space:]]/}" ]; then
  echo "이 PR 에는 담당자가 없습니다. 오른쪽 Assignees 에 한 명 이상 넣어 주세요." >&2
  echo "담당자를 넣으면 이 검사가 저절로 다시 돌아 통과합니다." >&2
  exit 1
fi

echo "담당자 확인: $assignees"
