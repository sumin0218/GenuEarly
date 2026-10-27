// GenuEarly Jev 중계 서버.
//
// **키를 가진 유일한 곳이다.** 확장 프로그램은 키를 모른다.
// 규칙은 apps/proxy/AGENT.md 와 docs/security/secure-coding.md 8절에 있다.
//
// 하는 일은 넷뿐이다. 요청이 우리 것인지 보고, 판단 항목이 규약에 맞는지 보고,
// 판단기를 노린 문장을 걷어내고(GE-35), Jev 로 넘긴다.
// **점수로 바꾸거나 해석하지 않는다.** 그건 확장 프로그램의 몫이다 (docs/architecture.md 5절).
import { buildRequest, isRejection, screenState, SCHEMA_MODEL, SCHEMA_VERSION } from './schema'
import { callJev } from './jev'
import { budgetAllows, creditGuardOn, isPaused } from './credits'
import { RETRY_AFTER_S, withinLimits } from './ratelimit'

export interface Env {
  /** ChatKHU API 키. wrangler secret 으로 넣는다. 로그에 남기지 않는다. */
  JEV_API_KEY: string
  JEV_API_BASE_URL: string
  JEV_MODEL: string
  JEV_TIMEOUT_MS: string
  MAX_REQUEST_BYTES: string
  /** 이만큼은 남겨 둔다. 아래로 내려가면 판단을 멈춘다. 0 이면 감시를 끈다 */
  CREDITS_RESERVE: string
  /** 잔액을 다시 묻기까지의 간격(ms) */
  CREDITS_TTL_MS: string
  CREDITS_TIMEOUT_MS: string
  /** 폭주 차단기. ratelimit.ts 를 본다. 없으면 통과시킨다 (로컬·테스트) */
  RATE_LIMIT_BURST?: RateLimit
  RATE_LIMIT_BUDGET?: RateLimit
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
function reply(
  origin: string | null,
  body: unknown,
  status: number,
  extra: Record<string, string> = {},
): Response {
  return json(body, status, { ...corsHeaders(origin), ...extra })
}

/**
 * 설정한 모델과 게이트웨이가 답한 모델이 다르면 한 번만 알린다.
 *
 * 다른 버전에 맞추지 않은 질문을 쓰고 있다는 뜻이라 봐야 하는 신호인데,
 * **게이트웨이 경로에서는 항상 다르다.** 보내는 것은 jev-1.13.0 이지만 응답의 model 은
 * 늘 jev-latest 로 정규화돼 돌아온다 (docs/jev.md 6-1절). 그래서 매 요청 경고하면
 * 로그가 쓸모없어진다. 격리 수명당 한 번만 남긴다.
 */
let modelWarned = false
function warnOnModelMismatch(env: Env, upstream: unknown): void {
  if (modelWarned || upstream === env.JEV_MODEL) return
  modelWarned = true
  console.warn(
    JSON.stringify({
      at: 'model',
      sent: env.JEV_MODEL,
      got: upstream,
      schema: `${SCHEMA_MODEL}@${SCHEMA_VERSION}`,
      note: 'gateway normalises to an alias; expected on this path',
    }),
  )
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
          // 크레딧 예비분 아래로 내려가 판단을 멈췄는지. **잔액 숫자는 밝히지 않는다.**
          paused: isPaused(),
          // **두 장치가 켜져 있는지.** 바인딩이나 설정값이 빠지면 조용히 꺼진 채 돌아간다.
          // 배포 직후 여기서 확인한다 (apps/proxy/README.md 배포 절).
          guards: {
            ratelimit: Boolean(env.RATE_LIMIT_BURST && env.RATE_LIMIT_BUDGET),
            credits: creditGuardOn(env),
          },
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

      // --- 폭주 차단 --------------------------------------------------------
      // 본문을 읽기 전에 본다. 폭주면 파싱도 하지 않는다.
      //
      // **여기서는 200 이 아니라 429 를 돌려준다.** 다른 실패와 다르다 —
      // 폭주하는 클라이언트에 200 을 주면 그 클라이언트는 아무것도 배우지 않고 계속 때린다.
      // 429 와 Retry-After 로 물러서라고 말해야 한다. 확장 프로그램은 이것을 ⚪ 로 보이고
      // 그 시간만큼 쉰다 (docs/architecture.md 4절).
      const verdict = await withinLimits(env, request)
      if (!verdict.ok) {
        return reply(origin, { error: 'rate_limited', scope: verdict.which }, 429, {
          'Retry-After': String(RETRY_AFTER_S),
        })
      }


      // --- 크기 상한 --------------------------------------------------------
      // 본문을 읽기 전에 먼저 막는다. 큰 요청으로 CPU 와 크레딧을 태우지 못하게 한다.
      const max = Number(env.MAX_REQUEST_BYTES) || 65536
      const declared = Number(request.headers.get('Content-Length'))
      if (Number.isFinite(declared) && declared > max) {
        return reply(origin, { error: 'too_large' }, 400)
      }
      const raw = await request.text()
      // Content-Length 는 없을 수도, 거짓일 수도 있다. 실제 길이로 다시 본다.
      if (new TextEncoder().encode(raw).length > max) {
        return reply(origin, { error: 'too_large' }, 400)
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        return reply(origin, { error: 'invalid_json' }, 400)
      }

      // --- 규약 검증 --------------------------------------------------------
      // 모르는 항목 id 를 통과시키면 우리 키로 남이 Jev 를 쓰는 셈이 된다.
      // 항목·그룹·기능의 짝까지 본다. 안 보면 제목 판단에 본문이 섞인다.
      const built = buildRequest(parsed)
      if (isRejection(built)) {
        return reply(origin, { error: built.error, detail: built.detail }, 400)
      }

      // --- 보내기 전 걷어내기 (GE-35) ----------------------------------------
      // 본문에 우리 항목 키·보기 이름을 적거나 [SYSTEM]·</…> 로 꾸민 문장은 모델이 보지 못하게 뺀다.
      // 질문 문구로 막는 것은 모델이 따를지 고르지만, 걷어낸 문장은 볼 수 없다.
      // **로그에는 걷어낸 수만 남긴다. 글은 남기지 않는다** (남이 쓴 글이다).
      const screened = screenState(built.state)
      if (screened.removed) console.warn(JSON.stringify({ at: 'screen', removed: screened.removed, emptied: !screened.ok }))
      if (!screened.ok) {
        // 남은 글이 없다. Jev 를 부르지 않는다 — 크레딧도 쓰지 않는다
        return reply(origin, { model: env.JEV_MODEL, undetermined: true, reason: 'screened_out' }, 200)
      }

      // --- 예산 ------------------------------------------------------------
      // 레이트 리밋이 아니다. 지키려는 것은 분당 건수가 아니라 **크레딧 잔액**이다.
      // 한도껏 쓰면 월 할당이 7시간이면 사라지고 다음 달까지 돌아오지 않는다.
      if (!(await budgetAllows(env))) {
        return reply(origin, { model: env.JEV_MODEL, undetermined: true, reason: 'budget_exhausted' }, 200)
      }

      // --- 호출 -------------------------------------------------------------
      const out = await callJev(env, screened.state, built.questions, built.criteria)

      if (!out.ok) {
        // 실패가 아니라 결과다. 그래서 200 이다 (packages/shared/README.md).
        return reply(origin, { model: env.JEV_MODEL, undetermined: true, reason: out.reason }, 200)
      }

      warnOnModelMismatch(env, out.upstreamModel)
      // Jev 응답을 그대로 중계한다. 서버가 해석하거나 점수로 바꾸지 않는다.
      return reply(origin, { model: env.JEV_MODEL, answers: out.answers }, 200)
    }

    return json({ error: 'not_found' }, 404)
  },
} satisfies ExportedHandler<Env>
