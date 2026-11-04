# 룰셋

`main`·`develop` 에 걸린 규칙의 **원본**이다. 규칙을 바꿀 때는 여기를 고치고 적용한다.

> **이 파일들은 커밋만으로는 적용되지 않는다.** 룰셋은 GitHub 서버 쪽 설정이라
> 워크플로(`.github/workflows/`)처럼 자동으로 읽히지 않는다. 아래 명령으로 밀어 넣어야 한다.
> 저장소에 두는 이유는 **무엇이 걸려 있는지 리뷰하고 이력을 남기기 위해서**다.

## 지금 걸려 있는 것

| 파일 | 룰셋 id | 대상 | 내용 |
| --- | --- | --- | --- |
| [protected-branches.json](protected-branches.json) | 26348486 | `main`, `develop` | PR 필수 · 승인 1명 · 코드 오너 승인 · 필수 검사 6개 · 삭제 금지 · force push 금지 |
| [main-merge-method.json](main-merge-method.json) | 26348495 | `main` | merge commit 만 |
| [develop-merge-method.json](develop-merge-method.json) | 26348496 | `develop` | squash 만 |

머지 방식을 따로 둔 것은 **브랜치마다 달라서**다 ([CONTRIBUTING.md 3절](../../CONTRIBUTING.md#3-pr-규칙)).
룰셋은 여러 개가 겹쳐 먹고 **더 엄한 쪽이 이긴다** — `protected-branches` 가 세 방식을 다 허용해도
`main` 에서는 `main-merge-method` 가 merge commit 하나로 좁힌다. 브랜치 보호로는 안 되는 일이다.

## 적용

```bash
# 새로 만들기
gh api repos/sumin0218/GenuEarly/rulesets \
  --method POST --input .github/rulesets/protected-branches.json

# 고친 것 반영 (id 는 위 표에서)
gh api repos/sumin0218/GenuEarly/rulesets/26348486 \
  --method PUT --input .github/rulesets/protected-branches.json
```

## 확인

```bash
# 룰셋 목록
gh api repos/sumin0218/GenuEarly/rulesets --jq '.[] | "\(.id) \(.name) \(.enforcement)"'

# 그 브랜치에 **실제로 먹는** 규칙. 겹친 결과를 보려면 이것을 본다
gh api repos/sumin0218/GenuEarly/rules/branches/develop
```

## 끄기와 지우기

```bash
# 지우지 않고 끄기
gh api repos/sumin0218/GenuEarly/rulesets/26348486 --method PUT -f enforcement=disabled

# 지우기
gh api repos/sumin0218/GenuEarly/rulesets/26348486 --method DELETE
```

## 바이패스

`bypass_mode` 가 `pull_request` 다. 저장소 소유자는 **PR 을 통해서만** 규칙을 넘길 수 있다.

- `main`·`develop` 에 **직접 push 는 소유자도 막힌다**
- 승인이 모이지 않거나 검사가 빨간 PR 은 소유자가 머지할 수 있다

팀원이 둘뿐이라 승인 1명을 엄하게 걸면 한 명이 쉴 때 작업이 멈춘다. 그래서 둔 여유다.
엄하게 가려면 `bypass_actors` 를 `[]` 로 비운다. 다만 **그러면 소유자도 자기 PR 을 머지할 수 없다** —
자기 PR 에는 승인을 줄 수 없기 때문이다.

## 아직 손대지 않은 것

- **CODEOWNERS 가 전부 주석이다** ([../CODEOWNERS](../CODEOWNERS)). `require_code_owner_review` 가
  켜져 있지만 오너로 지정된 경로가 없어서 아무것도 막지 않는다. 그 파일을 채우면 그때부터 먹는다.
- **`shared` 검사가 필수 목록에 없다.** CONTRIBUTING 3절의 목록을 그대로 옮긴 것이다. 넣으려면
  `protected-branches.json` 의 `required_status_checks` 에 `{ "context": "shared" }` 를 더한다.
- `require_extra_approval_for_unattributed_changes` 는 GitHub 이 기본값 `true` 로 넣는다.
  작성자가 밝혀지지 않은 Copilot PR 에만 걸리는 것이라 우리에게는 해당이 없다.
