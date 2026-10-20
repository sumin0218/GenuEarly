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

## 엔드포인트

| | | |
| --- | --- | --- |
| `GET` | `/health` | 살아 있는지. 키와 설정값은 돌려주지 않는다 |
| `POST` | `/v1/judge` | 판단 요청. **TODO(GE-18)** — 지금은 `501` |

`/v1/judge`는 **확장 프로그램 origin 만** 받는다. CORS 를 `*` 로 열지 않는다.

## 배포

```bash
npx wrangler login                               # 브라우저 OAuth. 한 번만
npx wrangler secret put JEV_API_KEY -c apps/proxy/wrangler.jsonc
npm run deploy -w @genuearly/proxy
```

> **TODO(GE-20)**: 배포 후 확장 프로그램 ID 를 받아 `isAllowedOrigin` 을 정확한 origin 으로 좁힌다.
> 지금은 `chrome-extension://` 스킴만 본다.
