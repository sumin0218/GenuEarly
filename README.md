# GenuEarly

> **Genu**ine(진짜의) + **Early**(일찍) — 정보를 접하는 이른 순간에 진짜인지 가짜인지 빠르게 가려낸다.

기사를 읽는 순간과 남에게 공유하려는 순간에 **'주의가 필요한 신호'**를 알려 주는 크롬 확장 프로그램이다.
2026 KHU AI Challenge(AI 문제해결 솔루션 부문) 출품작.

**진위를 단정하지 않는다.** 이 확장 프로그램은 "이 기사는 가짜다"라고 말하지 않는다.
출처가 없는지, 제목과 본문이 따로 노는지, 공유를 부추기는지 같은 **확인해 볼 만한 신호**를 보여 주고,
판단은 사용자가 한다. 확신이 서지 않으면 서지 않는다고 말한다(⚪ 판단 보류).

## 기능 (v1.0.0)

| # | 기능 | 내용 |
| --- | --- | --- |
| ① | 기사 자동 검사 | 기사 페이지에서 배지를 띄운다. 🟢 안심 / 🟡 확인 권장 / 🔴 주의 / ⚪ 판단 보류 |
| ② | 포털 목록 일괄 검사 | 네이버·다음 뉴스 목록의 제목을 병렬로 판단해 낚시성 제목을 표시한다 |
| ③ | 선택 텍스트 검사 | 드래그한 문장을 오른쪽 클릭 메뉴로 검사한다 |
| ④ | 공유 직전 알림 | 주의 기사를 복사·공유할 때 알림을 띄운다. **공유를 막지는 않는다** |
| ⑤ | 오판 피드백 | 판단이 틀렸다고 알려 준다. **사용자가 동의한 경우에만 전송한다** |

배지 ⚪(판단 보류)는 실패가 아니라 결과다. 모델 확신도가 낮거나 호출이 실패했을 때 띄운다.

## 구조

| 디렉터리 | 내용 | 상태 |
| --- | --- | --- |
| [`apps/extension/`](apps/extension/) | 크롬 확장 프로그램 (Manifest V3) | WXT + TypeScript |
| [`apps/proxy/`](apps/proxy/) | Jev 중계 서버. API 키를 들고 있는 유일한 곳 | Cloudflare Workers + TypeScript |
| [`packages/shared/`](packages/shared/) | 판단 스키마, 점수 합산, 배지 단계 결정 | TypeScript |
| [`packages/content/`](packages/content/) | 사용자에게 보이는 문구. **ChatKHU 생성물** | JSON |
| [`eval/`](eval/) | 판단 품질 평가 세트와 측정 결과 | 세트 완료, **측정 전** |
| [`tools/`](tools/) | 개발할 때만 쓰는 도구. **제품에 배포되지 않는다** | `content-gen` (Node) |
| [`docs/`](docs/) | 제품 정의, Jev 정리, 컨벤션, 보안, AI 활용 기록, 제출 서류 | |
| [`.github/`](.github/) | PR·이슈 양식, 규칙 검사 워크플로 | |

> 중계 서버는 **Cloudflare Workers + TypeScript** 로 정해졌고 배포돼 있다 (2026-10-27).
> 주소와 재배포 절차는 [apps/proxy/README.md](apps/proxy/README.md) 배포 절에 있다.
>
> 확장 프로그램은 **WXT + TypeScript + npm**이다. 루트 `package.json`은 커밋 메시지 검사 도구와
> npm 워크스페이스 연결만 맡고, 앱 의존성은 각 `apps/*`, `packages/*` 안에 둔다.

### 확장 프로그램 실행

```bash
npm install                      # 저장소 루트에서 한 번
npm run dev   -w @genuearly/extension   # 개발 모드 (변경하면 자동 반영)
npm run build -w @genuearly/extension   # 빌드 → apps/extension/.output/chrome-mv3
npm test      -w @genuearly/extension   # 테스트
```

빌드한 것을 크롬에 올리려면 `chrome://extensions` → 개발자 모드 켜기 → **압축해제된 확장 프로그램을 로드** →
`apps/extension/.output/chrome-mv3` 폴더를 고른다.

## AI 역할 분담

| 주체 | 결과물에서 맡는 것 |
| --- | --- |
| **ChatKHU** (경희대 생성형 AI, 대회 필수 도구) | 사용자가 읽는 **모든 문구**와 확장 프로그램 아이콘. 생성물이 배포본에 그대로 들어간다 |
| **Jev 1.13** (TypeSafe, AI 판단 특화 모델) | 기사·제목·문장에 대한 판단. 실행 중 호출된다 |
| **코드** | 점수 합산과 배지 단계 결정, 출처 도메인 확인 |

**Jev는 사용자에게 보이는 글을 한 글자도 쓰지 않는다.** 글을 생성하도록 학습된 모델이 아니다 ([docs/jev.md](docs/jev.md) 3절 ⑨).
판단은 Jev가 하고, **사용자에게 하는 말은 ChatKHU가 한다.**

점수를 더하고 단계를 가르는 일은 모델이 아니라 코드가 한다. 이유는 [docs/jev.md](docs/jev.md)에 있다.

## 일정

| 날짜 | 할 일 | 버전 |
| --- | --- | --- |
| 10/25 (일) | 기능 동결 · `release/v1.0.0` 브랜치 생성 | |
| 10/26 (월) ~ 10/30 (금) 17시 | 작품 제출 | v1.0.0 |
| 11/02 (월) ~ 11/06 (금) | **예선 심사 (온라인 서면)** | |
| 11/10 (화) | 본선 발표평가 (30팀 내외) | v1.1.0 |
| 11/19 (목) ~ 11/20 (금) | 성과공유 전시 (국제캠퍼스 중앙도서관 1F) | v1.2.0 |

기능 동결 이후에는 새 기능을 넣지 않고 **출시를 막는 버그와 문구·안정성만** 손본다.
제출 마감 전에 `v1.0.0` 태그를 찍고 그것을 제출한다 ([CONTRIBUTING.md 4절](CONTRIBUTING.md#4-버전)).

**예선은 발표 없이 서류로만 심사한다.** 제출하는 서식3(프로젝트 소개서)과 서식4(AI 활용 과정 설명서)가
그대로 점수가 된다. 자세한 내용은 [docs/submission/](docs/submission/)에 있다.

## 시작하기

```bash
git clone https://github.com/sumin0218/GenuEarly.git
cd GenuEarly
npm install   # 커밋 메시지 검사 훅 설치 (선택)
git switch develop
```

읽는 순서는 이렇다.

1. [AGENT.md](AGENT.md) — 이 저장소에서 일하는 방법. AI 코딩 도구도 이 파일을 읽는다
2. [CONTRIBUTING.md](CONTRIBUTING.md) — Jira, 브랜치, 커밋, PR 규칙
3. [docs/product.md](docs/product.md) — 무엇을 왜 만드는가, 판단 항목
4. [docs/security/secure-coding.md](docs/security/secure-coding.md) — 코드 작성 전 필독
5. [docs/jev.md](docs/jev.md) — Jev의 한계와 그래서 생긴 설계 규칙

## 협업 규칙

- **팀 작업은 전부 Jira에서 관리한다.** GitHub Issues는 외부 제보(심사위원, 전시회 방문자) 전용이다
- 브랜치 이름에 Jira 키를 넣으면 이슈가 자동으로 연결된다 (`feat/GE-12-article-badge`)
- 한 사람이 동시에 '진행 중'으로 두는 이슈는 최대 2개다
- `main`·`develop`에 직접 push하지 않는다

## 공개 저장소에서 지키는 것

- **Jev API 키는 중계 서버 환경변수에만 둔다.** 확장 프로그램 번들에는 어떤 형태로도 넣지 않는다
- **실제 기사 본문을 커밋하지 않는다.** 평가 세트에는 URL과 라벨만 둔다
- **가상 평가 기사는 커밋하지 않는다** (`eval/data/private/`, 커밋 제외). 명시적으로 공개 요청된 [수동 테스트 기사 45건](eval/fixtures/manual-news/)은 테스트·허구 표시를 포함한 별도 예외다
- **서명이 들어간 제출 서류를 커밋하지 않는다** (`docs/submission/signed/`, 커밋 제외)

## 라이선스

[MIT](LICENSE)
