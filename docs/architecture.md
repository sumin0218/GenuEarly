# 설계

**어떤 조각이 무엇을 맡고, 그 사이로 무엇이 오가는가.**

- *무엇을 왜 만드는가*는 [product.md](product.md)
- *화면에서 어떻게 보이는가*는 [requirements.md](requirements.md)
- *무엇을 판단하는가*는 [../packages/shared/judgment-items.json](../packages/shared/judgment-items.json)
- 이 문서는 **그 사이를 잇는 층**이다. 코드를 쓰기 전에 여기서 경계를 정한다

---

## 1. 전체 그림

```text
┌─ 사용자 컴퓨터 (크롬) ──────────────────────────────┐
│                                                     │
│   기사 페이지                                        │
│   ┌──────────────────────────┐                      │
│   │ content script           │                      │
│   │  · 본문 추출              │                      │
│   │  · 배지 그리기 (Shadow DOM)│                     │
│   └────────────┬─────────────┘                      │
│                │ chrome.runtime 메시지               │
│   ┌────────────▼─────────────┐                      │
│   │ service worker           │                      │
│   │  · 캐시 (chrome.storage) │                      │
│   │  · 점수 합산 → 배지 단계   │  ← packages/shared   │
│   └────────────┬─────────────┘                      │
└────────────────┼────────────────────────────────────┘
                 │ HTTPS (키 없음)
                 ▼
┌─ Cloudflare Workers ────────────────────────────────┐
│   apps/proxy                          🔑 키는 여기만 │
│    · 요청 출처 검증                                   │
│    · 판단 항목 id 화이트리스트 검증                    │
│    · Jev 요청 조립                                   │
└────────────────┬────────────────────────────────────┘
                 │ HTTPS + ChatKHU 키
                 ▼
┌─ ChatKHU API Gateway ───────────────────────────────┐
│   POST /v1/gateway/decisions/   →   Jev (TypeSafe)  │
└─────────────────────────────────────────────────────┘
```

**Jev 는 우리 것이 아니다.** 우리는 호출만 한다 ([jev.md](jev.md) 6-1절).

---

## 2. 누가 무엇을 맡는가

| 조각 | 맡는 것 | **맡지 않는 것** |
| --- | --- | --- |
| `content script` | 본문 추출, 배지·상세 그리기, 사용자 조작 | 판단, 점수 합산, 네트워크 호출 |
| `service worker` | 캐시, 중계 서버 호출, 점수 합산, 배지 단계 결정 | DOM, 사용자 문구 |
| `apps/proxy` | 키 보관, 항목 id 검증, Jev 요청 조립, 실패 변환 | **점수 합산**, 사용자 문구, 기사 가져오기 |
| `packages/shared` | 판단 항목 정의, 가중치, 임계값, 합산·단계 결정 | DOM, 네트워크, 문구 |
| `packages/content` | 사용자에게 보이는 모든 문구 | 로직 |

### 점수 합산을 서버가 아니라 확장이 하는 이유

[judgment-items.json](../packages/shared/judgment-items.json)이 **언어 중립 JSON**이라 서버는 그 파일을 읽어
**검증과 조립만** 하면 된다. 합산까지 서버로 보내면 서버가 커지고, 커지면 느려지고 더 자주 깨진다.

**단, "얇다"가 "아무거나 통과시킨다"는 뜻은 아니다.** 정의되지 않은 항목 id 를 통과시키면
우리 키로 남이 Jev 에 아무 질문이나 보낼 수 있다.

### content script 와 service worker 를 나누는 이유

- **content script 는 네트워크를 직접 부르지 않는다.** 기사 페이지 안에서 도는 코드라 그 페이지의 CSP 와
  얽히고, 페이지 스크립트와 같은 탭에 있다. 호출은 service worker 가 한다
- **service worker 는 DOM 을 모른다.** MV3 에서 화면이 없다
- 둘 사이는 `chrome.runtime` 메시지로만 오간다. **받는 쪽은 `sender` 를 검증한다**

---

## 3. 데이터 흐름 — 기사 하나

```text
content script          service worker              proxy                gateway
──────────────          ──────────────              ─────                ───────
본문 추출
  │
  ├─ {headline, body} ──▶ 캐시 확인
  │                        │ 있음 ──▶ 결과 반환 ──┐
  │                        │ 없음                 │
  │                        ├─ 요청 그룹으로 나눔    │
  │                        │                      │
  │                        ├─ POST /v1/judge ────▶ 항목 id 검증
  │                        │                       Jev 요청 조립
  │                        │                       ──────────────▶ decisions
  │                        │                       ◀────────────── answers
  │                        │ ◀───── answers ───────┤
  │                        │                      │
  │                        ├─ 점수 합산            │
  │                        ├─ 단계 결정            │
  │                        ├─ 캐시 저장            │
  │ ◀───── 배지 상태 ───────┴──────────────────────┘
  ▼
배지 갱신
```

**요청은 그룹 단위로 나뉜다.** [packages/shared/README.md](../packages/shared/README.md)의 `request_groups`가 원본이다.

| 그룹 | `state` | 왜 나누나 |
| --- | --- | --- |
| `headline_only` | `headline` | 본문 속 인젝션과 context rot 이 제목 판단에 닿지 않게 |
| `headline_body` | `headline`, `body` | |
| `sentence` | `sentence` | 문장마다 한 요청 |

---

## 4. 중계 서버 API

**GE-18 이 구현할 규약이다.** 바꾸면 확장 프로그램도 같은 PR 에서 고친다.

### `GET /health`

살아 있는지만 본다. **키와 설정값을 돌려주지 않는다.**

```json
{ "ok": true, "model": "jev-1.13.0", "paused": false,
  "guards": { "ratelimit": true, "credits": true } }
```

`guards` 는 **두 보호 장치가 켜져 있는지**다. 바인딩이나 설정값이 빠지면 조용히 꺼진 채
돌아가므로 배포 직후 여기서 확인한다.

`paused` 는 **크레딧 예비분 아래로 내려가 판단을 멈췄는지**다 (아래). **잔액 숫자는 밝히지 않는다.**

### `POST /v1/judge`

확장 프로그램 origin 에서만 받는다. CORS 를 `*` 로 열지 않는다.

**요청**

```json
{
  "feature": "page",
  "group": "headline_body",
  "items": ["source_citation", "headline_body_match"],
  "state": { "headline": "…", "body": "…" }
}
```

| 필드 | 규칙 |
| --- | --- |
| `feature` | `page` \| `portal_list` \| `selection`. 항목의 `request_group` 키와 같다 |
| `group` | 요청 그룹 이름. `state` 에 넣을 수 있는 필드를 이게 정한다 |
| `items` | **[judgment-items.json](../packages/shared/judgment-items.json)에 있는 id 만.** 하나라도 없으면 **요청 전체를 거절한다** |
| `items` ↔ `group` ↔ `feature` | **모든 항목에 대해 `request_group[feature] === group` 이어야 한다.** 아니면 거절. `feature` 키가 그 항목에 없어도 거절 (아래) |
| `state` | 그룹이 허용한 필드만. 그 밖의 필드는 **무시가 아니라 거절** |
| `state` ↔ `group` ↔ `feature` | **그룹의 `required[feature]` 필드가 모두 있어야 한다.** 없으면 거절 (아래) |

**왜 교차 검증이 필요한가**

id 가 JSON 에 있는지, state 필드가 그룹에 맞는지만 보면 아래가 통과한다.

| 통과해 버리는 요청 | 무슨 일이 나나 |
| --- | --- |
| `group: "headline_body"` 에 `clickbait_headline` | **제목 판단에 본문이 섞인다.** 본문 속 인젝션과 context rot 이 제목 판단에 닿는다 |
| `group: "headline_only"` 에 `source_citation` | 본문 없이 출처를 묻게 되어 구조적으로 "출처 부재" 가 나온다 |
| `group: "headline_body"` 인데 `state` 에 `body` 가 없음 | **위와 같은 결과다.** 그룹 이름만 맞춰 놓고 필드를 빼면 통과한다. 확장 프로그램이 본문 추출에 실패하고 빈 값 대신 필드를 빼 보내는 버그만으로도 생긴다 |

클라이언트 버그든 위조된 요청이든 서버가 막아야 한다.

**응답 (성공)**

```json
{
  "model": "jev-1.13.0",
  "answers": {
    "source_citation": { "type": "choice", "choice": "unnamed_source",
                         "probabilities": { "…": 0.0 }, "confidence": 0.82 }
  }
}
```

Jev 응답을 **그대로 중계한다.** 서버가 해석하거나 점수로 바꾸지 않는다.

> **`answers` 의 키는 항목 id 가 아니라 질문 id 다.** 대부분 같지만, 한 판단이 질문 여러 개로 나뉜 항목은
> 하위 질문 id 로 온다 — `unverifiable_claim` 을 보내면 `answers.unverifiable_claim` 이 아니라
> **`answers.factual_assertion` 과 `answers.named_basis`** 가 온다.
> 확장 프로그램이 `answers[항목id]` 로만 찾으면 이 항목이 늘 비어 ⚪ 가 된다 (GE-22).

**응답 (판단 보류)**

```json
{ "model": "jev-1.13.0", "undetermined": true, "reason": "rate_limited" }
```

| `reason` | 언제 |
| --- | --- |
| `rate_limited` | 429. 재시도 후에도 실패 |
| `timeout` | |
| `upstream_error` | 게이트웨이 5xx |
| `invalid_answer` | 응답이 정한 보기 밖 |
| `budget_exhausted` | **남은 크레딧이 예비분 아래다.** 아래 |

**`reason` 은 로그와 디버깅용이다. 사용자에게 보여 주지 않는다** ([requirements.md](requirements.md) 2절).

#### 크레딧 예비분 — 스스로 멈춘다

**지키려는 것은 "분당 몇 건" 이 아니라 크레딧 잔액이다.**

게이트웨이 한도(분당 120건)를 끝까지 쓰면 호출당 약 0.081 크레딧 × 120 = 분당 9.7,
**시간당 583** 이다. 월 할당 4,000 이 **약 7시간**이면 사라지고 **다음 달 1일까지 돌아오지 않는다.**
10월 말에 그 일이 나면 제출·심사 기간 내내 판단이 ⚪ 가 되고, 같은 지갑을 쓰는
문구 생성과 아이콘까지 막힌다.

그래서 중계 서버가 `GET {게이트웨이}/credits` 로 잔액을 보고, `CREDITS_RESERVE` 아래면
Jev 를 부르지 않고 `budget_exhausted` 로 돌린다.

- 매 요청마다 묻지 않는다. `CREDITS_TTL_MS`(기본 60초) 동안 캐시한다. 그 사이에 한도껏
  지나가도 약 10 크레딧이라 예비분(기본 500)에 비해 작다
- **잔액을 한 번도 못 읽으면 통과시킨다.** 일시적인 장애로 서비스를 멈추는 것이 목적이 아니다.
  막으려는 것은 지속적인 소진이고, 그건 한 번만 읽히면 잡힌다
- **이것은 레이트 리밋이 아니다.** 악용자가 예비분까지 태우는 것은 막지 못한다.
  막는 것은 **전부 태워서 심사 기간을 잃는 것**이다. 분당 상한은 `apps/proxy/src/ratelimit.ts` 가 맡는다 — 둘이 다른 것을 지킨다. 여기는 **월 예산**, 거기는 **분당 처리량**이다

**응답 (거절)**

| 상태 | 언제 |
| --- | --- |
| `400` | 알 수 없는 항목 id, 그룹에 없는 `state` 필드, 빠진 필수 필드, 크기 초과 |
| `403` | 허용하지 않은 origin |
| `405` | `POST` 가 아님 |
| `429` | **폭주 차단기에 걸림.** `Retry-After` 와 함께 온다 (아래) |

#### 왜 폭주만 `429` 인가 — 다른 실패와 다르다

호출 실패·타임아웃·429(게이트웨이)·보기 밖 응답은 전부 `200` 에 `undetermined` 로 돌아간다.
**우리 차단기만 `429` 다.**

**폭주하는 클라이언트에 `200` 을 주면 그 클라이언트는 아무것도 배우지 않고 계속 때린다.**
`429` 와 `Retry-After` 로 물러서라고 말해야 멈춘다.

확장 프로그램은 `429` 를 **⚪ 로 보이고 `Retry-After` 만큼 쉰다.** 사용자에게는 다른 ⚪ 와 똑같이 보인다.

```json
{ "error": "rate_limited", "scope": "burst" }
```

`scope` 는 `burst`(그 클라이언트가 너무 많이) 또는 `budget`(전체가 너무 많이)이다. 로그용이다.

**막으려는 것은 악의적인 제3자가 아니라 우리 코드다.** 대회 전에는 웹스토어에 올리지 않아
주소를 아는 사람이 우리와 심사위원뿐이다. 반면 확장 프로그램의 재시도 한 줄이나
포털 목록의 `MutationObserver` 가 제가 넣은 요소에 다시 반응하는 것([requirements.md](requirements.md) 4-2절)은
분당 수천 건을 낸다. 잔액 감시는 예비분까지 태운 뒤에야 멈추므로 그 사이에 약 4만 건이 사라질 수 있다.

**Jev 의 원본 에러 본문을 그대로 싣지 않는다.** 키나 내부 정보가 섞여 나올 수 있다 (CWE-209).

---

## 5. ⚪ 는 어디서 결정되는가

**세 곳에서 각각 결정된다.** 한곳에 모으려 하지 않는다 — 아는 정보가 다르다.

| 어디 | 무엇을 보고 |
| --- | --- |
| **proxy** | 호출 실패, 타임아웃, 429, 보기 밖 응답 → `undetermined: true` |
| **packages/shared** | 확신도가 임계값 아래, `combine` 전 "모름" 판정 |
| **content script** | 본문 추출 실패 (요청을 보내지도 않는다) |

확장은 이 셋을 **같은 ⚪ 로 합쳐서** 보여 준다. 사용자에게는 구분이 의미 없다.

---

## 6. 저장

`chrome.storage.local` 을 쓴다. service worker 가 종료돼도 남아야 한다.

| 키 | 값 | 비고 |
| --- | --- | --- |
| `judgment:{sha256(정규화 URL)}` | **항목별 결과**, 만료 시각, 질문 세트 버전, 모델 버전 | **기사 본문도 URL 원문도 넣지 않는다** |
| `consent:feedback` | 피드백 전송 동의 여부 | 기본값 `false` |

### 왜 URL 을 해시로 두나

**URL 과 판단 시각을 그대로 저장하면 캐시가 곧 열람 기록이 된다.**
`chrome.storage.local.get(null)` 한 번이면 *"최근 6시간 동안 읽은 기사와 그 시각"* 목록이 나온다.
[security/secure-coding.md](security/secure-coding.md) 7절이 가장 조심하는 것이다.

- 키는 **정규화한 URL 의 SHA-256** 이다. 찾을 때 같은 해시로 찾으므로 기능은 같다
- **판단 시각 대신 만료 시각만** 둔다. 언제 읽었는지가 남지 않는다
- **URL 을 정규화하고 해시한다.** `sid`·`utm_*` 같은 쿼리와 `mnews/article` 같은 경로 차이를 정리하지
  않으면 같은 기사가 여러 키로 갈라져 캐시가 잘 먹지 않는다

> **TODO**: 정규화 규칙(지울 쿼리 파라미터, 경로 정리)을 정한다. 네이버·다음 주소를 보고 정한다.

### 항목 단위로 쌓는다

**기사 단위가 아니다.** ②는 제목만 보는 항목만 판단하는데, 그것을 기사 단위로 캐시하면
①이 "캐시 있음"으로 보고 본문 판단을 건너뛴다 ([requirements.md](requirements.md) 3-6절).

- 값에 **항목별 결과**를 담는다
- ①은 **없는 항목만** 요청하고, ②가 채운 항목은 재사용한다
- **①에 필요한 항목이 모두 있을 때만** "캐시 있음"이다

### 그 밖

- **버전을 함께 저장한다.** 질문 세트나 모델이 바뀌면 옛 캐시는 버린다. 다른 기준으로 낸 판단이다
- **열람 기록을 이어 붙일 수 있는 형태로 두지 않는다.** 캐시는 해시로 찾는 사전이지 방문 목록이 아니다

> **TODO**: 용량 상한과 오래된 항목을 비우는 규칙.

---

## 7. 신뢰 경계

**경계를 넘는 모든 것은 검증한다.**

```text
기사 페이지 (남이 쓴 것)
   │  ← 여기 글은 전부 신뢰할 수 없다
   ▼
content script
   │  ← sender 검증
   ▼
service worker
   │  ← origin 검증, 항목 id 화이트리스트
   ▼
proxy (🔑)
   │  ← state 는 데이터로만. instructions 에 이어 붙이지 않는다
   ▼
Jev
```

| 경계 | 무엇을 막나 |
| --- | --- |
| 기사 → content script | 기사 글을 DOM 에 넣을 때 `textContent` 만. `innerHTML` 금지 |
| content script → worker | `chrome.runtime.onMessage` 에서 `sender` 검증 |
| 확장 → proxy | origin 검증. 우리 확장만 |
| proxy → Jev | 항목 id 화이트리스트. 임의 프롬프트 차단 |
| 기사 글 → Jev | `state` 필드에만. `instructions`·`criteria` 에 이어 붙이지 않는다 ([jev.md](jev.md) 3절 ⑥) |

자세한 규칙은 [security/secure-coding.md](security/secure-coding.md)에 있다.

---

## 8. 모듈 구조

```text
apps/extension/
  entrypoints/
    content.ts        기사 페이지. 추출 + 배지
    background.ts     service worker. 캐시 + 호출 + 합산
  match-patterns.ts   대상 페이지 목록 (원본)

apps/proxy/
  src/index.ts        fetch 핸들러. 검증 + 중계

packages/shared/
  judgment-items.json 판단 항목 정의 (원본, 언어 중립)
  src/scoring*.ts     점수 합산, 단계 결정 (숫자는 scoring-config.ts 한 곳)

packages/content/
  (TODO GE-16)        사용자 문구
```

### 의존 방향

```text
content script  ──▶  packages/content   (문구)
service worker  ──▶  packages/shared    (합산)
                ──▶  apps/proxy         (HTTP)
apps/proxy      ──▶  judgment-items.json (검증)
```

**거꾸로 가는 의존이 없어야 한다.** `packages/shared` 가 DOM 이나 `chrome.*` 을 부르면 잘못된 것이다.

---

## 9. 아직 정하지 않은 것

| 무엇 | 언제 정하나 |
| --- | --- |
| 가중치·확신도 임계값·점수 경계 | eval 측정 후 (GE-17) |
| 네이버·다음 선택자 | GE-22, GE-23 |
| 캐시 용량 상한 | 실제 사용량을 보고 |
| 피드백 저장소 | GE-26 |
| **대회 이후** 일반 배포 때의 Jev 경로 | v1.0.0 은 **ChatKHU Gateway 로 확정**했다 (2026-10-21, GE-11). 다만 이용 조건이 "대회 결과물 단계"까지라 배포를 결정하면 다시 확인한다 ([jev.md](jev.md) 6-1절) |
