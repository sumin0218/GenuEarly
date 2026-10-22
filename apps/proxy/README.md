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

> **레이트 리밋이 아니다.** 악용자가 예비분까지 태우는 것은 막지 못한다.
> 막는 것은 **전부 태워서 심사 기간을 잃는 것**이다. 레이트 리밋은 아직 없다 (아래).

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

> ⚠️ **배포하면 누구나 부를 수 있다. 최악은 막아 뒀지만 문이 열려 있는 것은 그대로다.**
>
> Origin 검사는 인증이 아니다. `curl -H 'Origin: chrome-extension://x'` 로 통과한다.
>
> | | |
> | --- | --- |
> | **막아 둔 것** | 크레딧 예비분. 전부 태워서 심사 기간을 잃는 일은 안 생긴다 (위) |
> | **아직 안 막은 것** | **레이트 리밋.** 악용자가 예비분 위 3,200 크레딧(약 40,000건)을 태우는 것은 막지 못한다. 그동안 실제 사용자는 ⚪ 를 본다 |
>
> 레이트 리밋은 Cloudflare Rate Limiting 바인딩으로 붙인다. 다만 그 바인딩의 카운터는
> **Cloudflare 지점별로 따로 센다** — 전역 합산 한도가 아니다. 엄밀한 전역 한도는 Durable Objects 가 필요하다.
> 우리 사용자는 대부분 한국이라 한 지점에 몰릴 가능성이 높지만 **그것은 가정이지 보장이 아니다.**

```bash
npx wrangler login                               # 브라우저 OAuth. 한 번만
npx wrangler secret put JEV_API_KEY -c apps/proxy/wrangler.jsonc
npm run deploy -w @genuearly/proxy
```

> **TODO(GE-20)**: 배포 후 확장 프로그램 ID 를 받아 `isAllowedOrigin` 을 정확한 origin 으로 좁힌다.
> 지금은 `chrome-extension://` 스킴만 본다.
