# 코드 컨벤션

**스택과 무관한 공통 규칙이다.** 언어와 빌드 도구가 정해지면 언어별 규칙을 아래 "스택별 규칙"에 추가하고, 포매터·린터를 CI에 연결한다.

## 원칙

- **포매팅은 도구가 한다.** 사람은 포매팅을 리뷰하지 않는다. 포매터를 정하면 CI에서 검사한다.
- **주석은 "무엇"이 아니라 "왜"를 적는다.** 특히 보안 때문에, 또는 Jev의 한계 때문에 일부러 한 선택은 반드시 주석으로 남긴다. 모르는 사람이 보면 "굳이 왜 이렇게?" 싶은 코드가 많이 나올 자리다.
- **판단 기준과 코드가 다른 말을 하지 않게 한다.** 기준의 원본은 [docs/product.md](../product.md)다.

## 공통

| 항목 | 규칙 |
| --- | --- |
| 인코딩·줄바꿈 | UTF-8, LF ([.editorconfig](../../.editorconfig), [.gitattributes](../../.gitattributes)) |
| 들여쓰기 | 2칸 |
| 파일 끝 | 빈 줄 하나 |
| 언어 | 코드 식별자는 영어, 주석·문서·커밋은 한국어 |
| 사용자에게 보이는 문구 | 코드에 직접 쓰지 않고 [packages/content](../../packages/content/)에 모은다 |
| TODO | `TODO(GitHub ID): 내용` — 주인 없는 TODO를 남기지 않는다. Jira 이슈가 있으면 키를 함께 적는다<br>예) `TODO(sumin): 확신도 임계값 확정 GE-24` |

## 네이밍

| 대상 | 규칙 | 예 |
| --- | --- | --- |
| 판단 항목 이름 | snake_case. [docs/product.md](../product.md) 4절의 표와 **글자 그대로 같게** | `headline_body_match` |
| 배지 단계 | 대문자 상수 | `SAFE`, `CHECK`, `CAUTION`, `UNDETERMINED` |
| 파일·디렉터리 | kebab-case | `article-badge/`, `share-alert.*` |
| 환경변수 | UPPER_SNAKE_CASE | `JEV_API_KEY`, `JEV_MODEL` |
| 브랜치 | `{type}/GE-{번호}-{kebab-slug}` | `feat/GE-12-article-badge` |
| boolean | `is`/`has`/`can` 접두사 | `isUndetermined`, `hasConsent` |
| 상수 | UPPER_SNAKE_CASE | `CONFIDENCE_FLOOR` |

- **판단 항목 이름을 코드에서 바꾸지 않는다.** 문서, 프롬프트, 평가 세트, 로그가 같은 문자열을 쓴다. 이름이 어긋나면 eval 결과를 믿을 수 없게 된다.
- ⚪는 `ERROR`나 `FAIL`이 아니라 `UNDETERMINED`다. 실패가 아니라 결과이기 때문이다.

## 디렉터리

- 기능 단위로 묶는다. 계층 단위(`utils/`, `helpers/`, `services/`)로 먼저 나누지 않는다.
- **모노레포의 경계를 지킨다.**

| 패키지 | 들어가는 것 | 들어가면 안 되는 것 |
| --- | --- | --- |
| `packages/shared` | 판단 항목 정의, 보기와 그 순서, 가중치, 임계값, 점수 합산, 단계 결정 | DOM 코드, 브라우저 API, 네트워크 호출 |
| `packages/content` | 사용자에게 보이는 문구 | 로직 |
| `apps/extension` | DOM, 브라우저 API, UI | API 키, 판단 로직의 원본 |
| `apps/proxy` | API 키, Jev 호출 | 사용자 문구 |

- `packages/shared`는 **브라우저와 서버 양쪽에서 돈다**고 보고 쓴다. 특정 런타임에만 있는 API에 기대지 않는다.

## 매직 넘버

- **가중치, 임계값, 점수 경계를 코드 여기저기에 흩지 않는다.** `packages/shared` 한 곳에 상수로 모은다.
- 상수에는 그 값이 어디서 나왔는지 주석으로 적는다. 측정해서 정한 값이면 그 사실을 적는다.

```text
// eval v3에서 측정. 이 값을 0.6으로 낮추면 오탐이 2배가 된다.
```

## 로그

- 기사 본문, URL 전체, 사용자 입력을 로그에 남기지 않는다 ([보안 문서](../security/secure-coding.md) 7절).
- 판단 결과를 로그로 남길 때는 **모델 버전(`model` 필드의 값)을 함께 남긴다.** 어느 버전이 낸 결과인지 모르면 회귀를 추적할 수 없다.

## 테스트

- 동작을 바꾸는 PR에는 테스트를 함께 넣는다.
- **실패 경로를 테스트한다.** 이 제품에서 가장 자주 밟히는 경로다.
  - 호출이 실패했을 때 ⚪가 나오는가
  - 확신도가 낮을 때 ⚪가 나오는가
  - 응답이 우리가 정한 보기 밖의 값일 때 ⚪가 나오는가
  - 429를 받았을 때 어떻게 되는가
- **점수 합산과 단계 결정은 모델 없이 테스트한다.** 코드가 하는 일이므로 Jev 응답을 고정값으로 넣고 검증할 수 있다.
- 성공 케이스만 테스트하지 않는다.

## 스택별 규칙

### `apps/extension` — WXT + TypeScript

규칙은 [apps/extension/AGENT.md](../../apps/extension/AGENT.md)에 있다. 명령은 저장소 루트에서도 쓸 수 있다.

| 할 일 | 명령 |
| --- | --- |
| 개발 | `npm run dev -w @genuearly/extension` |
| 빌드 | `npm run build -w @genuearly/extension` |
| 테스트 | `npm test -w @genuearly/extension` |
| 타입 검사 | `npm run compile -w @genuearly/extension` |

- **타입을 강제하지 않는다.** 평범한 JS를 `.ts` 파일에 써도 된다. 타입 오류는 빌드를 막지 않고 `npm run compile`에서만 보인다
- `entrypoints/` 안에는 엔트리포인트만 둔다. CSS·헬퍼는 `assets/`, `components/`에 둔다
- WXT의 auto-import(`defineContentScript`, `browser` 등)를 쓴다. 공식 문서 예제와 같은 형태를 유지하기 위해서다

### `apps/proxy` — Cloudflare Workers + TypeScript

규칙은 [apps/proxy/AGENT.md](../../apps/proxy/AGENT.md)에 있다.

| 할 일 | 명령 |
| --- | --- |
| 개발 | `npm run dev -w @genuearly/proxy` |
| 테스트 | `npm test -w @genuearly/proxy` |
| 타입 검사 | `npm run compile -w @genuearly/proxy` |
| 배포 | `npm run deploy -w @genuearly/proxy` |

### 아직 정하지 않은 것

- `packages/shared`, `packages/content`, `eval`: 코드를 넣는 PR 에서 정한다. TypeScript 가 기본값이다

> **포매터·린터는 아직 없다.** 지금은 [.editorconfig](../../.editorconfig)만 적용된다.
> 정하면 이 절에 명령을 적고 CI에 연결한다.
