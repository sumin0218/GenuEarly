// Jev 호출. ChatKHU Gateway 경유다 (docs/jev.md 6-1절).
//
// **실패를 오류로 올리지 않는다.** 호출이 안 되면 그것은 장애가 아니라 "판단 보류"라는
// 결과다 (docs/architecture.md 5절). 그래서 이 함수는 던지지 않고 reason 을 돌려준다.
import type { Env } from './index'
import { answersAreValid, type Question } from './schema'

/** 사용자에게 보여 주지 않는다. 로그와 디버깅용이다 (docs/architecture.md 4절). */
export type Reason = 'rate_limited' | 'timeout' | 'upstream_error' | 'invalid_answer' | 'budget_exhausted'

export type JevResult =
  | { ok: true; answers: Record<string, unknown>; upstreamModel: unknown }
  | { ok: false; reason: Reason }

/** 429 를 만났을 때 기다렸다 다시 걸어 볼 최대 시간. */
const RETRY_BUDGET_MS = 1500

/**
 * 게이트웨이를 한 번 부른다.
 *
 * 분당 120건을 넘기면 `retry-after` 가 오는데 **실측값이 19초였다** (남은 창 시간).
 * 그만큼 기다리면 사용자는 20초 동안 빈 배지를 본다. **기다리는 것보다 ⚪ 가 낫다.**
 * 그래서 retry-after 가 RETRY_BUDGET_MS 안일 때만 다시 걸고, 아니면 바로 보류로 돌린다.
 */
export async function callJev(
  env: Env,
  state: Record<string, string>,
  questions: Record<string, Question>,
  criteria: Record<string, Question['criteria']>,
): Promise<JevResult> {
  const payload = JSON.stringify({ model: env.JEV_MODEL, state, questions })
  const timeout = Number(env.JEV_TIMEOUT_MS) || 8000

  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response
    try {
      res = await fetch(`${env.JEV_API_BASE_URL}/decisions/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.JEV_API_KEY}`, 'Content-Type': 'application/json' },
        body: payload,
        signal: AbortSignal.timeout(timeout),
      })
    } catch (e) {
      // AbortSignal.timeout 은 TimeoutError 를 던진다. 그 밖(네트워크)도 보류로 묶는다.
      const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
      console.warn(JSON.stringify({ at: 'jev', outcome: timedOut ? 'timeout' : 'network_error' }))
      return { ok: false, reason: timedOut ? 'timeout' : 'upstream_error' }
    }

    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after')) * 1000
      // 429 는 GE-11 을 다시 여는 방아쇠다. 실제로 관측되는지 남긴다.
      console.warn(JSON.stringify({ at: 'jev', outcome: 'rate_limited', retryAfterMs: wait || null, attempt }))
      if (attempt === 0 && Number.isFinite(wait) && wait > 0 && wait <= RETRY_BUDGET_MS) {
        await new Promise((r) => setTimeout(r, wait))
        continue
      }
      return { ok: false, reason: 'rate_limited' }
    }

    if (!res.ok) {
      // **원본 에러 본문을 싣지 않는다.** 키나 내부 정보가 섞여 나올 수 있다 (CWE-209).
      console.warn(JSON.stringify({ at: 'jev', outcome: 'upstream_error', status: res.status }))
      return { ok: false, reason: 'upstream_error' }
    }

    let body: unknown
    try {
      body = await res.json()
    } catch {
      console.warn(JSON.stringify({ at: 'jev', outcome: 'bad_json' }))
      return { ok: false, reason: 'upstream_error' }
    }

    const answers = (body as { answers?: unknown } | null)?.answers
    if (!answersAreValid(answers, criteria)) {
      // 정한 보기 밖의 답이 왔다. 억지로 해석하지 않고 보류로 둔다.
      console.warn(JSON.stringify({ at: 'jev', outcome: 'invalid_answer', ids: Object.keys(criteria) }))
      return { ok: false, reason: 'invalid_answer' }
    }

    return {
      ok: true,
      answers: answers as Record<string, unknown>,
      upstreamModel: (body as { model?: unknown }).model,
    }
  }

  return { ok: false, reason: 'rate_limited' }
}
