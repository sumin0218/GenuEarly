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
{ "ok": true, "model": "jev-1.13.0" }
```

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
| `state` | 그룹이 허용한 필드만. 그 밖의 필드는 **무시가 아니라 거절** |

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

**`reason` 은 로그와 디버깅용이다. 사용자에게 보여 주지 않는다** ([requirements.md](requirements.md) 2절).

**응답 (거절)**

| 상태 | 언제 |
| --- | --- |
| `400` | 알 수 없는 항목 id, 그룹에 없는 `state` 필드, 크기 초과 |
| `403` | 허용하지 않은 origin |
| `405` | `POST` 가 아님 |

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
| `judgment:{url}` | 배지 단계, 항목별 결과, 판단 시각, 질문 세트 버전, 모델 버전 | **기사 본문을 넣지 않는다.** 6시간 뒤 만료 |
| `consent:feedback` | 피드백 전송 동의 여부 | 기본값 `false` |

- **버전을 함께 저장한다.** 질문 세트나 모델이 바뀌면 옛 캐시는 버린다. 다른 기준으로 낸 판단이다
- **열람 기록을 이어 붙일 수 있는 형태로 두지 않는다.** 캐시는 URL 로 찾는 사전이지 방문 목록이 아니다

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
  (TODO GE-15)        점수 합산, 단계 결정

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
| 런타임 Jev 경로를 TypeSafe 직접으로 바꿀지 | ChatKHU 이용 조건 확인 후 (GE-11) |
