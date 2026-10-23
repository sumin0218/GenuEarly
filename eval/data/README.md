# eval/data

평가 세트. **URL과 라벨만 둔다. 기사 본문을 커밋하지 않는다.**

- 저작권 문제가 있고, 본문은 수정되기도 해서 커밋해 둔 사본은 어차피 틀어진다
- 본문이 필요하면 각자 URL로 받아 `private/`에 둔다

| 파일 | 무엇 |
| --- | --- |
| [labeling.md](labeling.md) | **라벨링 기준.** 무엇을 보고 🔴이라고 할 것인가 |
| 이 문서 | 세트 구성, 수집 방법, 라벨 형식, 라벨링 절차 |
| `eval-set.v1.jsonl` | 평가 세트 v1의 URL과 라벨. 라벨링을 마치면 추가한다 |
| [../eval-set/](../eval-set/) | 세트를 준비하는 스크립트 (ChatKHU 호출, 수집, 생성) |

**구성과 기준은 라벨을 붙이기 전에 커밋한다.** 숫자를 본 뒤에 정하면 원하는 답이 나온다
([../experiments/sentence-batching/README.md](../experiments/sentence-batching/README.md) 2절의 교훈).

---

## 1. 구성 (v1, 120건)

| 묶음 | 건수 | 무엇 | 왜 |
| --- | --- | --- | --- |
| **정상** `normal` | **60** | 네이버 뉴스 6개 섹션(정치·경제·사회·생활문화·세계·IT과학) × 10건. 섹션 안에서 길이(짧음·보통·긺)를 섞는다 | **오탐이 가장 중요한 지표다.** 정상 기사가 많아야 오탐률이 몇 건에 흔들리지 않는다 |
| **경계** `borderline` | **30** | 아래 세 종류 × 10건 | 오탐이 실제로 나는 자리다 |
| **신호 뚜렷** `signal` | **15** | 실제로 보도된 기사 중 주의 신호가 뚜렷한 것 | 🔴 정확도를 재려면 🔴이 맞는 실제 기사가 있어야 한다 |
| **가상** `fictional` | **15** | 우리가 만든 가짜 기사. **`private/`에만 둔다** | 실제 기사로는 신호가 여럿 겹친 경우를 모으기 어렵다 |

경계 사례의 세 종류:

| `borderline_type` | 무엇 |
| --- | --- |
| `sensational_headline` | 정상 보도인데 제목이 자극적이다 |
| `unsourced_true` | 출처를 밝히지 않았지만 정상 보도다 (기자 직접 취재, 현장 스케치, 단신) |
| `machine_written` | 기계로 쓴 진짜 기사 (증시·날씨·스포츠 자동 기사) |

**이 세트에 넣지 않는 것** — 프롬프트 인젝션, 보기 순서 바꾸기 케이스는 GE-14가 따로 만든다.
짧은 입력(③ 선택 텍스트)과 실패 경로(429·타임아웃)도 이 세트가 아니라 각각의 검사로 본다.

### 문장 라벨 대상 (30건)

`unverifiable_claim`은 문장마다 라벨이 필요하다. 120건 전부에 붙이면 문장 라벨이 2천 개를 넘는다.
**30건만 고른다**: 정상 12 · 경계 9 · 신호 뚜렷 4 · 가상 5. 아래 3절의 씨앗으로 고르고 `sentence_labels: true`로 표시한다.

### 튜닝용과 확인용

GE-17은 이 세트로 가중치와 임계값을 **정한다.** 정한 세트로 다시 재면 숫자가 좋게 나올 수밖에 없다.

- 묶음마다 **70%를 튜닝용(`tune`), 30%를 확인용(`holdout`)으로** 나눈다. 정상 42/18 · 경계 21/9 · 신호 10/5 · 가상 10/5
- 나누는 일은 라벨링 전에 고정 씨앗으로 한 번만 한다
- **확인용은 가중치·임계값을 다 정한 뒤 한 번만 잰다.** 그 숫자를 결과로 보고한다. 확인용을 보고 다시 고치면 확인용이 튜닝용이 된다

## 2. 수집 방법

### 실제 기사 (정상·경계·신호 뚜렷)

- **정상**은 섹션 페이지에서 자동으로 모은다. 수집기는 [../experiments/sentence-batching/collect.mjs](../experiments/sentence-batching/collect.mjs)와 같은 방식이고, 요청 사이에 간격을 둔다
- **경계와 신호 뚜렷**은 섹션을 훑어서는 거의 나오지 않는다. 랭킹 뉴스, 연예·사회 섹션, 제목에 자극적 낱말이 든 기사에서 **후보를 넉넉히 모으고 사람이 고른다**
- 본문은 `private/`나 저장소 밖 작업 디렉터리에만 둔다. 저장소에는 URL, 수집일, 본문의 해시만 남긴다
- 본문 해시를 남기는 이유: 기사가 나중에 고쳐지면 라벨과 본문이 어긋난다. 다시 받았을 때 해시가 다르면 그 건은 재검토한다
- **사설·칼럼·기고는 넣지 않는다.** 의견을 쓰는 글이라 감정·출처 기준이 기사와 다르다
- 알 수 있는 실명·연락처 같은 개인정보를 라벨 메모에 옮겨 적지 않는다

### 가상 기사

**공개 저장소에 그럴듯한 가짜 기사가 돌아다니는 것 자체가 문제다.** `private/ge13/`에만 둔다.

- **ChatKHU Gateway로 만든다** (대회 필수 도구). 모델 ID와 프롬프트는 [../../docs/ai-log/02-materials.md](../../docs/ai-log/02-materials.md)에 남긴다
- **실존 인물, 기관, 언론사, 지명이 특정되는 사건을 쓰지 않는다.** 가상의 이름을 쓴다. 파일이 새어 나가도 실제 누군가에 대한 허위 정보가 되지 않게 한다
- 의료·백신·재난 대피·선거처럼 **믿으면 실제로 해가 되는 주제는 쓰지 않는다**
- 기사마다 **노리는 신호를 먼저 정하고** 만든다 (예: "익명 출처 + 공유 재촉"). 이것은 정답의 초안일 뿐이고 라벨은 사람이 따로 붙인다
- **AI 문체가 정답과 겹치지 않게 한다.** 가짜 기사가 전부 AI 문체면 `ai_style_signal`이 가짜를 맞히는 것처럼 보인다.
  15건 중 5건은 기본 문체, 5건은 다른 문체를 지시해서(커뮤니티 글, 지역 소식지, 블로그형), 5건은 사람이 직접 쓰거나 크게 고친다
- 파일 안의 메타데이터(`fictional: true`, 노린 신호)는 Jev에 보내는 `state`에 넣지 않는다

## 3. 라벨 형식

`eval-set.v1.jsonl` — 한 줄에 기사 하나.

```json
{
  "id": "r-001",
  "kind": "real",
  "url": "https://n.news.naver.com/article/000/0000000000",
  "private_path": null,
  "group": "normal",
  "borderline_type": null,
  "section": "사회",
  "collected_at": "2026-10-24",
  "body_sha256": "…",
  "body_chars": 1234,
  "split": "tune",
  "sentence_labels": false,
  "labels": {
    "a": { "badge": "clear", "items": { "source_citation": "named_source", "headline_body_match": "matches", "clickbait_headline": "plain", "spread_inducement": "no_spread", "emotional_language": 0, "ai_style_signal": 1 }, "note": "" },
    "b": { "…": "a와 같은 모양" },
    "final": { "…": "a와 같은 모양" }
  },
  "adjudication": ""
}
```

| 필드 | 값 |
| --- | --- |
| `id` | 실제 기사 `r-001`…, 가상 기사 `f-001`… |
| `kind` | `real` / `fictional` |
| `url` | 실제 기사만. 가상 기사는 `null` |
| `private_path` | 가상 기사만. `private/` 아래 상대 경로 (예: `ge13/f-001.json`). **내용은 커밋하지 않는다** |
| `group` · `borderline_type` | 1절의 묶음 |
| `body_sha256` · `body_chars` | 정제한 본문의 해시와 글자 수. 본문 자체는 넣지 않는다 |
| `split` | `tune` / `holdout` (1절) |
| `labels.a` · `labels.b` | 라벨러 A·B가 **따로** 붙인 것. 값은 [labeling.md](labeling.md) 3·4절 |
| `labels.final` | 불일치를 논의해 확정한 것. **측정은 이 값으로 한다** |
| `adjudication` | 불일치가 있었다면 무엇을 어떻게 정했는가 |

문장 라벨(`sentence_labels: true`인 30건)은 `labels.*.sentences`에 넣는다.

```json
"sentences": { "splitter": "sentence-batching/split.mjs@83faf82", "items": [ { "i": 0, "factual_assertion": true, "named_basis": false } ] }
```

`i`는 분리기가 낸 문장 순번이다. 문장 텍스트는 넣지 않는다.

**버전** — 기사를 더하거나 빼거나 라벨을 고치면 `eval-set.v2.jsonl`로 새로 만든다. 측정 결과에는 어느 버전으로 쟀는지 적는다 ([../results/README.md](../results/README.md)).

## 4. 라벨을 붙이는 사람과 절차

| 역할 | 누구 | 하는 일 |
| --- | --- | --- |
| 라벨러 A | [@SeungwonKwon](https://github.com/SeungwonKwon) | 120건 전부를 따로 라벨링 |
| 라벨러 B | [@sumin0218](https://github.com/sumin0218) | 120건 전부를 따로 라벨링 |
| 확정 | A와 B가 함께 | 불일치를 논의해 `final`을 정한다 |

**AI는 라벨을 붙이지 않는다.** AI가 붙인 정답으로 AI 판단을 재면 숫자가 의미가 없다.
가상 기사를 만들 때 정한 "노린 신호"도 정답이 아니라 참고다.

### 절차

1. 두 라벨러가 [labeling.md](labeling.md)를 읽고, **세트에 넣지 않는 연습용 기사 10건**에 함께 붙여 보며 해석을 맞춘다
2. 각자 따로 120건에 붙인다. **서로의 라벨과 Jev 결과를 보지 않는다**
3. 항목마다 일치율을 잰다. 보기형(배지·Choice)은 Cohen's kappa, 등급형(Score)은 가중 kappa
4. **kappa가 0.6 아래인 항목은 기준이 흔들리는 것이다.** 측정에 쓰기 전에 labeling.md를 고치고(버전을 올린다) 그 항목을 둘 다 다시 붙인다
5. 불일치를 논의해 `final`을 정하고 `adjudication`에 적는다. 논의로도 안 갈리면 `final`을 한 단계 낮은 신호 쪽으로 둔다 (labeling.md 3절 판단 규칙 3)
6. 일치율과 고친 내용을 [../results/](../results/)에 남긴다

## private/

커밋되지 않는다 ([../../.gitignore](../../.gitignore)).

- 내려받은 기사 본문
- **테스트용으로 만든 가상의 가짜 기사** — `private/ge13/`(평가 세트), `private/ge14/`(인젝션 케이스)로 나눠 둔다

여기 있는 파일을 실수로 `git add -f` 하지 않는다.
