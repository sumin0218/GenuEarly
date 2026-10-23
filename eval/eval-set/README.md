# eval/eval-set

평가 세트([../data/](../data/))를 준비하는 스크립트다. **여기서 만드는 본문, 생성물, 엑셀 시트는 전부 `../data/private/ge13/`에 쌓이고 커밋되지 않는다.**

ChatKHU 키는 `--env-file`로 넘긴다. 변수는 [tools/content-gen/.env.example](../../tools/content-gen/.env.example)과 같다.
엑셀 시트를 만들 때 `exceljs`가 필요하다. 이 폴더에서 `npm install`을 한 번 한다 (루트 의존성과 섞지 않는다).

## 순서

| 단계 | 스크립트 | 하는 일 | 사람이 하는 일 |
| --- | --- | --- | --- |
| 0 | `review-labeling.mjs` | [labeling.md](../data/labeling.md)를 ChatKHU에 보여 주고 해석이 갈릴 자리를 묻는다 | 지적을 받아들일지 정한다 |
| 1 | `collect.mjs` | 네이버 뉴스 6개 섹션, 랭킹 뉴스, 증권 하위 섹션에서 기사를 모으고 `clean.mjs`로 정제한다 | |
| 2 | `generate-fictional.mjs` | 가상 기사 15건을 ChatKHU로 만든다 | `human_rewrite: true`인 5건을 직접 고쳐 쓰고 `rewritten_by`를 채운다 |
| 3 | `build-candidates.mjs` | 정상 60건을 고정 씨앗으로 뽑고, 나머지를 후보 시트로 펼친다 → `후보선정.xlsx` | 후보 시트에서 경계 30, 신호 뚜렷 15, 연습용 10을 고른다 |
| 4 | `build-label-sheets.mjs` | 120건을 확정하고 튜닝/확인을 나눈 뒤 라벨러별 시트를 만든다 → `라벨-A.xlsx`, `라벨-B.xlsx`, `manifest.v1.json` | 연습 10건을 함께 하고, 각자 라벨링한다 |
| 5 | (라벨이 모이면 작성) | 일치율(kappa)을 내고 불일치 목록을 만든 뒤, 확정 라벨을 `../data/eval-set.v1.jsonl`로 옮긴다 | 불일치를 논의해 확정한다 |

```bash
ENV=<.env 경로>
node --env-file=$ENV eval/eval-set/review-labeling.mjs
node eval/eval-set/collect.mjs
node --env-file=$ENV eval/eval-set/generate-fictional.mjs
node eval/eval-set/build-candidates.mjs
node eval/eval-set/build-label-sheets.mjs
```

## 지키는 것

- 수집기는 요청 사이에 간격을 둔다 (목록 0.5초, 기사 0.3초)
- 후보 시트의 '힌트'는 키워드로 붙인 참고다. **정답이 아니다**
- 라벨러 시트에는 묶음(정상·경계·신호 뚜렷)을 보여 주지 않고 순서도 섞는다. 묶음을 알면 판단이 기운다
- 가상 기사 생성 규칙(실존 이름 금지, 해가 되는 주제 금지)은 `generate-fictional.mjs` 프롬프트에 있다. 바꾸면 [../../docs/ai-log/02-materials.md](../../docs/ai-log/02-materials.md)에 남긴다
