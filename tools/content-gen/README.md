# tools/content-gen

사용자에게 보이는 문구를 ChatKHU로 생성하는 도구다.

**도구는 배포되지 않지만, 도구가 만든 문구는 배포본에 그대로 들어간다.** 둘을 섞어 읽지 않는다.

| | 배포되나 |
| --- | --- |
| 이 디렉터리의 스크립트와 키 | ❌ 개발할 때만 돈다 |
| **ChatKHU가 생성한 문구** | ✅ **[`packages/content`](../../packages/content/)로 들어가 사용자에게 그대로 보인다** |

ChatKHU는 우리 **결과물을 구성하는 요소**다. 사용자가 읽는 모든 문구와 확장 프로그램 아이콘이
ChatKHU 생성물이고, Jev는 사용자에게 보이는 글을 한 글자도 쓰지 않는다
([../../README.md](../../README.md)의 AI 역할 분담).

이 도구를 돌리는 것은 사람이고, 후보 중 무엇을 쓸지도 사람이 고른다.

## 왜 있는가

- Jev는 **글을 생성하도록 학습된 모델이 아니다** ([docs/jev.md](../../docs/jev.md) 3절 ⑨). 문구는 미리 만들어 둔다
- 실행 중에 문구를 생성하면 같은 상황에 매번 다른 말이 나온다. 신뢰가 깨진다
- 문구 작성은 **ChatKHU의 주 역할**이다 (대회 필수 도구)

## 쓰는 법

```bash
cp .env.example .env    # 값을 채운다. .env 는 커밋되지 않는다
```

| 변수 | 값 |
| --- | --- |
| `CHATKHU_API_KEY` | 본인 ChatKHU API 키 |
| `CHATKHU_API_BASE_URL` | `https://factchat-cloud.mindlogic.ai/v1/gateway` |
| `CHATKHU_MODEL` | `claude-sonnet-5-5` |

**프롬프트는 [prompt.md](prompt.md) 에 있다.** 그것을 ChatKHU 에 붙여 쓰고, 후보 중 고른다.

> **TODO: 생성 스크립트 작성(GE-16)** — 지금은 환경변수만 준비돼 있다.
> OpenAI 호환 엔드포인트(`POST {BASE_URL}/chat/completions/`)를 쓴다.

## 지키는 것

- **키를 이 도구 밖으로 내보내지 않는다.** 확장 프로그램에도, `apps/proxy`에도 넣지 않는다. ChatKHU 이용 대상이 교내 재학생이라 **사용자 트래픽을 이 키로 대행하지 않는다**
- 생성 원문은 **서식4의 증빙**이다. `out/`에 날짜별로 쌓고 덮어쓰지 않는다
- 쓴 프롬프트와 고른 이유는 [docs/ai-log/03-design.md](../../docs/ai-log/03-design.md)에 남긴다
- 문구 규칙은 [docs/product.md](../../docs/product.md) 6절이 원본이다 — 단정 금지, 가르치지 않기, 점수 숨기기

## 한글을 보낼 때

Windows 셸에서 한글을 명령 인자로 직접 넘기면 인코딩이 깨져 `400 (body must be UTF-8 encoded JSON)`이 난다.
**요청 본문은 UTF-8 파일로 쓴 뒤 보낸다.**
