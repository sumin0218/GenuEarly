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
| `version` | 질문 세트의 버전. 문구·보기·순서를 고치면 올리고, 로그와 eval 결과에 함께 남긴다 |
| `model` | 이 질문을 맞춘 Jev 버전. [../../docs/jev.md](../../docs/jev.md) 6절의 버전 고정 규칙을 따른다 |
| `state_fields` | `state`에 넣는 필드와 그 안에 들어갈 글. 기사 글은 **여기에만** 들어간다 |
| `common_criteria` | 모든 항목의 `criteria` 뒤에 붙이는 공통 문장. 적대적 입력 대응이다 ([../../docs/jev.md](../../docs/jev.md) 3절 ⑥) |
| `items[].unit` | `article`은 기사 하나에 질문 하나, `sentence`는 문장마다 질문 하나 |
| `items[].features` | 쓰는 기능. `article` ① 기사 자동 검사, `portal_list` ② 포털 목록, `selection` ③ 선택 텍스트 |
| `items[].state_fields` | 이 질문이 보는 필드. 요청의 `state`는 묶인 질문들이 보는 필드의 합집합으로 만든다 |
| `items[].options` | Choice의 보기. **배열 순서가 보내는 순서다** |
| `items[].grades` | Score의 등급. 낮은 등급부터 적는다 |

- `instructions`와 `criteria`에 기사 글을 이어 붙이지 않는다. 글은 `state`에만 넣는다
- Choice 보기는 **주의 신호 쪽을 앞에** 둔다. 유리한 보기를 맨 앞에 두지 않는다는 규칙이다 ([../../docs/jev.md](../../docs/jev.md) 3절 ⑧)
- `criteria` 배열은 줄바꿈으로 이어 하나의 문자열로 보낸다. 항목의 `criteria` 다음에 `common_criteria`를 붙인다
- ② 포털 목록에서는 `state`에 `headline`만 넣는다. ③ 선택 텍스트는 고른 글을 `body`에 넣는다
- 보기의 `key`는 코드와 로그가 쓰는 이름이다. 보기 문구를 고쳐도 `key`는 그대로 둔다

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
