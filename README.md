<div align="center">

<img src="apps/extension/assets/icon-master.png" alt="GenuEarly 로고" width="128" height="128">

# GenuEarly

**Genu**ine(진짜의) + **Early**(일찍)
— 기사를 읽는 **이른** 순간에, 확인해 볼 점을 짚어 주는 크롬 확장 프로그램

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6.svg)
![Tests](https://img.shields.io/badge/tests-739%20passing-success.svg)
![2026 KHU AI Challenge](https://img.shields.io/badge/2026%20KHU%20AI%20Challenge-AI%20문제해결%20솔루션-crimson.svg)

</div>

---

## 요약

뉴스 기사를 연 **그 순간**에 출처·제목·표현을 살펴, 확인해 볼 점이 있는지 알려 준다.
2026 KHU AI Challenge(AI 문제해결 솔루션 부문) 출품작이다.

하려는 일은 가짜뉴스를 **대신 가려내 주는 것이 아니라**, 사용자가 스스로 가릴 재료를 가장 빨리 건네는 것이다.
다 읽고 나서 의심하면 늦는다. 읽는 동안 이미 판단이 만들어지기 때문이다.

빠르려면 모델을 가려 써야 한다. **Jev**는 글을 지어내는 모델이 아니라 판단만 돌려주는 분류기여서,
글자를 한 자씩 만들어 내는 시간이 들지 않는다. 실측에서 제목 하나 판정에 **0.5~1.5초**가 걸렸고,
기사를 열면 몇 초 안에 배지가 뜬다. 목록에서 제목 수십 개를 동시에 판정하는 일은 생성 모델로는 이 시점에 댈 수 없다.

### 하지 않는 것

| 하지 않는다 | 대신 한다 |
| --- | --- |
| 진위를 단정한다 | **'주의가 필요한 신호'**가 있는지를 알려 준다 |
| 공유를 막는다 | 알림만 띄운다. 공유는 사용자가 한다 |
| 모르는데 아는 척한다 | 확신이 낮으면 **⚪ 판단 보류**라고 말한다 |
| 동의 없이 데이터를 보낸다 | 피드백은 사용자가 동의한 경우에만 보낸다 |
| 언론사를 평가한다 | 개별 기사의 **글 자체에서 보이는 신호**만 본다 |

이 다섯은 제품의 전제다. 어기면 만들 이유가 없어진다 ([docs/product.md](docs/product.md) 2절).

## 기능 (v1.0.0)

| # | 기능 | 내용 |
| --- | --- | --- |
| ① | **기사 자동 검사** | 기사 페이지에서 배지를 띄운다. 🟢 안심 / 🟡 확인 권장 / 🔴 주의 / ⚪ 판단 보류 |
| ② | **포털 목록 일괄 검사** | 네이버·다음·인사이트·위키트리 목록의 제목을 병렬로 판단해 **낚시성 제목**을 표시한다 |
| ③ | **선택 텍스트 검사** | 드래그한 문장을 오른쪽 클릭 메뉴로 검사한다. 뉴스 사이트 밖에서도 된다 |
| ④ | **공유 직전 알림** | 주의 기사를 복사·공유할 때 알림을 띄운다. **공유를 막지는 않는다** |
| ⑤ | **오판 피드백** | 판단이 틀렸다고 알려 준다. **사용자가 동의한 경우에만 전송한다** |
| ＋ | **리포트** | 같은 사안의 주변 보도를 모아 견주어 준다. 지난 리포트는 **보관함**에 남는다 |

배지 ⚪(판단 보류)는 실패가 아니라 **결과의 한 종류**다. 모델 확신도가 낮거나 호출이 실패했을 때 띄운다.

### 보는 것 — 판단 항목 일곱

출처를 밝혔는지, 제목이 본문과 맞는지, 제목이 내용을 감추거나 부풀리는지, 퍼뜨리라고 재촉하는지,
감정을 자극하는지, 기계가 쓴 듯한 문체인지, 확인할 수 없는 주장을 담았는지를 본다
([docs/product.md](docs/product.md) 4절).

## 기술 스택

| 영역 | 쓰는 것 |
| --- | --- |
| **확장 프로그램** | [WXT](https://wxt.dev) 0.21 · TypeScript 5.9 · Vite 8 · Chrome **Manifest V3** |
| **중계 서버** | Cloudflare Workers · Wrangler 4 · TypeScript 5.9 |
| **테스트** | Vitest 5 · happy-dom 21 — 확장 470 · 중계 127 · 공용 142 = **739건** |
| **모노레포** | npm workspaces · commitlint 20 · husky 9 |
| **CI** | GitHub Actions ([lint-pr.yml](.github/workflows/lint-pr.yml)) |
| **AI** | ChatKHU Gateway 경유 — `jev-1.13.0` · `gpt-5.6-luna` · `claude-sonnet-5-5` · `sonar-pro` · `claude-opus-5-5` |

호스트 권한에 와일드카드(`<all_urls>`)를 쓰지 않는다. 브라우저 권한은 `storage`와 `contextMenus` 둘뿐이고,
그 금지 목록은 문서가 아니라 [테스트](apps/extension/tests/manifest.test.ts)가 지킨다.

## 구조

| 디렉터리 | 내용 | 상태 |
| --- | --- | --- |
| [`apps/extension/`](apps/extension/) | 크롬 확장 프로그램 (Manifest V3) | WXT + TypeScript |
| [`apps/proxy/`](apps/proxy/) | Jev 중계 서버. **API 키를 들고 있는 유일한 곳** | Cloudflare Workers + TypeScript |
| [`packages/shared/`](packages/shared/) | 판단 스키마, 점수 합산, 배지 단계 결정 | TypeScript |
| [`packages/content/`](packages/content/) | 사용자에게 보이는 문구. **ChatKHU 생성물** | JSON |
| [`eval/`](eval/) | 판단 품질 평가 세트와 측정 결과 | 세트 완료, **측정 전** |
| [`tools/`](tools/) | 개발할 때만 쓰는 도구. **제품에 배포되지 않는다** | `content-gen` (Node) |
| [`docs/`](docs/) | 제품 정의, Jev 정리, 컨벤션, 보안, AI 활용 기록, 제출 서류 | |
| [`.github/`](.github/) | PR·이슈 양식, 규칙 검사 워크플로 | |

중계 서버는 배포돼 있다 (2026-10-27). 주소와 재배포 절차는 [apps/proxy/README.md](apps/proxy/README.md) 배포 절에 있다.
루트 `package.json`은 커밋 메시지 검사 도구와 워크스페이스 연결만 맡고, 앱 의존성은 각 `apps/*`, `packages/*` 안에 둔다.

## 설치와 실행

```bash
git clone https://github.com/sumin0218/GenuEarly.git
cd GenuEarly
npm install                               # 저장소 루트에서 한 번

npm run dev   -w @genuearly/extension     # 개발 모드 (변경하면 자동 반영)
npm run build -w @genuearly/extension     # 빌드 → apps/extension/.output/chrome-mv3
npm test      -w @genuearly/extension     # 테스트
```

빌드한 것을 크롬에 올리려면 `chrome://extensions` → **개발자 모드** 켜기 →
**압축해제된 확장 프로그램을 로드** → `apps/extension/.output/chrome-mv3` 폴더를 고른다.

> 확장 프로그램을 다시 로드해도 **이미 열려 있는 탭에는 반영되지 않는다.** 페이지를 새로 고쳐야 한다.

설치 없이 기능을 확인해 보려면 [수동 테스트 기사 45건](eval/fixtures/manual-news/)을 쓴다.
`index.html`을 열면 목록 표시부터 리포트까지 다섯 기능을 모두 재현할 수 있다.

## AI 역할 분담

| 주체 | 결과물에서 맡는 것 |
| --- | --- |
| **ChatKHU** (경희대 생성형 AI, 대회 필수 도구) | 사용자가 읽는 **모든 문구**와 확장 프로그램 아이콘. 생성물이 배포본에 그대로 들어간다 |
| **Jev 1.13** (TypeSafe, AI 판단 특화 모델) | 기사·제목·문장에 대한 판단. 실행 중 호출된다 |
| **sonar-pro** | 리포트의 주변 기록 검색. **찾기만 하고 판정하지 않는다** |
| **claude-opus-5-5** | 리포트의 글 엮기. **판정하지 않는다** |
| **코드** | 점수 합산과 배지 단계 결정, 출처 도메인 확인, 생성물 거르기 |

네 모델 모두 **ChatKHU API 게이트웨이**를 거쳐 부른다.

**Jev는 사용자에게 보이는 글을 한 글자도 쓰지 않는다.** 글을 생성하도록 학습된 모델이 아니다 ([docs/jev.md](docs/jev.md) 3절 ⑨).
판단은 Jev가 하고, **사용자에게 하는 말은 ChatKHU가 한다.**
실행 중에 생성되는 유일한 한국어는 리포트의 요약 문단이고, 그것조차 코드가 그 자리에서 거른다.
보내지 않은 문장이나 금지어나 마크업이 섞이면 고치지 않고 **통째로 버리고** 미리 써 둔 문구로 대신한다.

점수를 더하고 단계를 가르는 일은 모델이 아니라 코드가 한다. 이유는 [docs/jev.md](docs/jev.md)에 있다.

## 참여 팀원

| 이름 | GitHub | 맡은 것 |
| --- | --- | --- |
| 손수민 | [@sumin0218](https://github.com/sumin0218) | 제품 정의, 확장 프로그램(배지·팝업·목록 표시·선택 검사·리포트), 중계 서버, 문구 생성 파이프라인, 제출 서류 |
| 권승원 | [@SeungwonKwon](https://github.com/SeungwonKwon) | 판단 항목 일곱 확정, 점수 합산과 배지 단계, 평가 세트와 라벨링 기준, 프롬프트 인젝션 방어와 검사, 수동 테스트 자료 |

## 일정

| 날짜 | 할 일 | 버전 |
| --- | --- | --- |
| 10/25 (일) | 기능 동결 · `release/v1.0.0` 브랜치 생성 | |
| 10/26 (월) ~ 10/30 (금) 17시 | **작품 제출** | v1.0.0 |
| 11/02 (월) ~ 11/06 (금) | 예선 심사 (온라인 서면) | |
| 11/10 (화) | 본선 발표평가 (30팀 내외) | v1.1.0 |
| 11/19 (목) ~ 11/20 (금) | 성과공유 전시 (국제캠퍼스 중앙도서관 1F) | v1.2.0 |

기능 동결 이후에는 새 기능을 넣지 않고 **출시를 막는 버그와 문구·안정성만** 손본다.
제출 마감 전에 `v1.0.0` 태그를 찍고 그것을 제출한다 ([CONTRIBUTING.md 4절](CONTRIBUTING.md#4-버전)).

**예선은 발표 없이 서류로만 심사한다.** 서식3(프로젝트 소개서)과 서식4(AI 활용 과정 설명서)가
그대로 점수가 된다. 자세한 내용은 [docs/submission/](docs/submission/)에 있다.

## 읽는 순서

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

외부 제보는 [버그 제보](.github/ISSUE_TEMPLATE/bug-report.yml)와 [판단 결과 이의](.github/ISSUE_TEMPLATE/judgment-dispute.yml) 양식으로 받는다.

## 공개 저장소에서 지키는 것

- **Jev API 키는 중계 서버 환경변수에만 둔다.** 확장 프로그램 번들에는 어떤 형태로도 넣지 않는다
- **실제 기사 본문을 커밋하지 않는다.** 평가 세트에는 URL과 라벨만 둔다
- **가상 평가 기사는 커밋하지 않는다** (`eval/data/private/`, 커밋 제외). 명시적으로 공개 요청된 [수동 테스트 기사 45건](eval/fixtures/manual-news/)은 테스트·허구 표시를 포함한 별도 예외다
- **서명이 들어간 제출 서류를 커밋하지 않는다** (`docs/submission/signed/`, 커밋 제외)

## 라이선스

이 저장소의 코드와 문서는 [MIT License](LICENSE)로 공개한다.

```
Copyright (c) 2026 GenuEarly contributors
```

다만 아래는 MIT 적용 대상이 아니거나 조건이 다르다.

- **Jev**(TypeSafe)와 **ChatKHU**(경희대)는 각 제공자의 이용 조건을 따른다. 이 저장소는 API 키를 포함하지 않는다
- [수동 테스트 기사 45건](eval/fixtures/manual-news/)은 시험용으로 지어낸 글이다. **기사가 아니며 인용하지 않는다**
- 출처·권리·라이선스 전체 목록은 [docs/ai-log/sources.md](docs/ai-log/sources.md)에 있다
