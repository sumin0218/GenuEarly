# eval/eval-set

평가 세트([../data/](../data/))를 준비하는 스크립트다. **여기서 만든 본문과 생성물은 전부 `../data/private/ge13/`에 쌓이고 커밋되지 않는다.**

ChatKHU 키는 `--env-file`로 넘긴다. 변수는 [tools/content-gen/.env.example](../../tools/content-gen/.env.example)과 같다.

| 스크립트 | 하는 일 |
| --- | --- |
| `chatkhu.mjs` | ChatKHU Gateway 채팅 호출 (OpenAI 호환) |
| `review-labeling.mjs` | [labeling.md](../data/labeling.md)를 ChatKHU에 보여 주고 라벨러 사이에 해석이 갈릴 자리를 묻는다 |

```bash
node --env-file=<.env 경로> eval/eval-set/review-labeling.mjs
```
