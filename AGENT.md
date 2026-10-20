# GenuEarly

기사를 읽는 순간과 공유하려는 순간에 '주의가 필요한 신호'를 알려 주는 크롬 확장 프로그램(Manifest V3).
2026 KHU AI Challenge 출품작.

AI 코딩 도구(Claude Code, Codex, Cursor 등)와 사람이 공통으로 읽는 작업 지침이다.
영역별 세부 규칙은 각 디렉터리의 `AGENT.md`에 있다.

## 이 프로젝트가 하지 않는 것

이것을 어기면 제품의 전제가 무너진다. 코드와 문구 모두에 적용된다.

- **진위를 단정하지 않는다.** "가짜 뉴스", "허위", "거짓" 같은 단정적 표현을 사용자에게 보이는 문구에 쓰지 않는다. 우리가 말하는 것은 '주의가 필요한 신호'다
- **공유를 막지 않는다.** 공유 직전 알림은 알림이다. 버튼을 가리거나 동작을 취소하지 않는다
- **모르면 모른다고 한다.** 확신도가 낮거나 호출이 실패하면 ⚪ 판단 보류다. 추측해서 🟢이나 🔴을 내지 않는다
- **사용자 동의 없이 아무것도 보내지 않는다.** 오판 피드백은 사용자가 동의한 경우에만 전송한다

## 구조

모노레포. 현재 상태·일정은 [README.md](README.md)가 진입점이다.

```
apps/extension/    크롬 확장 프로그램 (MV3) — 기술 스택 미정
apps/proxy/        Jev 중계 서버. API 키를 들고 있는 유일한 곳 — Cloudflare Workers
packages/shared/   판단 스키마, 점수 합산, 배지 단계 결정
packages/content/  사용자에게 보이는 문구
eval/              판단 품질 평가 세트와 결과. 기사 본문은 두지 않는다
tools/             개발할 때만 쓰는 도구. 제품에 배포되지 않는다
docs/              제품 정의, Jev 정리, 컨벤션, 보안, AI 활용 기록, 제출 서류
.github/           PR·이슈 양식, 규칙 검사 워크플로
```

## 기술 스택

| 영역 | 스택 |
| --- | --- |
| 확장 프로그램 | **WXT + TypeScript + Vite**, 테스트는 Vitest ([apps/extension/AGENT.md](apps/extension/AGENT.md)) |
| 패키지 매니저 | **npm 워크스페이스** (`apps/*`, `packages/*`) |
| 중계 서버 | **Cloudflare Workers + TypeScript**, 프레임워크 없음 ([apps/proxy/AGENT.md](apps/proxy/AGENT.md)) |

- 스택을 바꾸는 것은 그 자체로 하나의 작업이다. 다른 기능 PR에 끼워 넣지 않는다
- 바꾸면 [README.md](README.md)의 구조 표, 이 파일, 해당 앱의 `AGENT.md`, [docs/conventions/code-style.md](docs/conventions/code-style.md)의 "스택별 규칙"을 같은 PR에서 갱신한다

### 점수 합산은 확장 프로그램이 한다

`packages/shared`의 [judgment-items.json](packages/shared/judgment-items.json)은 **언어에 묶이지 않는 JSON**이다.
중계 서버는 이 파일을 읽어 **항목 id 를 검증**하고 Jev 요청을 만든다. **점수 합산과 배지 단계 결정은
확장 프로그램이 한다.**

서버를 얇게 둔 이유는 코드가 적을수록 빨리 끝나고 덜 깨지기 때문이다. 다만 **"얇다"가 "아무거나 통과시킨다"는
뜻은 아니다.** 정의되지 않은 항목 id 를 통과시키면 우리 키로 남이 Jev 를 쓰는 셈이 된다.

루트의 `package.json`은 **커밋 메시지 검사 도구(commitlint, husky)와 워크스페이스 연결 전용**이다.
여기에 앱 의존성을 추가하지 않는다.

## 작업 전에 읽을 문서

| 하려는 일 | 읽을 것 |
| --- | --- |
| 모든 코드 작업 (필수) | [docs/security/secure-coding.md](docs/security/secure-coding.md) |
| 판단 기준·프롬프트·점수 변경 | [docs/jev.md](docs/jev.md), [docs/product.md](docs/product.md) |
| 사용자에게 보이는 문구 작성 | [docs/product.md](docs/product.md) |
| 코드 스타일·네이밍 | [docs/conventions/code-style.md](docs/conventions/code-style.md) |
| 커밋·브랜치·PR·Jira | [CONTRIBUTING.md](CONTRIBUTING.md) |
| AI 활용 기록 남기기 | [docs/ai-log/README.md](docs/ai-log/README.md) |

코드 변경으로 권한, 판단 기준, 보내는 데이터, 사용자 문구가 달라지면 **같은 PR에서 관련 문서도 갱신한다.**

## 영역별 규칙

| 영역 | 규칙 |
| --- | --- |
| 확장 프로그램 | [apps/extension/AGENT.md](apps/extension/AGENT.md) |
| 중계 서버 | [apps/proxy/AGENT.md](apps/proxy/AGENT.md) |

## 크롬 확장 프로그램(MV3) 전역 규칙

스택과 무관하게 MV3라는 전제에서 나오는 규칙이다. 자세한 근거는 [보안 문서](docs/security/secure-coding.md)에 있다.

- **권한은 최소로.** `manifest.json`에 권한을 추가하는 PR은 "이 권한 없이는 안 되는 이유"를 본문에 적는다. `<all_urls>`를 쓰지 않는다
- **원격 코드를 실행하지 않는다.** MV3가 금지하고, 심사에서도 거절 사유가 된다. 외부 스크립트 로드, `eval`, 문자열 실행 금지
- **`innerHTML`을 쓰지 않는다.** 기사 페이지의 텍스트를 DOM에 넣을 때 `textContent`와 `createElement`만 쓴다. `outerHTML`, `insertAdjacentHTML`도 같다
- **주입하는 UI는 Shadow DOM 안에 둔다.** 페이지 스타일이 우리 배지를 망가뜨리거나, 우리 스타일이 기사 화면을 망가뜨리는 일을 막는다
- **service worker의 상태는 휘발한다.** MV3 service worker는 수시로 종료된다. 전역 변수에 캐시나 진행 상태를 두지 않는다. 남겨야 하면 스토리지에 쓴다
- **메시지는 출처를 검증한다.** `chrome.runtime.onMessage`에서 `sender`를, `window.postMessage`에서 `event.origin`과 `event.source`를 확인한다. 페이지 스크립트는 신뢰할 수 없는 입력이다

## 전역 금지

- Jev API 키를 확장 프로그램 코드, 매니페스트, 스토리지, 로그, 커밋 메시지에 넣지 않는다. **키는 중계 서버 환경변수에만 둔다**
- `.env`를 커밋하지 않는다. 변수 이름은 `apps/proxy/.env.example`에 값 없이 적는다
- 실제 기사 본문을 저장소에 커밋하지 않는다. 평가 세트에는 URL과 라벨만 둔다
- 테스트용으로 만든 가상의 가짜 기사를 커밋하지 않는다 (`eval/data/private/`)
- 서명이 들어간 제출 서류를 커밋하지 않는다 (`docs/submission/signed/`)
- `main`·`develop`에 직접 push하지 않는다
- 판단 기준이 문서에 없으면 추측해서 구현하지 말고 먼저 물어본다
- Jev의 답을 그대로 사용자 문구로 쓰지 않는다. 문구는 [packages/content](packages/content/)에 미리 적어 둔 것을 쓴다

## PR을 올릴 때

- 일반 작업은 `develop`에서 분기해 `develop`으로 PR을 보낸다. `main`에는 `release/vX.Y.Z`만 PR을 보낸다
- 브랜치 이름은 `{type}/GE-{번호}-{kebab-slug}`다. Jira 연결은 브랜치 이름이 한다
- 제목은 `type: 한글 설명` (예: `feat: 기사 배지 4단계 표시 구현`). scope, 이슈 번호, Jira 키를 제목에 넣지 않는다
- 본문의 Jira 칸에 이슈 키를 적는다
- **PR 작성자는 모든 변경을 본인이 설명할 수 있어야 한다.** AI가 만든 코드도 마찬가지다

## AI 도구 사용 규칙

- AI 도구에 API 키, `.env` 내용, 실제 사용자 데이터를 입력하지 않는다
- 외부 패키지를 추가할 때 이름을 반드시 확인한다 (타이포스쿼팅, 존재하지 않는 패키지 제안 주의)
- **ChatKHU가 기본 도구다.** 대회 필수 도구이므로 판단 기준 설계와 사용자 문구 작성은 ChatKHU로 한다. 다른 도구를 쓸 때는 그 사유를 [docs/ai-log/](docs/ai-log/)에 남긴다
- 판단 기준, 프롬프트, 사용자 문구를 AI로 만들었다면 [docs/ai-log/](docs/ai-log/)에 기록한다. 대회 서식4(AI 활용 과정 설명서)의 증빙이 된다

## 코드 리뷰 규칙

- 모든 리뷰 코멘트와 요약은 한국어로 작성한다
- 코드 식별자, 파일 경로, 로그, 오류 메시지는 원문을 유지한다
- 다음을 우선 확인한다
  1. 확장 프로그램 보안 — 과도한 권한, 원격 코드, `innerHTML`, 메시지 출처 미검증, 키 노출
  2. 개인정보 — 기사 본문이나 열람 기록이 동의 없이 서버로 가지 않는지
  3. 제품 전제 위반 — 단정적 문구, 공유 차단, 확신도 낮은데 단계를 단정
  4. service worker 종료 후에도 동작하는지
- 동작이 바뀌었는데 테스트가 없으면 지적한다
- 단순 스타일이나 포매팅은 리뷰하지 않는다 (린터 몫)
