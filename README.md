<div align="center">

<img src="apps/extension/assets/icon-master.png" alt="GenuEarly 로고" width="128" height="128">

# GenuEarly

**Genu**ine(진짜의) + **Early**(일찍)

기사를 읽는 **이른** 순간에, 확인해 볼 점을 짚어 주는 크롬 확장 프로그램입니다.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6.svg)
![Tests](https://img.shields.io/badge/tests-739%20passing-success.svg)
![2026 KHU AI Challenge](https://img.shields.io/badge/2026%20KHU%20AI%20Challenge-AI%20문제해결%20솔루션-crimson.svg)

</div>

---

뉴스 기사를 연 **그 순간**에 출처와 제목과 표현을 살펴, 확인해 볼 점이 있는지 알려 드립니다.

가짜뉴스를 대신 가려내 주지는 않습니다. 다 읽고 나서 의심하면 늦으니, 스스로 가릴 재료를 가장 빨리 건넬 뿐입니다.
참인지 거짓인지 말하지 않고, 언론사가 아니라 그 기사의 글만 보며, 확신이 낮으면 ⚪ 판단 보류라고 말합니다
([docs/product.md](docs/product.md) 2절).

빠른 이유는 **Jev**가 글을 지어내지 않고 판단만 돌려주는 분류기이기 때문입니다.
제목 하나 판정에 **0.5~1.5초**, 기사를 열면 몇 초 안에 배지가 뜹니다.

## ✨ 기능

| # | 기능 | 내용 |
| --- | --- | --- |
| ① | **기사 자동 검사** | 기사 페이지에서 배지를 띄웁니다. 🟢 안심 · 🟡 확인 권장 · 🔴 주의 · ⚪ 판단 보류 |
| ② | **포털 목록 일괄 검사** | 네이버·인사이트·위키트리 목록의 제목을 병렬로 판단해 **낚시성 제목**을 표시합니다 |
| ③ | **선택 텍스트 검사** | 드래그한 글을 오른쪽 클릭 메뉴로 검사합니다. 뉴스 사이트 밖에서도 됩니다 |
| ④ | **공유 직전 알림** | 주의 기사를 복사·공유할 때 알림을 띄웁니다. **공유를 막지는 않습니다** |
| ⑤ | **오판 피드백** | 판단이 틀렸다고 알려 주실 수 있습니다. **동의하신 경우에만 전송합니다** |
| ＋ | **리포트** | 같은 사안의 주변 보도를 모아 견주어 드립니다. 지난 리포트는 **보관함**에 남습니다 |

①은 네이버·다음·인사이트·위키트리 기사에서, ②는 그중 다음을 뺀 목록에서 동작합니다.

배지 ⚪(판단 보류)는 실패가 아니라 **결과의 한 종류**입니다. 모델 확신도가 낮거나 호출이 실패했을 때 띄웁니다.

### 🔎 판단 항목 일곱

| 항목 | 무엇을 보나 |
| --- | --- |
| `source_citation` | 주장의 출처(기관·인물·문서)를 구체적으로 밝혔는지 |
| `headline_body_match` | 제목이 본문과 맞는지 |
| `clickbait_headline` | 제목이 핵심을 감추거나 부풀리는지 |
| `spread_inducement` | 퍼뜨리라고 재촉하는 표현이 있는지 |
| `emotional_language` | 감정을 자극하는 표현이 있는지 |
| `ai_style_signal` | 기계가 쓴 듯한 문체인지 |
| `unverifiable_claim` | 확인할 수 없는 주장을 담았는지 |

점수를 더하고 배지 단계를 가르는 일은 모델이 아니라 **코드**가 합니다
([packages/shared/src/scoring.ts](packages/shared/src/scoring.ts)).

## 👀 미리보기

설치하지 않고 기능을 보시려면 [수동 테스트 기사 45건](eval/fixtures/manual-news/)을 쓰시면 됩니다.
`index.html`을 크롬에서 열면 목록 표시부터 리포트까지 다섯 기능을 모두 재현할 수 있습니다.

| 화면 | 무엇이 보이나 |
| --- | --- |
| 뉴스 목록 | 제목 옆에 낚시성 제목 아이콘, 오른쪽 아래에 아이콘 범례 |
| 기사 페이지 | 오른쪽 아래 배지와 "분석했습니다" 말풍선 |
| 확장 팝업 | 걸린 항목과 본문에서 그 대목, 지난 리포트 보관함 |
| 리포트 | 주변 보도를 모아 견준 글과 확인해 볼 곳 |

## 🚀 설치 방법

아직 스토어에 올리기 전이라 **압축해제된 확장 프로그램으로 로드**해서 쓰시면 됩니다.

```bash
git clone https://github.com/sumin0218/GenuEarly.git
cd GenuEarly
npm install                               # 저장소 루트에서 한 번
npm run build -w @genuearly/extension     # → apps/extension/.output/chrome-mv3
```

1. 크롬 주소창에 `chrome://extensions`를 입력해 이동합니다.
2. 우측 상단의 **개발자 모드**를 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다** 버튼을 클릭합니다.
4. `apps/extension/.output/chrome-mv3` 폴더를 선택합니다.
5. 확장 앱을 브라우저에 고정해 두고 쓰시면 더욱 편리합니다.

> ⚠️ 확장 프로그램을 다시 로드해도 **이미 열려 있는 탭에는 반영되지 않습니다.** 페이지를 새로 고쳐 주세요.

수동 테스트 자료로 ①·②까지 확인하시려면 개발 빌드(`-- --mode development`)가 필요합니다.
자세한 절차는 [eval/fixtures/manual-news/README.md](eval/fixtures/manual-news/README.md)에 있습니다.

## 🛠 개발

```bash
npm run dev   -w @genuearly/extension     # 개발 모드 (변경하면 자동 반영)
npm test      -w @genuearly/extension     # 확장 테스트 470건
npm test      -w @genuearly/proxy         # 중계 서버 테스트 127건
npm test      -w @genuearly/shared        # 공용 테스트 142건
```

| 영역 | 쓰는 것 |
| --- | --- |
| **확장 프로그램** | [WXT](https://wxt.dev) 0.21 · TypeScript 5.9 · Vite 8 · Chrome **Manifest V3** |
| **중계 서버** | Cloudflare Workers · Wrangler 4 · TypeScript 5.9 |
| **테스트** | Vitest 5 · happy-dom 21 — 확장 470 · 중계 127 · 공용 142 = **739건** |
| **모노레포** | npm workspaces · commitlint 20 · husky 9 |
| **CI** | GitHub Actions ([lint-pr.yml](.github/workflows/lint-pr.yml)) |
| **AI** | ChatKHU Gateway 경유 — `jev-1.13.0` · `gpt-5.6-luna` · `claude-sonnet-5-5` · `sonar-pro` · `claude-opus-5-5` |

호스트 권한에 와일드카드(`<all_urls>`)를 쓰지 않습니다. 브라우저 권한은 `storage`와 `contextMenus` 둘뿐이고,
그 금지 목록은 문서가 아니라 [테스트](apps/extension/tests/manifest.test.ts)가 지킵니다.

작업 규칙은 [AGENT.md](AGENT.md)와 [CONTRIBUTING.md](CONTRIBUTING.md)를 참고해 주세요.

## 📁 프로젝트 구조

```
GenuEarly/
├── apps/
│   ├── extension/             # 크롬 확장 프로그램 (Manifest V3)
│   │   ├── entrypoints/       # background · content · portal · popup · report
│   │   ├── lib/               # 판단 호출, 캐시, 본문 추출, 보관함, 배지·말풍선
│   │   ├── public/icon/       # 확장 아이콘 (16·32·48·96·128)
│   │   ├── match-patterns.ts  # 호스트 권한의 단일 원본
│   │   └── wxt.config.ts      # manifest.json 을 여기서 생성합니다
│   └── proxy/                 # Jev 중계 서버 — API 키를 들고 있는 유일한 곳
│       └── src/               # 판단, 검색, 글 엮기, 레이트 리밋, 크레딧 감시
├── packages/
│   ├── shared/                # 판단 스키마, 점수 합산, 배지 단계 결정
│   └── content/               # 사용자에게 보이는 문구 (ChatKHU 생성물)
├── eval/                      # 판단 품질 평가
│   ├── data/                  # 평가 세트 — URL 과 라벨만 (본문 커밋 금지)
│   ├── eval-set/              # 세트를 준비하는 스크립트
│   ├── experiments/           # 문장 묶기, 적대적 입력 실험
│   ├── fixtures/manual-news/  # 수동 테스트 기사 45건
│   └── results/               # 측정 결과
├── tools/content-gen/         # 문구 생성 도구 (제품에 배포되지 않습니다)
├── docs/
│   ├── product.md             # 무엇을 왜 만드는가, 판단 항목
│   ├── jev.md                 # Jev 의 한계와 그래서 생긴 설계 규칙
│   ├── ai-log/                # AI 활용 기록 + 출처·라이선스 목록
│   └── security/              # 보안 코딩 규칙, 권한 표
└── .github/                   # PR·이슈 양식, 규칙 검사 워크플로
```

## 🤖 AI 역할 분담

| 주체 | 결과물에서 맡는 것 |
| --- | --- |
| **ChatKHU** (경희대학교 생성형 AI) | 사용자가 읽는 **모든 문구**와 확장 프로그램 아이콘. 생성물이 배포본에 그대로 들어갑니다 |
| **Jev 1.13** (TypeSafe, AI 판단 특화 모델) | 기사·제목·문장에 대한 판단. 실행 중 호출됩니다 |
| **sonar-pro** | 리포트의 주변 기록 검색. **찾기만 하고 판정하지 않습니다** |
| **claude-opus-5-5** | 리포트의 글 엮기. **판정하지 않습니다** |
| **코드** | 점수 합산과 배지 단계 결정, 출처 도메인 확인, 생성물 거르기 |

네 모델 모두 **ChatKHU API 게이트웨이**를 거쳐 부릅니다.

**Jev는 사용자에게 보이는 글을 한 글자도 쓰지 않습니다.** 글을 생성하도록 학습된 모델이 아닙니다 ([docs/jev.md](docs/jev.md) 3절 ⑨).
판단은 Jev가 하고, **사용자에게 하는 말은 ChatKHU가 합니다.**
실행 중에 생성되는 유일한 한국어는 리포트의 요약 문단이고, 그것조차 코드가 그 자리에서 거릅니다.
보내지 않은 문장이나 금지어나 마크업이 섞이면 고치지 않고 **통째로 버리고** 미리 써 둔 문구로 대신합니다.

## 👥 참여 팀원

| 이름 | GitHub | 맡은 것 |
| --- | --- | --- |
| 손수민 | [@sumin0218](https://github.com/sumin0218) | 제품 정의, 확장 프로그램(배지·팝업·목록 표시·선택 검사·리포트), 중계 서버, 문구 생성 파이프라인 |
| 권승원 | [@SeungwonKwon](https://github.com/SeungwonKwon) | 판단 항목 일곱 확정, 점수 합산과 배지 단계, 평가 세트와 라벨링 기준, 프롬프트 인젝션 방어와 검사, 수동 테스트 자료 |

## 🔒 공개 저장소에서 지키는 것

- **Jev API 키는 중계 서버 환경변수에만 둡니다.** 확장 프로그램 번들에는 어떤 형태로도 넣지 않습니다
- **실제 기사 본문을 커밋하지 않습니다.** 평가 세트에는 URL과 라벨만 둡니다
- **가상 평가 기사는 커밋하지 않습니다** (`eval/data/private/`). 공개 요청된 [수동 테스트 기사 45건](eval/fixtures/manual-news/)은 테스트·허구 표시를 포함한 별도 예외입니다

## 🐛 버그 제보 및 기여

Issue와 Pull Request를 통한 제보와 기여는 언제나 환영합니다.

- **버그 제보**: [버그 제보](.github/ISSUE_TEMPLATE/bug-report.yml) 템플릿을 사용해 주세요.
- **판단 결과 이의**: [판단 결과 이의](.github/ISSUE_TEMPLATE/judgment-dispute.yml) 템플릿에 기사 주소와 어느 항목이 왜 틀렸는지 적어 주세요.
- **직접 수정 PR**: 관련 이슈를 먼저 만들고, 변경 후 검증 결과를 PR 본문에 남겨 주세요.

팀 내부 작업은 Jira에서 관리하고, GitHub Issues는 **외부 제보 전용**입니다.
`main`·`develop`에는 직접 push하지 않습니다.

## 🙏 Credits

- **ChatKHU** — 경희대학교 생성형 AI. 사용자에게 보이는 문구와 아이콘을 만들었습니다.
- **Jev** (TypeSafe) — AI 판단 특화 모델. 판단을 맡습니다.
- 출처·권리·라이선스 전체 목록은 [docs/ai-log/sources.md](docs/ai-log/sources.md)에 있습니다.

## 📜 License

This project is licensed under the [MIT License](LICENSE).

```
Copyright (c) 2026 GenuEarly contributors
```

다만 아래는 MIT 적용 대상이 아니거나 조건이 다릅니다.

- **Jev**(TypeSafe)와 **ChatKHU**(경희대)는 각 제공자의 이용 조건을 따릅니다. 이 저장소는 API 키를 포함하지 않습니다
- [수동 테스트 기사 45건](eval/fixtures/manual-news/)은 시험용으로 지어낸 글입니다. **기사가 아니며 인용하지 않습니다**
