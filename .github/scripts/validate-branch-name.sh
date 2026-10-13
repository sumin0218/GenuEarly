#!/usr/bin/env bash
# 브랜치 이름이 CONTRIBUTING.md 2절 형식을 지키는지 본다.
#
# 작업 브랜치 이름에 Jira 키를 넣는 이유: GitHub for Jira 앱이 브랜치 이름에서 키를 읽어
# 이슈에 자동으로 연결한다. 그래서 키가 빠지면 Jira 쪽에 아무것도 남지 않는다.
# 커밋·PR 제목에는 키를 넣지 않는다 (commitlint.config.mjs가 막는다).

set -euo pipefail

branch="${1:?branch name is required}"

# 바꾼다면 commitlint.config.mjs의 JIRA_KEY와 함께 고친다.
jira_key='GE'

# CONTRIBUTING.md 1절의 type 목록과 같다. release는 출시 브랜치 형식이 따로 있어 제외한다.
types='feat|fix|docs|design|cicd|refactor|test|chore|security'

work_pattern="^(${types})/${jira_key}-[1-9][0-9]*-[a-z0-9]+(-[a-z0-9]+)*$"
release_pattern='^release/v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'

if [[ "$branch" =~ $work_pattern || "$branch" =~ $release_pattern ]]; then
  exit 0
fi

cat >&2 <<MSG
브랜치 이름이 규칙에 맞지 않습니다: $branch

  작업 브랜치: {type}/${jira_key}-{번호}-{kebab-slug}
    예) feat/${jira_key}-12-article-badge
  출시 브랜치: release/vX.Y.Z
    예) release/v1.0.0

  type: ${types//|/, }
  slug: 영어 소문자와 숫자, 단어 사이는 하이픈

Jira 이슈 연결은 브랜치 이름이 합니다 (CONTRIBUTING.md 2절).
MSG
exit 1
