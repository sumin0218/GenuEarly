# 배지 단계에 sonar 를 넣어 보기

"배지 단계에서 sonar 가 주변 정보를 주면 Jev 가 문장별 점수를 더 확실하게 내지 않겠나"
를 실제로 불러서 잰 실험이다.

**결과: 넣지 않기로 했다.** 가르는 힘은 오르지만 시간 11배, 비용 130배이고 제품이
하지 않기로 한 **사실 확인**이 된다. 수치와 판단 근거는
[../../results/2026-11-03-badge-with-search.md](../../results/2026-11-03-badge-with-search.md).

## 돌리는 법

```bash
node --env-file=tools/content-gen/.env eval/experiments/badge-with-search/run.mjs > out.json
```

진행 상황은 stderr 로, 결과는 stdout 으로 나온다.

> **크레딧을 쓴다.** 30문장에 약 322 크레딧이었다. 돌리기 전에 잔액을 본다.
> `PER_ARTICLE` 과 `MAX_RECORDS` 로 양을 줄일 수 있다.

## 커밋하지 않는 것

출력(`out.json`)에는 기사 문장이 들어간다. 수동 테스트 자료는 공개된 것이라
저작권 문제는 없지만, **결과 파일은 커밋하지 않는다** — 쌓이기만 하고 재현은
스크립트로 된다. 남길 것은 `results/` 의 요약 하나다.
