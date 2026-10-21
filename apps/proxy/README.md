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
| `POST` | `/v1/judge` | 판단 요청. **TODO(GE-18)** — 지금은 `501` |

`/v1/judge`는 **브라우저 안에서는** 확장 프로그램 origin 만 받는다. CORS 를 `*` 로 열지 않는다.

> ⚠️ **Origin 검사는 인증이 아니다.** curl 이나 스크립트는 Origin 헤더에 아무 값이나 넣을 수 있다.
> 남의 호출을 실제로 막으려면 **레이트 리밋**이 필요하다 (TODO GE-20). 그 전까지는 피해 범위가
> 우리 ChatKHU 크레딧 한도까지 열려 있다.

## 배포

```bash
npx wrangler login                               # 브라우저 OAuth. 한 번만
npx wrangler secret put JEV_API_KEY -c apps/proxy/wrangler.jsonc
npm run deploy -w @genuearly/proxy
```

> **TODO(GE-20)**: 배포 후 확장 프로그램 ID 를 받아 `isAllowedOrigin` 을 정확한 origin 으로 좁힌다.
> 지금은 `chrome-extension://` 스킴만 본다.
