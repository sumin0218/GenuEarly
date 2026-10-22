// 폭주 차단기.
//
// **막으려는 것은 악의적인 제3자가 아니라 우리 코드다.** 대회 전에는 웹스토어에 올리지 않아
// 주소를 아는 사람이 우리와 심사위원뿐이다. 반면 확장 프로그램의 재시도 한 줄이나
// 포털 목록의 `MutationObserver` 가 제가 넣은 요소에 다시 반응하는 것(requirements.md 4-2절)은
// 분당 수천 건을 낸다. 잔액 감시(credits.ts)는 예비분까지 태운 뒤에야 멈추므로
// 그 사이에 3,200 크레딧(약 4만 건)이 몇 분 만에 사라질 수 있다.
//
// 그래서 이것은 **공평한 분배 장치가 아니라 차단기**다. 정상 사용은 건드리지 않고
// 정상일 수 없는 양만 끊는다.
import type { Env } from './index'

/**
 * 왜 이 값인가.
 *
 * - **BURST (IP당 분당 150)** — 실측상 정상 사용의 최대는 이렇다.
 *   긴 기사 하나가 41건(39문장), 포털 목록 한 화면이 제목 수만큼, 바쁘게 훑는 심사위원이
 *   분당 60~100건이다. 150 은 그 위이고, 폭주(분당 수천)는 한참 아래다.
 *   **정상 사용자를 끊지 않으면서 폭주만 잡는 자리다.**
 * - **BUDGET (전체 분당 110)** — 게이트웨이 한도가 분당 120 이다. 그 아래에서 **우리가 먼저**
 *   거절하면 대기 시간을 우리가 정한다. ChatKHU 의 429 는 `retry-after` 가 19초였다.
 *
 * **카운터는 Cloudflare 지점별로 따로 센다.** 전역 합산이 아니다. 우리 사용자는 대부분
 * 한국이라 한 지점에 몰릴 가능성이 높지만 **가정이지 보장이 아니다.** 엄밀한 전역 한도는
 * Durable Objects 가 필요하다.
 */
export type Limits = { BURST: RateLimit | undefined; BUDGET: RateLimit | undefined }

/** 우리가 거절할 때 알려 주는 대기 시간(초). 창이 60초라 그만큼이면 반드시 풀린다. */
export const RETRY_AFTER_S = 60

let warnedMissing = false

export type LimitVerdict = { ok: true } | { ok: false; which: 'burst' | 'budget' }

/**
 * 이 요청을 받아도 되는가.
 *
 * 바인딩이 없으면(로컬 개발, 테스트) 통과시키고 한 번만 알린다.
 * 바인딩을 안 걸고 배포하는 실수는 `wrangler.jsonc` 가 막는다.
 */
export async function withinLimits(env: Env, request: Request): Promise<LimitVerdict> {
  const burst = env.RATE_LIMIT_BURST
  const budget = env.RATE_LIMIT_BUDGET
  if (!burst || !budget) {
    if (!warnedMissing) {
      warnedMissing = true
      console.warn(JSON.stringify({ at: 'ratelimit', outcome: 'binding_missing' }))
    }
    return { ok: true }
  }

  // IP 가 없으면 모두를 한 통에 넣는다. 비면 통과시키는 것보다 낫다.
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'

  // 전체부터 본다. 예산이 바닥이면 누구의 요청이든 받을 수 없다.
  if (!(await budget.limit({ key: 'all' })).success) {
    console.warn(JSON.stringify({ at: 'ratelimit', outcome: 'budget' }))
    return { ok: false, which: 'budget' }
  }
  if (!(await burst.limit({ key: ip })).success) {
    // 폭주는 대개 우리 쪽 버그다. 어느 IP 인지 남긴다.
    console.warn(JSON.stringify({ at: 'ratelimit', outcome: 'burst', ip }))
    return { ok: false, which: 'burst' }
  }
  return { ok: true }
}
