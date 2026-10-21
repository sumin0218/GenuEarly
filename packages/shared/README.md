# packages/shared

**판단의 원본이 사는 곳이다.** 판단 항목 정의, Jev 질문의 보기와 그 순서, 가중치, 확신도 임계값, 점수 합산, 배지 단계 결정.

**`judgment-items.json` 은 언어 중립 JSON.** 점수 합산 코드는 TypeScript 로 넣는다 (GE-15).

## 왜 따로 두는가

판단 로직이 확장 프로그램과 중계 서버 양쪽에 복사되면, 둘이 서서히 달라지고 어느 쪽이 맞는지 알 수 없게 된다.
**원본은 여기 하나다.**

- 브라우저와 서버 양쪽에서 돈다고 보고 쓴다. 특정 런타임에만 있는 API에 기대지 않는다
- DOM 코드, 브라우저 API, 네트워크 호출을 넣지 않는다
- 사용자에게 보이는 문구를 넣지 않는다 ([../content](../content/)의 몫이다)

## 여기 들어갈 것

| 내용 | 어디에 | 근거 문서 |
| --- | --- | --- |
| 판단 항목 이름과 질문 유형 | [judgment-items.json](judgment-items.json) | [../../docs/product.md](../../docs/product.md) 4절 |
| 각 항목의 `instructions`와 `criteria` | [judgment-items.json](judgment-items.json) | [../../docs/jev.md](../../docs/jev.md) 3절 |
| Choice의 보기와 **그 순서**, Score의 등급 | [judgment-items.json](judgment-items.json) | [../../docs/jev.md](../../docs/jev.md) 3절 ⑧ |
| 항목별 가중치 | TODO — eval 측정 후 | |
| 확신도 임계값 | TODO — eval 측정 후 | |
| 점수 합산과 배지 단계 경계 | TODO — eval 측정 후 | |
| 출처 도메인 목록과 대조 규칙 | TODO | |

## 판단 항목 정의 — `judgment-items.json`

Jev에 보내는 질문의 원본이다. 스택이 정해지지 않아 **언어에 묶이지 않는 JSON**으로 두었다.
확장 프로그램과 중계 서버는 이 파일을 읽어 질문을 만든다. 코드에 같은 문장을 다시 적지 않는다.

| 필드 | 뜻 |
| --- | --- |
| `version` | 질문 세트의 버전. 문구·보기·순서를 고치면 올리고, 로그와 eval 결과에 함께 남긴다. 머지 전 초안에는 버전을 붙이지 않는다 |
| `model` | 이 질문을 맞춘 Jev 버전. [../../docs/jev.md](../../docs/jev.md) 6절의 버전 고정 규칙을 따른다 |
| `state_fields` | `state`에 넣을 수 있는 필드와 그 안에 들어갈 글. 기사 글은 **여기에만** 들어간다 |
| `common_instructions` | 모든 질문의 `instructions` 뒤에 줄바꿈으로 붙이는 공통 문장. 적대적 입력 대응이다 ([../../docs/jev.md](../../docs/jev.md) 3절 ⑥) |
| `request_groups` | 요청을 나누는 단위. **요청의 `state`에 넣는 필드는 그룹의 `state_fields`만 정한다.** 같은 그룹의 질문만 한 요청에 묶는다 (아래) |
| `request_groups.*.required` | **기능별로 `state`에 반드시 있어야 하는 필드.** 없으면 거절한다. "그룹이 허용한 필드만" 을 보는 것만으로는 **필드를 빼서 보내는 우회**를 막지 못한다 — `headline_body` 그룹에 `headline` 만 넣어 `source_citation` 을 보내면 본문 없이 출처를 묻게 되어 구조적으로 "출처 부재"(주의)가 나온다. ③ 선택 텍스트는 `headline` 없이 이 그룹을 쓰므로 기능마다 다르게 둔다 |
| `request_groups.headline_body.min_body_chars` | 기능별 본문 최소 글자 수. 본문이 이보다 짧으면 `headline_body` 요청을 보내지 않는다. ① 포토·단신 기사와 ③ 한두 문장 선택은 길이가 달라 따로 둔다. 값은 eval 후에 정한다 (`null`은 미정) |
| `request_groups.headline_body.short_body_fallback` | 본문이 짧아 `headline_body` 요청을 건너뛸 때, 항목의 `request_group`에서 이 기능(`portal_list`)의 그룹을 대신 쓴다 |
| `items[].unit` | `article`은 기사 하나에 질문 하나, `sentence`는 문장마다 요청 하나(질문은 `questions` 수만큼) |
| `items[].request_group` | 기능별로 이 질문이 들어갈 요청 그룹. 키가 쓰는 기능이다: `page` ① 기사 자동 검사, `portal_list` ② 포털 목록, `selection` ③ 선택 텍스트. 키가 없는 기능에서는 이 질문을 보내지 않는다 |
| `items[].basis_fields` | 이 질문이 판단 근거로 삼는 필드. `instructions`가 이름으로 가리키는 필드다. `state` 구성에는 쓰지 않는다 |
| `items[].question` | **Jev API의 `questions` 값 그대로다.** 아래 `question` 절을 본다 |
| `items[].signals` | 보기 이름 → 방향. `caution` 주의, `neutral` 중간, `clear` 안심. Choice에만 있다. **점수 합산과 eval은 순서가 아니라 이 값을 읽는다** |
| `items[].questions` | 판단 하나를 Jev 질문 여러 개로 나눈 항목의 질문들. 각 원소가 `id`와 `question`을 갖는다 |
| `items[].combine` | 질문별 확률을 합치는 방법. `op`가 연산이고 `formula`는 사람이 읽는 설명이다. `and_not`은 `P(a = 예) × (1 − P(b = 예))`다 |
| `items[].undetermined_band` | 확률이 이 구간 안이면 그 질문은 "모름"이다. `[0.4, 0.6]` 같은 값을 eval 후에 넣는다 (`null`은 미정) |

### `question` — Jev API 형식을 그대로 쓴다

`question` 객체가 Jev `POST /decisions/` 요청의 `questions[<항목 id>]` 값이 된다.
**코드가 하는 일은 하나뿐이다. `instructions` 뒤에 `common_instructions`를 줄바꿈으로 붙인다.** 그 밖에는 손대지 않는다.

우리 쪽 형식을 따로 만들고 변환하지 않는다. 변환 계층이 있으면 API가 바뀌었을 때 어디가 틀렸는지 찾기 어렵다.
실제로 1.0.0의 `options`·`grades`는 **API에 없는 필드**였고, 모든 요청이 400으로 돌아왔다.

유형마다 `criteria`의 모양이 다르다. 이것은 API가 정한 것이다.

| 유형 | `criteria` | 답 |
| --- | --- | --- |
| `choice` | **객체** `{보기이름: 설명}` (1~255개) | `choice` 보기 이름, `probabilities`, `confidence` |
| `score` | **배열** (1~10개). 자리가 곧 점수, 낮은 등급부터 | `score` 숫자, `legend`, `probabilities`, `confidence` |
| `noul` | **객체, 키는 `true`와 `false`뿐** | `noul` 하나. **`confidence`도 `probabilities`도 없다** |

- Choice 보기 설명은 `criteria` 안에 있다. **보기별 판별 기준을 그 설명에 함께 적고**, 보기를 가리지 않는 일반 규칙만 `instructions`에 둔다
- **객체 키의 순서가 보내는 순서다.** JSON 객체의 키 순서는 `JSON.parse`와 `JSON.stringify`를 거쳐도 유지된다
  - **단, 보기 이름을 숫자로만 짓지 않는다.** JavaScript 는 `"0"`, `"2"`, `"10"` 같은 **정수 모양 키를 다른 키보다 앞으로, 숫자 순서로** 옮긴다.
    `{"named_source":1,"10":2,"no_source":3,"2":4}` 를 `JSON.parse` 하면 키 순서가 `2, 10, named_source, no_source` 가 된다.
    지금 보기 이름은 전부 영단어라 괜찮지만, 숫자 이름을 쓰면 **보내는 순서가 조용히 바뀐다** (3절 ⑧의 순서 편향과 직결)
- `instructions`는 문자열·객체·배열을 다 받지만 우리는 문자열로 통일한다

#### 답의 범위 — 2026-10-21 실제 호출로 확인

문서에 적혀 있지 않아 직접 재 보았다. **둘 다 0~1이 아니다.**

- **Score는 0부터 (등급 수 − 1)까지다.** `legend`의 키가 `"0"`부터 시작하고, `score`는 등급 번호를 확률로 가중평균한 값이다.
  등급 4개짜리 `emotional_language`가 `probabilities {0: 0, 1: 0.32, 2: 0.60, 3: 0.08}`에 `score: 1.75`를 돌려줬다 (가중평균 1.76).
  **점수 합산 코드는 등급 수가 다른 항목을 섞기 전에 `(등급 수 − 1)`로 나눠 맞춰야 한다** (GE-15).
- **Noul은 "예"일 확률 하나뿐이다.** `{"type": "noul", "noul": 0.63}` — `confidence`도 `probabilities`도 오지 않는다.
  `combine`의 `P(a = 예)`가 곧 이 값이고, `undetermined_band`도 이 값에 건다. Choice·Score처럼 `confidence`를 따로 볼 수 없다

### `combine`과 ⚪ — 판정 순서

곱한 값은 "0.5에서의 거리"라는 확신도의 뜻을 잃는다. 둘 다 0.5(모름)면 곱이 0.25라 확신한 것처럼 보인다.
그래서 `combine` 전에 아래 순서로 판정한다. `and_not` 기준이다.

1. `a`가 "모름" 밖의 아니오이거나 `b`가 "모름" 밖의 예면 → 결과는 0이다. 다른 질문은 보지 않는다 (의견 문장, 실명 출처가 있는 문장)
2. 그 밖에 하나라도 "모름"이면 → 그 문장은 ⚪
3. 둘 다 "모름" 밖이면 → `combine` 값을 쓴다

이 순서는 `op`에 딸린 규칙이라 코드가 `op`별로 구현한다. **`combine`과 `undetermined_band`의 값(질문 id, 구간)은 JSON에서 읽고, 판정 순서만 코드에 둔다.**

### 요청을 나누는 방법

[../../docs/jev.md](../../docs/jev.md) 3절 ⑤("질문마다 필요한 필드만 넣는다. 제목 판단에 본문 전체를 같이 보내지 않는다")와
6절("기사 하나의 판단 항목들을 요청 하나에 묶는 것이 유리하다")이 서로 당긴다. **⑤를 우선한다.**

| 그룹 | `state` | 들어가는 질문 |
| --- | --- | --- |
| `headline_only` | `headline` | `clickbait_headline`, ② 포털 목록의 `spread_inducement` |
| `headline_body` | `headline`, `body` | 제목과 본문을 보는 나머지 항목. 본문이 짧으면 건너뛴다 (아래) |
| `sentence` | `sentence` | `unverifiable_claim`의 두 질문. 문장마다 한 요청 |

- 제목만 보는 질문은 본문과 섞지 않는다. 본문 속 인젝션과 context rot이 제목 판단에 닿지 않게 하기 위해서다
- `headline_body` 그룹에는 본문만 보는 질문(`source_citation`, `ai_style_signal`)도 있다. 이 질문들은 `instructions`에서 `body` 필드를 이름으로 가리키고, 공통 `criteria`가 판단 근거를 가리킨 필드로 한정한다
- 기능마다 어느 그룹으로 갈지는 각 항목의 `request_group`에 적혀 있다. 확장 프로그램과 중계 서버는 이 값만 읽고, 예외를 코드에 따로 적지 않는다
- **본문이 짧으면** (포토·영상 기사, 단신) `headline_body` 요청을 보내지 않는다. 짧은 본문에서는 `source_citation`이 구조적으로 "출처 부재"가 되고 `ai_style_signal`은 판단할 글이 부족하다
  - 그 그룹의 항목 중 `request_group`에 `portal_list` 값이 있는 것(`spread_inducement`)은 그 그룹(`headline_only`)으로 보낸다. 같은 기사의 판단이 ② 목록과 ① 기사 화면에서 달라지지 않게 하기 위해서다
  - 나머지 항목은 ⚪다
- ③ 선택 텍스트는 고른 글을 `body`에 넣는다. 고른 글은 보통 한두 문장이라 `min_body_chars.selection`을 ①과 따로 둔다. 같은 이유로 출처가 고른 글 밖에 있기 쉬워 `source_citation`은 보내지 않는다. ③의 출처 신호는 `unverifiable_claim`이 맡는다

### 보기 순서

- Choice 보기는 **`neutral` 보기를 맨 앞에** 둔다. Jev는 앞에 오는 보기 쪽으로 기운다 ([../../docs/jev.md](../../docs/jev.md) 3절 ⑧)
  - 안심 보기를 맨 앞에 두면 정상이 아닌 기사가 🟢로 간다
  - 주의 보기를 맨 앞에 두면 정상 기사가 🔴로 간다. 이쪽이 대가가 더 크다 (같은 문서 5절)
  - 가운데 보기로 기울면 🟡 확인 권장이 늘어날 뿐이라 가장 덜 비싼 쪽이다
- **TODO: 순서 편향 상쇄 방법** — 정방향과 역방향 두 순서로 보내 확률을 평균하는 방법과 eval로 비교해 정한다

### 그 밖의 규칙

- `instructions`와 `criteria`에 기사 글을 이어 붙이지 않는다. 글은 `state`에만 넣는다
- 보기 이름(`criteria`의 키)은 코드와 로그가 쓰는 이름이다. 항목 안에서 뜻이 드러나게 짓고(`no_source`, `no_spread`), 보기 설명을 고쳐도 이름은 그대로 둔다
- **`model`과 실제 호출 버전을 맞춘다.** 실제로 부르는 버전은 중계 서버의 `JEV_MODEL`이 정한다. 중계 서버는 시작할 때와 응답의 `model` 필드를 받을 때 이 파일의 `model`과 비교하고, 다르면 경고 로그를 남긴다. 다른 버전에 맞추지 않은 질문을 쓰고 있다는 뜻이다

## 규칙

- **점수 합산과 단계 결정은 코드가 한다.** 모델에 점수를 묻지 않는다 ([../../docs/jev.md](../../docs/jev.md) 3절 ②)
- **보기 순서는 상수로 고정한다.** Jev는 앞에 오는 보기 쪽으로 기운다. 순서를 바꾸면 답이 달라질 수 있다
- **판단 항목 이름을 함부로 바꾸지 않는다.** 문서, 프롬프트, 평가 세트, 로그가 같은 문자열을 쓴다
- **가중치와 임계값을 코드 여기저기에 흩지 않는다.** 상수 한 곳에 모으고, 값이 어디서 나왔는지 주석으로 적는다
- 여기를 고치는 PR은 **eval 전후 수치를 반드시 적는다**
  - **예외 하나.** 판단 내용을 바꾸지 않고 **전송 형식만** 바꾸는 PR은 실제 호출 성공 기록(상태 코드와 받은 답의 수)으로 갈음한다.
    바꾼 것이 "무엇을 묻는가" 가 아니라 "어떻게 보내는가" 일 때만이다.
    **평가 세트가 생기면 그때 첫 측정의 기준선으로 삼는다** (GE-13)

## 모델 노이즈 바닥 — 임계값을 정할 때 깔고 간다

**Jev 는 결정론적이지 않다.** 같은 입력을 세 번 보내 잰 값이다 (2026-10-21, 문장 191개 × 질문 2개).

| | 같은 자리 값의 흔들림 (평균 / 95% / 최대) | 예/아니오가 갈린 자리 |
| --- | --- | --- |
| 지금 방식 (문장마다 요청 1건) | **0.018** / 0.050 / 0.080 | **0 / 382** |

예/아니오가 갈린 자리가 없으니 현재 설계의 재현성은 괜찮다. 다만 **확률값은 매번 조금씩 움직인다.**

- `undetermined_band` 를 정할 때 **±0.02 는 항상, 꼬리까지 보면 ±0.08 은 노이즈**라고 보고 잡는다.
  이보다 좁은 밴드는 같은 기사가 새로고침마다 ⚪와 판정 사이를 오가게 만든다
- 캐시(기사 단위)가 이 흔들림을 사용자 눈에서 상당히 가린다. 하지만 **경계값을 좁게 잡아도 된다는 뜻은 아니다**
- 측정 방법과 원시값은 [../../eval/experiments/sentence-batching/README.md](../../eval/experiments/sentence-batching/README.md) 에 있다

## ⚪ 판단 보류를 만드는 곳

어떤 입력에서 ⚪가 나오는지는 전부 여기서 결정된다.

- 확신도가 임계값 아래일 때 (Choice·Score). **Noul은 `confidence`가 없어 `undetermined_band`가 그 자리를 맡는다**
- 응답이 우리가 정한 보기 밖의 값일 때
- 호출이 실패했을 때 (실패 사실은 호출한 쪽이 알려 준다)

⚪의 이름은 `ERROR`가 아니라 `UNDETERMINED`다. 실패가 아니라 결과이기 때문이다.
