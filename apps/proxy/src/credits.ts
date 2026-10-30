// 크레딧 잔액을 보고 스스로 멈춘다.
//
// **지키려는 것은 "분당 몇 건" 이 아니라 크레딧 잔액이다.**
// 게이트웨이 한도(분당 120건)를 끝까지 쓰면 호출당 약 0.081 크레딧 × 120 = 분당 9.7,
// 시간당 583 이다. 월 할당 4,000 이 **약 7시간**이면 사라지고, 다음 달 1일까지 돌아오지 않는다.
// 제출·심사 기간에 그 일이 나면 판단이 전부 ⚪ 가 되고 문구·아이콘 생성까지 같이 막힌다.
//
// 그래서 예비분을 남겨 두고, 그 아래로 내려가면 판단을 멈춘다.
// **이것은 레이트 리밋이 아니다.** 분당 상한은 ratelimit.ts 가 맡는다 — 이 둘이 다른 것을 지킨다.
// 여기는 **월 예산**, 거기는 **분당 처리량**이다.
import type { Env } from './index'

type Snapshot = { remaining: number; at: number }

/**
 * 격리 수명 동안만 사는 캐시.
 *
 * 매 요청마다 잔액을 묻지 않는다. 호출이 두 배가 되고 지연도 는다.
 * 격리가 여럿이면 각자 한 번씩 받아 오는데, TTL 안에 최대 120건이 지나가도
 * 약 10 크레딧이라 예비분(기본 500)에 비하면 무시할 수 있다.
 */
let cache: Snapshot | null = null

/** 다음에 잔액을 물어볼 시각. **실패해도 미룬다** (아래). */
let nextCheckAt = 0

/** 마지막 판단 결과. `/health` 가 읽는다. 잔액 숫자는 들고 있지 않다. */
let paused = false

/** 테스트에서 격리 상태를 지운다. */
export function resetCreditCache(): void {
  cache = null
  paused = false
  nextCheckAt = 0
}

async function fetchRemaining(env: Env): Promise<number | null> {
  try {
    const res = await fetch(`${env.JEV_API_BASE_URL}/credits`, {
      headers: {
        Authorization: `Bearer ${env.JEV_API_KEY}`,
        // **게이트웨이 앞단 WAF 가 User-Agent 없는 요청을 403 으로 막는다** (jev.ts 와 같은 이유).
        // 빠뜨린 탓에 이 조회가 늘 403 이었고, 감시가 **조용히 꺼진 채** 돌고 있었다.
        // 한 번도 못 읽으면 통과시키도록 되어 있어 아무 증상이 없었다 — 로그에만 남았다.
        'User-Agent': 'GenuEarly/0.0.0 (+https://github.com/sumin0218/GenuEarly)',
      },
      signal: AbortSignal.timeout(Number(env.CREDITS_TIMEOUT_MS) || 3000),
    })
    if (!res.ok) {
      console.warn(JSON.stringify({ at: 'credits', outcome: 'http_error', status: res.status }))
      return null
    }
    const body = (await res.json()) as { total?: { remaining?: unknown } }
    const n = body?.total?.remaining
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      console.warn(JSON.stringify({ at: 'credits', outcome: 'bad_shape' }))
      return null
    }
    return n
  } catch {
    console.warn(JSON.stringify({ at: 'credits', outcome: 'unreachable' }))
    return null
  }
}

/**
 * 판단을 더 해도 되는가.
 *
 * **잔액을 한 번도 못 읽었으면 통과시킨다.** 일시적인 장애로 서비스를 멈추는 것이
 * 이 장치의 목적이 아니다. 막으려는 것은 **지속적인 소진**이고, 그건 한 번만 읽히면 잡힌다.
 * 못 읽은 것은 로그에 남는다.
 */
export async function budgetAllows(env: Env): Promise<boolean> {
  const reserve = Number(env.CREDITS_RESERVE)
  if (!Number.isFinite(reserve) || reserve <= 0) return true   // 감시를 끈 설정

  const ttl = Number(env.CREDITS_TTL_MS) || 60_000
  if (Date.now() >= nextCheckAt) {
    const remaining = await fetchRemaining(env)
    // **실패해도 다음 조회 시각을 미룬다.** 안 미루면 `/credits` 가 내려가 있는 동안
    // 들어오는 요청마다 다시 부르고 타임아웃(기본 3초)까지 기다린다 — 배지가 그만큼 늦고,
    // 죽은 엔드포인트를 요청 수만큼 두드린다.
    nextCheckAt = Date.now() + ttl
    if (remaining !== null) cache = { remaining, at: Date.now() }
    else if (!cache) return true        // 한 번도 못 읽었다 — 통과시킨다
    // 읽기에 실패했지만 지난 값이 있으면 그 값으로 판단한다
  }

  // 조회를 미루는 동안 아직 한 번도 못 읽었을 수 있다. 그때는 통과시킨다 —
  // 일시적인 장애로 서비스를 멈추는 것이 이 장치의 목적이 아니다.
  if (!cache) return true

  const ok = cache.remaining > reserve
  if (ok !== !paused) {
    // 상태가 바뀔 때만 남긴다. 멈춘 동안 매 요청 찍으면 로그가 쓸모없어진다.
    console.warn(JSON.stringify({
      at: 'credits', outcome: ok ? 'resumed' : 'paused',
      remaining: cache.remaining, reserve,
    }))
  }
  paused = !ok
  return ok
}

/** `/health` 가 쓴다. **잔액 숫자는 밝히지 않는다.** 멈췄는지만 알려 준다. */
export function isPaused(): boolean {
  return paused
}

/**
 * 감시가 켜져 있는가. `/health` 가 쓴다.
 *
 * `CREDITS_RESERVE` 가 빠지면 `Number(undefined)` 가 `NaN` 이라 감시가 **조용히 꺼진다.**
 * "꺼진 줄 모르고 배포" 가 가장 위험한 실패 모드라 배포 직후 확인할 수 있게 한다.
 */
export function creditGuardOn(env: Env): boolean {
  const reserve = Number(env.CREDITS_RESERVE)
  return Number.isFinite(reserve) && reserve > 0
}
