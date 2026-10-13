/**
 * 커밋 메시지 규칙. 원본은 CONTRIBUTING.md 1절이고 여기는 그것을 기계가 읽는 형태로 옮긴 것이다.
 * 문서와 다른 말을 하면 안 된다 — 둘을 같은 PR에서 함께 고친다.
 *
 * 관문은 CI다. 로컬 훅은 편의라서 설치하지 않은 사람도 막히지 않는다.
 * squash merge에서 히스토리에 남는 것은 PR 제목이므로 `Lint PR` 워크플로가 그것을 검사한다.
 */

/** CONTRIBUTING.md 1절의 표. */
const TYPES = [
  'feat',
  'fix',
  'docs',
  'design',
  'cicd',
  'refactor',
  'test',
  'chore',
  'security',
  // 출시 PR(`release/vX.Y.Z → main`) 전용. 목록에서 출시를 잡일과 구분하기 위해 둔다.
  'release',
]

/**
 * Jira 프로젝트 키. 브랜치 이름 검사(.github/scripts/validate-branch-name.sh)와 같은 값을 쓴다.
 * 바꾼다면 두 곳을 함께 고친다.
 */
const JIRA_KEY = 'GE'

/**
 * 제목에 이슈 번호나 Jira 키를 넣지 않는다.
 * - GitHub 이슈 번호: squash merge가 `(#123)`을 자동으로 붙인다.
 * - Jira 키: 연결은 브랜치 이름(GitHub for Jira 앱)과 PR 본문이 한다.
 *
 * Jira 키 검사는 `GE-숫자`만 막는다. 앞에 단어 경계를 요구하므로 `UTF-8`, `PAGE-7` 같은
 * 평범한 표기는 걸리지 않는다.
 *
 * String.raw를 쓰는 이유: 보통의 템플릿 문자열에서는 `\b`가 백스페이스 문자로, `\d`가 그냥
 * `d`로 해석된다. 그러면 패턴이 조용히 `GE-d+`가 되어 아무것도 막지 못한다.
 */
const jiraKeyPattern = new RegExp(String.raw`\b${JIRA_KEY}-\d+`, 'i')

const titleReferences = {
  rules: {
    'subject-no-issue-number': ({ subject }) => [
      !/#\d+/.test(subject ?? ''),
      '제목에 이슈 번호를 넣지 않는다. 연결은 브랜치 이름과 PR 본문이 한다 (CONTRIBUTING.md 1절)',
    ],
    'subject-no-jira-key': ({ subject }) => [
      !jiraKeyPattern.test(subject ?? ''),
      `제목에 Jira 키(${JIRA_KEY}-번호)를 넣지 않는다. 연결은 브랜치 이름과 PR 본문이 한다 (CONTRIBUTING.md 1절)`,
    ],
  },
}

export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [titleReferences],
  rules: {
    'type-enum': [2, 'always', TYPES],
    // scope는 쓰지 않는다. 어느 영역인지는 diff가 보여준다.
    'scope-empty': [2, 'always'],
    // 한글에는 대소문자가 없어 subject-case가 의미가 없다.
    'subject-case': [0],
    // squash merge가 " (#123)"을 덧붙이므로 기본값 100보다 낮춘다.
    'header-max-length': [2, 'always', 72],
    'subject-no-issue-number': [2, 'always'],
    'subject-no-jira-key': [2, 'always'],
  },
}
