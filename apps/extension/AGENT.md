# apps/extension

크롬 확장 프로그램 (Manifest V3). 사용자가 직접 보고 쓰는 부분 전부.

루트 규칙이 먼저다: [../../AGENT.md](../../AGENT.md), [../../docs/security/secure-coding.md](../../docs/security/secure-coding.md).
이 문서는 확장 프로그램에만 해당하는 규칙이다.

## 기술 스택

| | |
| --- | --- |
| 프레임워크 | [WXT](https://wxt.dev) 0.21.x — MV3 확장 전용. Vite 기반 |
| 언어 | TypeScript. **타입을 꼭 쓰지 않아도 된다** — 평범한 JS를 `.ts` 파일에 써도 빌드된다 |
| 테스트 | Vitest |
| 패키지 매니저 | npm 워크스페이스 (저장소 루트에서 `npm install`) |

```bash
npm run dev     # 개발 모드
npm run build   # .output/chrome-mv3 생성
npm run zip     # 배포용 zip (제출에 쓴다)
npm test        # 테스트
npm run compile # 타입 검사만 (빌드를 막지 않는다)
```

빌드 결과를 크롬에 올리려면 `chrome://extensions` → 개발자 모드 → **압축해제된 확장 프로그램을 로드** → `.output/chrome-mv3`.

### WXT를 쓰면서 알아야 할 것

- **`manifest.json` 파일은 없다.** [`wxt.config.ts`](wxt.config.ts)에서 생성된다. 결과물은 `.output/chrome-mv3/manifest.json`에서 확인한다
- **`entrypoints/` 안의 파일은 전부 엔트리포인트**가 된다. CSS나 헬퍼를 여기 두면 안 된다 — `assets/`나 `components/`에 둔다
- **auto-import가 켜져 있다.** `defineContentScript`, `defineBackground`, `createShadowRootUi`, `browser`는 import 없이 쓴다. WXT 공식 문서 예제가 전부 그렇게 되어 있다
- **Shadow DOM은 `createShadowRootUi`로 만든다.** 직접 만들지 않는다. CSS는 `assets/`에서 import하고 엔트리포인트에 `cssInjectionMode: 'ui'`를 준다
- 파이어폭스는 지원하지 않는다. `web-ext`를 일부러 설치하지 않았다 (취약점이 딸려 온다)

### 권한은 테스트가 지킨다

[`tests/manifest.test.ts`](tests/manifest.test.ts)가 금지 권한, `<all_urls>`, 와일드카드 호스트를 막는다.
권한 표([../../docs/security/secure-coding.md](../../docs/security/secure-coding.md) 2절)를 고치면 이 테스트도 같이 본다.

## 맡는 일

| 기능 | 내용 |
| --- | --- |
| ① 기사 자동 검사 | 기사 페이지에 배지를 띄운다 (🟢 🟡 🔴 ⚪) |
| ② 포털 목록 일괄 검사 | 네이버·다음 뉴스 목록의 제목을 병렬로 판단 |
| ③ 선택 텍스트 검사 | 오른쪽 클릭 메뉴 |
| ④ 공유 직전 알림 | 주의 기사를 복사·공유할 때 알림. **막지 않는다** |
| ⑤ 오판 피드백 | **동의한 경우에만** 전송 |

기능의 정의는 [../../docs/product.md](../../docs/product.md) 3절이 원본이다.

## 맡지 않는 일

- **API 키를 모른다.** Jev를 직접 부르지 않는다. [../proxy](../proxy/)에만 요청한다
- **판단 로직의 원본을 두지 않는다.** 점수 합산과 단계 결정은 [../../packages/shared](../../packages/shared/)에 있다
- **문구를 코드에 직접 쓰지 않는다.** [../../packages/content](../../packages/content/)에서 가져온다

## 권한

권한 표의 원본은 [../../docs/security/secure-coding.md](../../docs/security/secure-coding.md) 2절이다.
`manifest.json`을 고치면 그 표를 같은 PR에서 고치고, PR 본문의 "권한 변경" 칸을 채운다.

- `<all_urls>`, `tabs`, `webRequest`, `cookies`, `history`를 쓰지 않는다
- `host_permissions`에 와일드카드 도메인을 쓰지 않는다. 호스트를 적는다
- 기능이 사라지면 권한도 같은 PR에서 뺀다

## DOM 주입

기사 페이지는 **남이 쓴 코드**다. 우리 배지가 그 안에서 돈다.

- **`innerHTML`을 쓰지 않는다.** `outerHTML`, `insertAdjacentHTML`, `document.write`도 같다
- 텍스트는 `textContent`, 요소는 `createElement`로 만든다
- 기사 제목을 우리 UI에 보여 줄 때도 예외 없다. 제목에 `<img onerror=...>`가 들어 있을 수 있다
- **주입하는 UI는 Shadow DOM 안에 둔다.** `mode: 'closed'`를 기본으로 한다
  - 페이지 CSS가 우리 배지를 깨뜨리지 못하게
  - 우리 CSS가 기사 화면을 깨뜨리지 못하게
  - 페이지 스크립트가 우리 DOM을 건드리지 못하게
- 페이지의 DOM을 **고치지 않는다.** 우리 요소를 **더할** 뿐이다. 기사 본문의 구조를 바꾸면 그 사이트가 깨진다
- 포털은 목록을 동적으로 다시 그린다. `MutationObserver`를 쓰되 우리가 넣은 요소에 다시 반응해 무한 루프가 돌지 않게 한다

## service worker

MV3의 background는 **수시로 종료된다.** 켜져 있다고 가정하지 않는다.

- **전역 변수에 상태를 두지 않는다.** 캐시, 진행 중인 작업, 설정은 `chrome.storage`에 쓴다
- 작업 중간에 꺼질 수 있다. 다시 켜졌을 때 처음부터 할 수 있게 만든다
- `setTimeout`으로 긴 작업을 걸지 않는다. 필요하면 `chrome.alarms`
- 캐시에는 URL과 판단 결과까지만. **기사 본문을 쌓지 않는다.** 만료 시간을 둔다

## 메시지

- `chrome.runtime.onMessage`에서 **`sender`를 검증한다**
- `window.postMessage`를 받을 때 **`event.origin`과 `event.source`를 둘 다 확인한다**
- `window.postMessage`로 보낼 때 targetOrigin에 `*`를 쓰지 않는다
- **`externally_connectable`을 쓰지 않는다**
- content script가 페이지에서 읽은 값은 **전부 신뢰할 수 없는 입력**이다

## 중계 서버로 보내는 것

- 판단에 필요한 텍스트만 보낸다. 광고, 댓글, 추천 기사를 **보내기 전에 걷어낸다** ([../../docs/jev.md](../../docs/jev.md) 3절 ⑤)
- 사용자를 식별할 수 있는 값을 만들지 않는다
- 열람 기록을 이어 붙일 수 있는 형태로 보내지 않는다
- **피드백은 사용자가 동의한 경우에만.** 기본값은 보내지 않는 것이고, 무엇을 보내는지 보여 주고 동의를 받는다

## UI 규칙

문구의 원본은 [../../packages/content](../../packages/content/), 제품 전제는 [../../docs/product.md](../../docs/product.md) 2절이다.

- **단정하는 문구를 쓰지 않는다.** "가짜 뉴스", "허위", "거짓" 금지
- **⚪는 오류 화면이 아니다.** 결과의 한 종류로 보여 준다. "판단하지 않았습니다"이지 "실패했습니다"가 아니다
- **점수를 숫자로 보여 주지 않는다.** 정밀해 보이는 숫자는 단정으로 읽힌다
- **④ 공유 알림은 공유를 막지 않는다.** 버튼을 가리거나 동작을 취소하지 않는다. 닫으면 그만이다
- 판단이 끝나기 전에 배지 자리를 미리 잡아 둔다. 늦게 끼어들면 읽던 화면이 밀린다
- 기사 화면을 가리지 않는다

## 테스트

- 실패 경로를 먼저 테스트한다 — 호출 실패, 확신도 낮음, 429, 보기 밖의 응답. 전부 ⚪여야 한다
- service worker가 꺼졌다 켜진 뒤에도 동작하는지 확인한다
- 포털 목록이 동적으로 바뀔 때 배지가 중복으로 붙지 않는지 확인한다

> **TODO: 수동 확인용 시나리오 목록** — 시연 전에 매번 돌릴 체크리스트를 만든다.
