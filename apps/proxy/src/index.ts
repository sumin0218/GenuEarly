// GenuEarly Jev 중계 서버.
//
// **키를 가진 유일한 곳이다.** 확장 프로그램은 키를 모른다.
// 규칙은 apps/proxy/AGENT.md 와 docs/security/secure-coding.md 8절에 있다.
//
// 지금은 뼈대다. 실제 Jev 중계는 GE-18 에서 붙인다.

export interface Env {
  /** ChatKHU API 키. wrangler secret 으로 넣는다. 로그에 남기지 않는다. */
  JEV_API_KEY: string
  JEV_API_BASE_URL: string
  JEV_MODEL: string
  JEV_TIMEOUT_MS: string
  MAX_REQUEST_BYTES: string
}

/**
 * 요청을 보낸 곳이 우리 확장 프로그램인지 본다.
 *
 * 확장 프로그램 ID 가 정해지기 전까지는 chrome-extension:// 스킴만 본다.
 * TODO(GE-20): 확장 프로그램 ID 가 정해지면 정확한 origin 만 허용한다.
 *   웹스토어에 올리거나 키를 고정해야 ID 가 정해진다.
 */
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false
  return origin.startsWith('chrome-extension://')
}

function corsHeaders(origin: string | null): Record<string, string> {
  // 허용한 origin 만 되돌려 준다. * 로 열지 않는다.
  if (!isAllowedOrigin(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin as string,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  })
}

/**
 * 허용한 origin 에서 온 요청의 응답. **성공이든 오류든 CORS 헤더를 붙인다.**
 *
 * 오류 응답에 CORS 헤더가 없으면 브라우저가 응답 자체를 막아서, 확장 프로그램은
 * 상태 코드 대신 `TypeError: Failed to fetch` 만 받는다. 429(잠시 후 재시도)와
 * 서버 장애를 구분할 수 없게 된다.
 */
function reply(origin: string | null, body: unknown, status: number): Response {
  return json(body, status, corsHeaders(origin))
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin')

    // --- 헬스 체크 -----------------------------------------------------------
    // 배포가 살아 있는지만 본다. 키나 설정값을 돌려주지 않는다.
    if (url.pathname === '/health') {
      return json(
        {
          ok: true,
          // 어느 질문 세트에 맞춘 서버인지 알 수 있게 모델만 밝힌다.
          model: env.JEV_MODEL,
        },
        200,
      )
    }

    // --- 사전 요청 -----------------------------------------------------------
    if (request.method === 'OPTIONS') {
      const headers = corsHeaders(origin)
      // 허용하지 않는 origin 이면 CORS 헤더를 주지 않는다. 브라우저가 알아서 막는다.
      return new Response(null, { status: Object.keys(headers).length ? 204 : 403, headers })
    }

    // --- 판단 요청 -----------------------------------------------------------
    if (url.pathname === '/v1/judge') {
      if (!isAllowedOrigin(origin)) {
        // 브라우저 안에서 다른 사이트가 부르는 것을 막는다.
        // **이것은 인증이 아니다.** 아래 TODO 를 본다.
        return json({ error: 'forbidden_origin' }, 403)
      }
      if (request.method !== 'POST') {
        return reply(origin, { error: 'method_not_allowed' }, 405)
      }

      // TODO(GE-18): 항목 id 검증 → Jev 호출 → 응답 중계.
      //   - judgment-items.json 에 없는 항목 id 는 거절한다.
      //     임의의 프롬프트를 통과시키면 우리 키로 남이 Jev 를 쓰는 셈이 된다.
      //   - items 의 request_group[feature] 가 요청의 group 과 다르면 거절한다.
      //     제목 판단에 본문이 섞이는 것을 막는다 (docs/architecture.md 4절).
      //   - 요청 본문 크기 상한 (MAX_REQUEST_BYTES).
      //   - 실패(429·타임아웃·보기 밖 응답)는 판단 보류로 돌려준다.
      //   - 요청 본문을 저장하지 않는다. 기사 글을 로그에 남기지 않는다.
      //
      // TODO(GE-20): **레이트 리밋.** Origin 헤더는 누구나 적어 보낼 수 있어서
      //   위 origin 검사는 인증이 아니다. curl 로 아무 값이나 넣으면 통과한다.
      //   Workers Rate Limiting 바인딩으로 IP 당 상한을 두고, 전체 상한을
      //   게이트웨이 한도 아래로 묶는다. 그래야 남의 호출이 우리 크레딧을
      //   소진하거나 실제 사용자의 배지를 전부 ⚪ 로 만드는 것을 막을 수 있다.
      return reply(origin, { error: 'not_implemented' }, 501)
    }

    return json({ error: 'not_found' }, 404)
  },
} satisfies ExportedHandler<Env>
