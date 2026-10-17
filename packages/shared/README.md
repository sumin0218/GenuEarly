# packages/shared

**판단의 원본이 사는 곳이다.** 판단 항목 정의, Jev 질문의 보기와 그 순서, 가중치, 확신도 임계값, 점수 합산, 배지 단계 결정.

**기술 스택 미정.**

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
| `common_criteria` | 모든 질문의 `criteria` 뒤에 붙이는 공통 문장. 적대적 입력 대응이다 ([../../docs/jev.md](../../docs/jev.md) 3절 ⑥) |
| `request_groups` | 요청을 나누는 단위. **요청의 `state`에 넣는 필드는 그룹의 `state_fields`만 정한다.** 같은 그룹의 질문만 한 요청에 묶는다 (아래) |
| `request_groups.headline_body.min_body_chars` | 기능별 본문 최소 글자 수. 본문이 이보다 짧으면 `headline_body` 요청을 보내지 않는다. ① 포토·단신 기사와 ③ 한두 문장 선택은 길이가 달라 따로 둔다. 값은 eval 후에 정한다 (`null`은 미정) |
| `request_groups.headline_body.short_body_fallback` | 본문이 짧아 `headline_body` 요청을 건너뛸 때, 항목의 `request_group`에서 이 기능(`portal_list`)의 그룹을 대신 쓴다 |
| `items[].unit` | `article`은 기사 하나에 질문 하나, `sentence`는 문장마다 요청 하나(질문은 `questions` 수만큼) |
| `items[].request_group` | 기능별로 이 질문이 들어갈 요청 그룹. 키가 쓰는 기능이다: `page` ① 기사 자동 검사, `portal_list` ② 포털 목록, `selection` ③ 선택 텍스트. 키가 없는 기능에서는 이 질문을 보내지 않는다 |
| `items[].basis_fields` | 이 질문이 판단 근거로 삼는 필드. `instructions`가 이름으로 가리키는 필드다. `state` 구성에는 쓰지 않는다 |
| `items[].options` | Choice의 보기. **배열 순서가 보내는 순서다** |
| `items[].options[].signal` | 보기의 방향. `caution` 주의, `neutral` 중간, `clear` 안심. **점수 합산과 eval은 순서가 아니라 이 값을 읽는다** |
| `items[].grades` | Score의 등급. 낮은 등급부터 적는다 |
| `items[].questions` | 판단 하나를 Jev 질문 여러 개로 나눈 항목의 질문들 |
| `items[].combine` | 질문별 확률을 합치는 방법. `op`가 연산이고 `formula`는 사람이 읽는 설명이다. `and_not`은 `P(a = 예) × (1 − P(b = 예))`다 |
| `items[].undetermined_band` | 확률이 이 구간 안이면 그 질문은 "모름"이다. `[0.4, 0.6]` 같은 값을 eval 후에 넣는다 (`null`은 미정) |

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
- `criteria` 배열은 줄바꿈으로 이어 하나의 문자열로 보낸다. 질문의 `criteria` 다음에 `common_criteria`를 붙인다
- 보기의 `key`는 코드와 로그가 쓰는 이름이다. 항목 안에서 뜻이 드러나게 짓고(`no_source`, `no_spread`), 보기 문구를 고쳐도 `key`는 그대로 둔다
- **`model`과 실제 호출 버전을 맞춘다.** 실제로 부르는 버전은 중계 서버의 `JEV_MODEL`이 정한다. 중계 서버는 시작할 때와 응답의 `model` 필드를 받을 때 이 파일의 `model`과 비교하고, 다르면 경고 로그를 남긴다. 다른 버전에 맞추지 않은 질문을 쓰고 있다는 뜻이다

## 규칙

- **점수 합산과 단계 결정은 코드가 한다.** 모델에 점수를 묻지 않는다 ([../../docs/jev.md](../../docs/jev.md) 3절 ②)
- **보기 순서는 상수로 고정한다.** Jev는 앞에 오는 보기 쪽으로 기운다. 순서를 바꾸면 답이 달라질 수 있다
- **판단 항목 이름을 함부로 바꾸지 않는다.** 문서, 프롬프트, 평가 세트, 로그가 같은 문자열을 쓴다
- **가중치와 임계값을 코드 여기저기에 흩지 않는다.** 상수 한 곳에 모으고, 값이 어디서 나왔는지 주석으로 적는다
- 여기를 고치는 PR은 **eval 전후 수치를 반드시 적는다**

## ⚪ 판단 보류를 만드는 곳

어떤 입력에서 ⚪가 나오는지는 전부 여기서 결정된다.

- 확신도가 임계값 아래일 때
- 응답이 우리가 정한 보기 밖의 값일 때
- 호출이 실패했을 때 (실패 사실은 호출한 쪽이 알려 준다)

⚪의 이름은 `ERROR`가 아니라 `UNDETERMINED`다. 실패가 아니라 결과이기 때문이다.
