# 출처 · 권리 · 라이선스

서식4의 **출처·권리·라이선스 목록** 표에 그대로 옮길 내용이다.
표의 칸 이름은 요강 서식과 같게 두었다.

**외부에서 가져온 것을 쓰는 순간 여기에 한 줄 추가한다.** 제출 직전에 거슬러 올라가 찾으면 반드시 빠진다.

> 서식1(참가서약서) 3항: *"사용한 생성형 AI, 데이터, 코드, 이미지, 음원, 폰트, 문헌 등
> 외부 자원의 이용 조건과 출처를 확인하고, AI 활용 과정 설명서에 사실대로 기재하겠습니다."*

---

## 데이터

| 자료명·출처 | 저작권자·제공처 | 이용 조건 | 활용 내용 |
| --- | --- | --- | --- |
| 평가 세트 기사 URL·라벨 | 각 언론사 | **TODO** — 본문을 저장하지 않고 URL과 라벨만 둔다 | 판단 정확도 측정 ([../../eval/](../../eval/)) |
| 출처 도메인 목록 | **TODO** — 어떤 목록을 근거로 삼을지 미정 | TODO | 코드 규칙으로 출처 도메인 판단 |

## 코드 · AI모델

| 자료명·출처 | 저작권자·제공처 | 이용 조건 | 활용 내용 |
| --- | --- | --- | --- |
| **ChatKHU API Gateway** (`factchat-cloud.mindlogic.ai/v1/gateway`) | 경희대학교 | **대회 결과물 단계 이용 허용** (2026-10-21 확인). 사용자 트래픽 대행 가능, 공개 배포 가능, 보낸 내용 미보관, 분당 120건 고정, 출처 표기는 권장(의무 아님). **대회 이후 일반 배포는 재확인 필요** ([../jev.md](../jev.md) 6-1절) | 하나의 키로 여러 제공사 모델을 호출한다. 아래 세 줄이 전부 이 경로다 |
| ├ `gpt-5.6-luna` (OpenAI) | ChatKHU 경유 | 위와 같음 | **사용자 노출 문구 생성** ([`packages/content/ui.ko.json`](../../packages/content/ui.ko.json), 2026-10-22) |
| ├ `claude-sonnet-5-5` (Anthropic) | ChatKHU 경유 | 위와 같음 | 인젝션 검사의 유도 문장 발상 ([`eval/experiments/robustness`](../../eval/experiments/robustness/)) |
| ├ `gpt-image-2.5-sunburst` (OpenAI) | ChatKHU 경유 | 위와 같음 | 확장 프로그램 아이콘 생성 |
| └ `jev-latest` (TypeSafe) | ChatKHU 경유 | 위와 같음 | **런타임 판단 호출 (v1.0.0 확정 경로).** 2026-10-16 동작 확인, 2026-10-21 질문 세트 전체로 재확인 |
| **Jev 1.13** (`jev-1.13.0`) — TypeSafe 직접 | TypeSafe (<https://docs.typesafe.ai>) | 약관 미확인. 계정 미발급 | **v1.0.0 에서 쓰지 않는다.** 게이트웨이 경유로 확정 (2026-10-21). 대회 이후 일반 배포 시 다시 본다 ([../jev.md](../jev.md) 6-1절) |
| **WXT** 0.21.x | WXT 기여자 | **MIT** (npm 레지스트리 확인) | 확장 프로그램 빌드 프레임워크 |
| **Vite / Vitest** | 각 프로젝트 | **MIT** (npm 레지스트리 확인) | 번들링, 테스트 |
| **commitlint / husky** | 각 프로젝트 | **MIT** (npm 레지스트리 확인) | 커밋 메시지 검사 |
| **happy-dom** 21.0.4 | happy-dom 기여자 | **MIT** (npm 레지스트리 확인, `npm audit` 0건) | 기사 추출 테스트의 DOM. 배포본에 들어가지 않는다 (devDependency) |
| **Reicon** 아이콘 (<https://github.com/dqev/reicon>) | Dev Chauhan | **MIT** (저장소 `LICENSE` 확인, 2026-10-27) | 화면의 단계 표시 아이콘 다섯 개. **라이브러리를 의존성으로 넣지 않고** 쓰는 `path` 데이터만 [`apps/extension/lib/icon-data.ts`](../../apps/extension/lib/icon-data.ts) 에 넣었다. 저작권 표시를 그 파일 머리말에 적었다 |
| **taste-skill** (<https://github.com/Leonxlnx/taste-skill>) | Leonxlnx | 공개 저장소. **코드를 가져오지 않았다** — 문서만 읽었다 | 화면 디자인 결정의 근거. `references/app-screens.md`·`tells.md` ([../design.md](../design.md)) |
| 코딩 도구 (Claude Code / Claude Opus 5) | Anthropic | **TODO** — 확인 | 구현 보조, 문서 작성, 조사 |

> **TODO: 의존성 라이선스 일괄 확인** — `npm ls --all` 또는 라이선스 수집 도구로 한 번에 뽑아 채운다.
> 지금 일일이 적기보다 제출 전에 한 번 돌리는 쪽이 정확하다.

## 이미지 · 영상 · 음원

| 자료명·출처 | 저작권자·제공처 | 이용 조건 | 활용 내용 |
| --- | --- | --- | --- |
| 확장 프로그램 아이콘 (16·32·48·96·128px) | **ChatKHU 이미지 생성 에이전트** — 모델 ID `gpt-image-2.5-sunburst` (OpenAI, ChatKHU 경유) | **TODO** — 생성물의 상업적 이용·2차 가공 조건 확인 | 시안 3종 생성 → 3안(방패) 선택 → 배경 제거·크기별 변환. 마스터는 `apps/extension/assets/icon-master.png` (확장 프로그램 빌드 환경 PR이 머지되면 생긴다) |

## 문헌 · 기타

| 자료명·출처 | 저작권자·제공처 | 이용 조건 | 활용 내용 |
| --- | --- | --- | --- |
| TypeSafe 공식 문서 (Models, Jev 1.13 jaggedness, Confidence) | TypeSafe | 공개 문서 | [../jev.md](../jev.md) 작성 근거 |
| 참고 저장소 [khu-HacKHU/HacKHU-HP](https://github.com/khu-HacKHU/HacKHU-HP) | HacKHU | **TODO** — 라이선스 확인 | 저장소 구조·커밋 규칙·CI 스크립트 방식 참고 |

---

## 남은 확인 사항

| 무엇 | 왜 필요한가 |
| --- | --- |
| **ChatKHU 생성물의 이용 조건** | 아이콘을 출품작에 쓴다. 서식5(저작권 동의서)에도 영향 |
| **ChatKHU 키로 사용자 트래픽을 대행해도 되는가** | 런타임 경로를 정하는 근거다. 이용 대상이 교내 재학생이다 ([../jev.md](../jev.md) 6-1절) |
| **Jev(TypeSafe) 이용 약관** | 런타임을 직접 호출로 간다면 필요하다 |
| 오픈소스 의존성 라이선스 | 서식1 3항에서 요구한다 |
| 참고 저장소 라이선스 | 구조와 스크립트를 가져왔다 |

## 사용량 현황

ChatKHU 크레딧은 월 단위로 할당된다. 제출·시연 기간에 모자라지 않는지 봐 둔다.

| 확인일 | 월 할당 | 사용 | 남음 | 갱신일 |
| --- | --- | --- | --- | --- |
| 2026-10-16 | 4,000 | 45.75 | 3,954.25 | 2026-11-01 |

`GET /v1/gateway/credits/` 로 확인한다. 전시(11/19~20)는 11월 할당분을 쓴다.


## 수동 테스트 사실 기반 5건의 출처 (GE-51, 2026-10-29)

확인한 핵심 사실을 Codex로 새로 요약했다. 과장 제목은 원출처의 제목이 아니며 원문 기사 전문을 복제하지 않았다.

| 테스트 | 공식 출처 | 확인한 내용 |
| --- | --- | --- |
| c-006 | [Premier League](https://www.premierleague.com/en/news/2626553) | 손흥민·살라 2021/22 공동 득점왕과 23골 |
| c-007 | [Nobel Prize](https://www.nobelprize.org/prizes/literature/2024/han/facts/) | 한강 2024 노벨문학상과 작가 이력 |
| c-008 | [Academy Awards](https://www.oscars.org/oscars/ceremonies/2020/A--E) | 2020 기생충 작품상·봉준호 감독상 |
| c-009 | [IOC](https://www.olympics.com/ioc/news/yuna-kim-blazes-an-icy-trail-for-the-republic-of-korea?esi=true) | 김연아 2010 금메달과 228.56점 |
| c-010 | [BIGHIT MUSIC](https://bts.ibighit.com/eng/profile/) | BTS 2013년 6월 데뷔와 멤버 |
