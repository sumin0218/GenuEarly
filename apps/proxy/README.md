# apps/proxy

Jev 중계 서버. **API 키를 가진 유일한 곳**이다.

**Cloudflare Workers + TypeScript.** 프레임워크는 쓰지 않는다.

- 작업 규칙: [AGENT.md](AGENT.md)
- 호출 경로와 모델 정보: [../../docs/jev.md](../../docs/jev.md) 6-1절

## 왜 있는가

확장 프로그램에 API 키를 넣을 수 없기 때문이다. 확장 프로그램은 설치한 사람 누구나 압축을 풀어 전부 읽을 수 있다.
그래서 키는 여기 환경에만 두고, 확장 프로그램은 여기에 요청한다.

## 돌려보기

```bash
npm install                        # 저장소 루트에서 한 번
cp apps/proxy/.dev.vars.example apps/proxy/.dev.vars   # 키를 채운다
npm run dev -w @genuearly/proxy
```

로그인 없이 로컬에서 돈다. 배포할 때만 `npx wrangler login`이 필요하다.

```bash
curl http://127.0.0.1:8787/health
# {"ok":true,"model":"jev-1.13.0"}
```

## 설정이 어디로 갔나

초기 `.env.example` 에 있던 값들의 현재 위치다.

| 전 | 지금 |
| --- | --- |
| `JEV_*` | [wrangler.jsonc](wrangler.jsonc) 의 `vars` (키만 secret) |
| `MAX_REQUEST_BYTES` | 같음 |
| `ALLOWED_ORIGINS` | **코드로 옮겼다** — `src/index.ts` 의 `isAllowedOrigin` |
| `RATE_LIMIT_*` | **아직 없다.** Workers Rate Limiting 바인딩으로 붙인다 (TODO GE-20) |
| `LOG_LEVEL` | 아직 없다. Workers 는 `observability` 로 로그를 남긴다 |

## 엔드포인트

| | | |
| --- | --- | --- |
| `GET` | `/health` | 살아 있는지. 키와 설정값은 돌려주지 않는다 |
| `POST` | `/v1/judge` | 판단 요청. 규약은 [docs/architecture.md](../../docs/architecture.md) 4절 |

### `/v1/judge` 가 하는 일

셋뿐이다. **점수로 바꾸거나 해석하지 않는다** — 그건 확장 프로그램의 몫이다.

1. **요청이 우리 것인지 본다** (origin, 크기 상한)
2. **규약에 맞는지 본다** — 아는 항목 id 인지, **항목·그룹·기능의 짝이 맞는지**,
   그리고 **그 기능이 요구하는 `state` 필드가 다 있는지**.
   id 만 보면 `headline_body` 그룹에 `clickbait_headline` 을 넣어 **제목 판단에 본문을 섞는** 요청이 통과하고,
   짝만 보면 `headline_body` 에 `headline` 만 넣어 **본문 없이 출처를 묻는** 요청이 통과한다
3. **Jev 로 넘기고 답을 그대로 중계한다.** 항목의 `question` 객체를 그대로 보내고,
   코드가 하는 일은 `instructions` 뒤에 `common_instructions` 를 붙이는 것 하나다

> **`answers` 의 키는 항목 id 가 아니라 질문 id 다.** 대부분 같지만 `unverifiable_claim` 은
> `factual_assertion` 과 `named_basis` 로 나뉘어 온다 ([docs/architecture.md](../../docs/architecture.md) 4절).

#### 크레딧 예비분 — 스스로 멈춘다

**게이트웨이 한도를 끝까지 쓰면 월 할당 4,000 크레딧이 약 7시간이면 사라진다** (호출당 0.081 × 분당 120).
다음 달 1일까지 돌아오지 않으므로, 10월 말에 그 일이 나면 **심사 기간 내내 판단이 ⚪** 가 되고
같은 지갑을 쓰는 문구·아이콘 생성까지 막힌다.

그래서 `GET {게이트웨이}/credits` 로 잔액을 보고 `CREDITS_RESERVE`(기본 500) 아래면
Jev 를 부르지 않고 `budget_exhausted` 로 돌린다. `/health` 의 `paused` 가 그 상태를 알려 준다
(**잔액 숫자는 밝히지 않는다**).

> 이것만으로는 예비분 위를 태우는 것을 못 막는다. 그 몫은 아래 차단기가 맡는다.

#### 폭주 차단기 — 우리 코드를 막는다

**막으려는 것은 악의적인 제3자가 아니라 우리 코드다.** 대회 전에는 웹스토어에 올리지 않아
주소를 아는 사람이 우리와 심사위원뿐이다. 반면 확장 프로그램의 재시도 한 줄이나
포털 목록의 `MutationObserver` 가 제가 넣은 요소에 다시 반응하는 것은 분당 수천 건을 낸다.

| | 값 | 왜 |
| --- | --- | --- |
| IP 당 | **분당 60** | **전체보다 반드시 낮아야 한다.** 높으면 폭주 하나가 전체 예산을 먼저 비워서 IP 차단기가 걸릴 일이 없다. 기사 하나가 최대 42건이라 한 사람이 기사 하나는 여유롭게 연다 |
| 전체 | **분당 110** | 게이트웨이 한도 120 아래에서 **우리가 먼저** 거절해 대기 시간을 우리가 정한다 |

**IP 를 먼저 본다.** 전체를 먼저 보면 거절된 요청도 전체 카운터를 깎아서, 폭주 하나가
다른 모든 사용자를 계속 막는다. IP 에서 걸린 요청은 전체 예산을 건드리지 않는다.

> **알려진 한계**: IP 하나를 여러 사람이 쓰면(전시장 공용 와이파이, 학내망) 서로의 몫을 깎는다.
> 분당 60 이면 그 환경에서 두세 명이 동시에 기사를 열 때 끊길 수 있다.

걸리면 **`429` 와 `Retry-After`** 를 준다. 다른 실패는 `200` + `undetermined` 인데 이것만 다르다 —
**폭주하는 클라이언트에 `200` 을 주면 아무것도 배우지 않고 계속 때리기 때문이다.**

> ⚠️ **카운터는 Cloudflare 지점별로 따로 센다.** 전역 합산 한도가 아니다.
> 우리 사용자는 대부분 한국이라 한 지점에 몰릴 가능성이 높지만 **가정이지 보장이 아니다.**
> 엄밀한 전역 한도는 Durable Objects 가 필요하다. `period` 도 10 또는 60 만 쓸 수 있다.

**실패는 오류가 아니라 결과다.** 429·타임아웃·게이트웨이 5xx·보기 밖 응답은 전부
`200` 에 `{ undetermined: true, reason }` 으로 돌아간다. `reason` 은 로그용이고 사용자에게 보여 주지 않는다.

> **429 에 `retry-after` 가 와도 길면 기다리지 않는다.** 실측값이 19초였다(남은 창 시간).
> 그만큼 기다리면 사용자는 20초 동안 빈 배지를 본다. 1.5초 안일 때만 다시 걸고, 아니면 바로 ⚪ 다.

**Jev 의 원본 에러 본문을 싣지 않는다.** 키나 내부 정보가 섞여 나올 수 있다 (CWE-209).

`/v1/judge`는 **브라우저 안에서는** 확장 프로그램 origin 만 받는다. CORS 를 `*` 로 열지 않는다.

> ⚠️ **Origin 검사는 인증이 아니다.** curl 이나 스크립트는 Origin 헤더에 아무 값이나 넣을 수 있다.
> 남의 호출을 실제로 막으려면 **레이트 리밋**이 필요하다 (TODO GE-20). 그 전까지는 피해 범위가
> 우리 ChatKHU 크레딧 한도까지 열려 있다.

## 테스트

```bash
npm test -w @genuearly/proxy        # 모의. 키 없이 돈다
```

**실제 게이트웨이에 붙여 보는 테스트가 따로 있다** ([tests/integration.test.ts](tests/integration.test.ts)).
키가 없으면 건너뛰므로 CI 에서는 돌지 않는다. 직접 돌리려면

```bash
node --env-file=<키가 있는 .env> node_modules/vitest/vitest.mjs run --root apps/proxy
```

모의 테스트는 **우리가 상상한 게이트웨이와만** 맞춰 본다. 규약이 실제와 맞는지는 한 번 불러 봐야 안다 —
GE-31 에서 질문 세트 전체가 `400` 으로 돌아온 것이 모의만 보고 있었기 때문이다.

## 배포

**배포돼 있다** — `https://genuearly-proxy.genuearly-proxy.workers.dev` (2026-10-27).
확장 프로그램은 이 주소를 **빌드 때 구워 넣는다.** 런타임 설정이 아니다:

```bash
WXT_PROXY_URL=https://genuearly-proxy.genuearly-proxy.workers.dev \
  npm run build -w @genuearly/extension
```

주지 않으면 `http://localhost:8787` 이 들어간다. `tests/manifest.test.ts` 가
**빌드 결과에 localhost 가 남았는지** 검사하므로 제출본에서는 거기서 걸린다.

> ⚠️ **Origin 검사는 인증이 아니다.** `curl -H 'Origin: chrome-extension://x'` 로 통과한다.
> 두 장치가 그 위를 덮는다 — **차단기**가 분당 상한을, **잔액 감시**가 월 상한을 지킨다 (위).
>
> 남는 위험: 차단기 한도 안에서 꾸준히 쓰면(분당 110) 예비분까지는 태울 수 있다.
> 그 경우에도 심사·시연용 500 크레딧(약 6,000건)은 남는다.

### 다시 배포할 때

**키는 `wrangler secret put` 으로 넣을 수 없다** — 그 명령은 Worker 가 이미 있어야 한다.
`wrangler.jsonc` 의 `secrets.required` 가 키 없는 배포를 막으므로 파일로 넘긴다.
**키를 셸 히스토리나 화면에 남기지 않는 방법으로** 넘긴다:

```bash
npx wrangler login                                        # 브라우저 OAuth. 한 번만
grep '^JEV_API_KEY=' apps/proxy/.dev.vars > /tmp/s.env    # 값이 찍히지 않는다
npm run deploy -w @genuearly/proxy -- --secrets-file /tmp/s.env
rm -f /tmp/s.env                                          # 바로 지운다
```

Cloudflare 계정의 **이메일 인증이 끝나 있어야 한다.** 아니면 업로드 직전에
`code: 10034` 로 떨어진다 — 바인딩 표까지 다 찍고 나서 실패하므로 성공처럼 보인다.

### 배포 직후 확인

**`/health` 로 두 장치가 켜졌는지 본다.** 바인딩이나 설정값이 빠지면
**조용히 꺼진 채** 돌아간다 — 그것이 가장 위험한 실패 모드다.

```bash
curl -s https://genuearly-proxy.genuearly-proxy.workers.dev/health
# {"ok":true,"model":"jev-1.13.0","paused":false,"guards":{"ratelimit":true,"credits":true}}
```

`guards` 가 하나라도 `false` 면 **그대로 두지 않는다.**

`/health` 는 서버가 살아 있다는 것까지만 말한다. **키가 유효한지는 말해 주지 않는다** —
키는 Jev 를 실제로 부를 때 처음 쓰인다. 한 건 보내 확인한다 (크레딧 약 0.08):

```bash
curl -s -X POST https://genuearly-proxy.genuearly-proxy.workers.dev/v1/judge \
  -H 'Content-Type: application/json' \
  -H 'Origin: chrome-extension://abcdefghijklmnopabcdefghijklmnop' \
  -d '{"feature":"portal_list","group":"headline_only","items":["clickbait_headline"],
       "state":{"headline":"충격... 그가 남긴 마지막 한마디에 모두가 눈물을 흘렸다"}}'
# {"model":"jev-1.13.0","answers":{"clickbait_headline":{"type":"choice","choice":"strong",...}}}
```

`undetermined` 가 돌아오면 키나 게이트웨이 쪽이다. **`answers` 가 와야 통과다.**

> **TODO(GE-20)**: 확장 프로그램 ID 를 받아 `isAllowedOrigin` 을 정확한 origin 으로 좁힌다.
> 지금은 `chrome-extension://` 스킴만 본다. 심사용 로컬 설치는 설치할 때마다 ID 가 바뀌어
> **고정할 수 없다** — 스토어에 올리기 전까지는 이 상태로 둔다.
