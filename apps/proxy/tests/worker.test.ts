// 중계 서버의 경계 규칙을 검사한다.
//
// 여기서 보는 것은 "누구의 요청을 받고 무엇을 돌려주는가"다.
// 실제 Jev 중계 동작은 GE-18 에서 붙이고 그때 테스트도 함께 넣는다.
import { describe, expect, it } from 'vitest'
import worker, { type Env } from '../src/index'

const env: Env = {
  JEV_API_KEY: 'test-key-not-real',
  JEV_API_BASE_URL: 'https://example.invalid/v1/gateway',
  JEV_MODEL: 'jev-1.13.0',
  JEV_TIMEOUT_MS: '8000',
  MAX_REQUEST_BYTES: '65536',
}

const EXT_ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop'

const call = (path: string, init: RequestInit = {}) =>
  worker.fetch(new Request(`https://proxy.invalid${path}`, init), env)

describe('헬스 체크', () => {
  it('살아 있으면 200 과 모델 버전을 준다', async () => {
    const res = await call('/health')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, model: 'jev-1.13.0' })
  })

  it('키나 설정값을 돌려주지 않는다', async () => {
    const body = await (await call('/health')).text()
    expect(body).not.toContain(env.JEV_API_KEY)
    expect(body).not.toContain(env.JEV_API_BASE_URL)
  })
})

describe('요청 출처', () => {
  it('확장 프로그램이 아니면 거절한다', async () => {
    const res = await call('/v1/judge', {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
    })
    expect(res.status).toBe(403)
  })

  it('Origin 이 없으면 거절한다', async () => {
    const res = await call('/v1/judge', { method: 'POST' })
    expect(res.status).toBe(403)
  })

  it('CORS 를 * 로 열지 않는다', async () => {
    const res = await call('/v1/judge', {
      method: 'OPTIONS',
      headers: { Origin: EXT_ORIGIN },
    })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(EXT_ORIGIN)
    expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe('*')
  })

  it('허용하지 않는 origin 에는 CORS 헤더를 주지 않는다', async () => {
    const res = await call('/v1/judge', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example' },
    })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})

describe('그 밖', () => {
  it('없는 경로는 404', async () => {
    expect((await call('/')).status).toBe(404)
  })

  it('GET 으로 판단을 요청하면 405', async () => {
    const res = await call('/v1/judge', { method: 'GET', headers: { Origin: EXT_ORIGIN } })
    expect(res.status).toBe(405)
  })

  it('허용 origin 의 오류 응답에도 CORS 헤더가 있다', async () => {
    // 없으면 브라우저가 응답을 막아서 확장은 상태 코드 대신 Failed to fetch 만 받는다.
    for (const init of [
      { method: 'GET', headers: { Origin: EXT_ORIGIN } },
      { method: 'POST', headers: { Origin: EXT_ORIGIN } },
    ]) {
      const res = await call('/v1/judge', init)
      expect(res.status, 'OK 가 아닌 응답이어야 한다').not.toBe(200)
      expect(
        res.headers.get('Access-Control-Allow-Origin'),
        `${init.method} ${res.status} 응답에 CORS 헤더 없음`,
      ).toBe(EXT_ORIGIN)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 판단 중계 (GE-18)
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, vi } from 'vitest'
import schema from '../../../packages/shared/judgment-items.json'

const judge = (body: unknown, origin: string | null = EXT_ORIGIN) =>
  call('/v1/judge', {
    method: 'POST',
    headers: origin ? { Origin: origin, 'Content-Type': 'application/json' } : {},
    body: JSON.stringify(body),
  })

/** 기사 하나를 ① 로 검사할 때 보내는 모양. 실제로 쓰는 조합이다. */
const PAGE_BODY = {
  feature: 'page',
  group: 'headline_body',
  items: ['source_citation', 'headline_body_match'],
  state: { headline: '제목', body: '본문' },
}

/** Jev 가 돌려줄 법한 성공 응답을 만든다. */
function answersFor(ids: string[]) {
  const answers: Record<string, unknown> = {}
  for (const id of ids) {
    const item = schema.items.find((i) => i.id === id) as { question: { criteria: unknown } }
    const crit = item.question.criteria
    answers[id] = Array.isArray(crit)
      ? { type: 'score', score: 1.25, confidence: 0.8, legend: {}, probabilities: {} }
      : { type: 'choice', choice: Object.keys(crit as object)[0], confidence: 0.9, probabilities: {} }
  }
  return answers
}

let calls: { url: string; init: RequestInit }[] = []
const mockFetch = (impl: (url: string, init: RequestInit) => Response) =>
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return Promise.resolve(impl(url, init))
  })
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
const reasonOf = async (res: Response) => (await res.json() as { reason?: string }).reason
const errorOf = async (res: Response) => (await res.json() as { error?: string }).error

beforeEach(() => { calls = [] })
afterEach(() => { vi.unstubAllGlobals() })

describe('규약 검증 — 거절해야 하는 요청', () => {
  it('모르는 항목 id 는 거절한다', async () => {
    // 통과시키면 우리 키로 남이 Jev 를 쓰는 셈이 된다.
    const res = await judge({ ...PAGE_BODY, items: ['source_citation', 'make_me_a_poem'] })
    expect(res.status).toBe(400)
    expect(await errorOf(res)).toBe('unknown_item')
    expect(calls, 'Jev 를 부르면 안 된다').toHaveLength(0)
  })

  it('제목만 보는 항목을 본문 그룹에 넣으면 거절한다', async () => {
    // 통과하면 제목 판단에 본문이 섞인다. 본문 속 인젝션이 제목 판단에 닿는다.
    const res = await judge({ ...PAGE_BODY, items: ['clickbait_headline'] })
    expect(res.status).toBe(400)
    expect(await errorOf(res)).toBe('item_not_in_group')
  })

  it('본문을 보는 항목을 제목 그룹에 넣으면 거절한다', async () => {
    // 통과하면 본문 없이 출처를 묻게 되어 구조적으로 "출처 부재" 가 나온다.
    const res = await judge({
      feature: 'page', group: 'headline_only',
      items: ['source_citation'], state: { headline: '제목' },
    })
    expect(res.status).toBe(400)
    expect(await errorOf(res)).toBe('item_not_in_group')
  })

  it('그 기능이 쓰지 않는 항목은 거절한다', async () => {
    // ③ 선택 텍스트는 source_citation 을 보내지 않는다 (고른 글 밖에 출처가 있기 쉽다).
    const res = await judge({
      feature: 'selection', group: 'headline_body',
      items: ['source_citation'], state: { body: '고른 글' },
    })
    expect(res.status).toBe(400)
    expect(await errorOf(res)).toBe('item_not_in_feature')
  })

  it('그룹에 없는 state 필드는 무시가 아니라 거절이다', async () => {
    const res = await judge({
      feature: 'page', group: 'headline_only',
      items: ['clickbait_headline'], state: { headline: '제목', body: '몰래 넣은 본문' },
    })
    expect(res.status).toBe(400)
    expect(await errorOf(res)).toBe('field_not_in_group')
  })

  it('모르는 그룹은 거절한다', async () => {
    expect((await judge({ ...PAGE_BODY, group: 'everything' })).status).toBe(400)
  })

  it('크기를 넘으면 거절한다', async () => {
    const res = await judge({ ...PAGE_BODY, state: { headline: '제', body: 'ㄱ'.repeat(70000) } })
    expect(res.status).toBe(400)
    expect(await errorOf(res)).toBe('too_large')
    expect(calls).toHaveLength(0)
  })

  it('JSON 이 아니면 거절한다', async () => {
    const res = await call('/v1/judge', {
      method: 'POST', headers: { Origin: EXT_ORIGIN }, body: '{ broken',
    })
    expect(res.status).toBe(400)
  })

  it('빈 state 는 거절한다', async () => {
    expect((await judge({ ...PAGE_BODY, state: {} })).status).toBe(400)
  })
})

describe('Jev 로 보내는 것', () => {
  it('항목의 question 을 그대로 보내고 공통 지시만 덧붙인다', async () => {
    mockFetch(() => ok({ model: 'jev-latest', answers: answersFor(PAGE_BODY.items) }))
    await judge(PAGE_BODY)

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://example.invalid/v1/gateway/decisions/')
    const sent = JSON.parse(calls[0].init.body as string)

    expect(sent.model).toBe('jev-1.13.0')
    expect(sent.state).toEqual({ headline: '제목', body: '본문' })
    expect(Object.keys(sent.questions).sort()).toEqual(['headline_body_match', 'source_citation'])

    const origin = schema.items.find((i) => i.id === 'source_citation') as {
      question: { criteria: unknown; instructions: string }
    }
    // criteria 는 손대지 않는다
    expect(sent.questions.source_citation.criteria).toEqual(origin.question.criteria)
    // instructions 는 원문 + 공통 지시, 그 순서로
    expect(sent.questions.source_citation.instructions)
      .toBe(origin.question.instructions + '\n' + schema.common_instructions)
  })

  it('키를 Authorization 헤더로만 보낸다', async () => {
    mockFetch(() => ok({ model: 'jev-latest', answers: answersFor(PAGE_BODY.items) }))
    await judge(PAGE_BODY)
    const { init } = calls[0]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer ' + env.JEV_API_KEY)
    expect(init.body as string, '본문에 키가 섞이면 안 된다').not.toContain(env.JEV_API_KEY)
  })

  it('한 판단이 질문 여러 개로 나뉜 항목은 펼쳐서 보낸다', async () => {
    mockFetch(() => ok({
      model: 'jev-latest',
      answers: { factual_assertion: { type: 'noul', noul: 0.8 }, named_basis: { type: 'noul', noul: 0.1 } },
    }))
    const res = await judge({
      feature: 'page', group: 'sentence',
      items: ['unverifiable_claim'], state: { sentence: '한 문장.' },
    })
    expect(res.status).toBe(200)
    const sent = JSON.parse(calls[0].init.body as string)
    expect(Object.keys(sent.questions).sort()).toEqual(['factual_assertion', 'named_basis'])
    const body = await res.json() as { answers: Record<string, unknown> }
    expect(Object.keys(body.answers).sort()).toEqual(['factual_assertion', 'named_basis'])
  })
})

describe('Jev 응답 중계', () => {
  it('답을 해석하지 않고 그대로 돌려준다', async () => {
    const answers = answersFor(PAGE_BODY.items)
    mockFetch(() => ok({ model: 'jev-latest', answers }))
    const res = await judge(PAGE_BODY)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ model: 'jev-1.13.0', answers })
  })

  it('정한 보기 밖의 답이 오면 판단 보류다', async () => {
    mockFetch(() => ok({
      model: 'jev-latest',
      answers: {
        source_citation: { type: 'choice', choice: 'anything', confidence: 1 },
        headline_body_match: { type: 'choice', choice: 'partial', confidence: 1 },
      },
    }))
    const res = await judge(PAGE_BODY)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ model: 'jev-1.13.0', undetermined: true, reason: 'invalid_answer' })
  })

  it('빠진 답이 있으면 판단 보류다', async () => {
    mockFetch(() => ok({ model: 'jev-latest', answers: answersFor(['source_citation']) }))
    expect(await reasonOf(await judge(PAGE_BODY))).toBe('invalid_answer')
  })

  it('등급 범위를 벗어난 score 는 판단 보류다', async () => {
    // Score 는 0~1 이 아니라 0 ~ (등급 수 − 1) 이다. 등급 4개면 최대 3.
    mockFetch(() => ok({
      model: 'jev-latest',
      answers: { emotional_language: { type: 'score', score: 9, confidence: 1 } },
    }))
    const res = await judge({
      feature: 'page', group: 'headline_body',
      items: ['emotional_language'], state: { headline: '제목', body: '본문' },
    })
    expect(await reasonOf(res)).toBe('invalid_answer')
  })
})

describe('실패는 오류가 아니라 판단 보류다', () => {
  it('429 는 보류로 돌리고 긴 retry-after 를 기다리지 않는다', async () => {
    mockFetch(() => new Response(JSON.stringify({ detail: { message: 'internal' } }), {
      status: 429, headers: { 'retry-after': '19' },
    }))
    const res = await judge(PAGE_BODY)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ model: 'jev-1.13.0', undetermined: true, reason: 'rate_limited' })
    // 19초를 기다리면 사용자는 그동안 빈 배지를 본다. 기다리는 것보다 ⚪ 가 낫다.
    expect(calls, '긴 retry-after 에는 다시 걸지 않는다').toHaveLength(1)
  })

  it('짧은 retry-after 에는 한 번 다시 건다', async () => {
    let n = 0
    mockFetch(() => n++ === 0
      ? new Response('{}', { status: 429, headers: { 'retry-after': '1' } })
      : ok({ model: 'jev-latest', answers: answersFor(PAGE_BODY.items) }))
    const res = await judge(PAGE_BODY)
    expect(calls).toHaveLength(2)
    expect((await res.json() as { answers?: object }).answers).toBeDefined()
  })

  it('타임아웃은 보류다', async () => {
    vi.stubGlobal('fetch', () => {
      const e = new Error('timed out')
      e.name = 'TimeoutError'
      return Promise.reject(e)
    })
    expect(await reasonOf(await judge(PAGE_BODY))).toBe('timeout')
  })

  it('게이트웨이 5xx 는 보류이고 원본 본문이 새지 않는다', async () => {
    mockFetch(() => new Response('upstream stack trace', { status: 502 }))
    const text = await (await judge(PAGE_BODY)).text()
    expect(JSON.parse(text)).toEqual({ model: 'jev-1.13.0', undetermined: true, reason: 'upstream_error' })
    expect(text).not.toContain('stack trace')
  })

  it('어떤 응답에도 키가 들어가지 않는다', async () => {
    const cases = [
      () => new Response('{}', { status: 429 }),
      () => new Response('leak ' + env.JEV_API_KEY, { status: 500 }),
      () => ok({ model: 'jev-latest', answers: answersFor(PAGE_BODY.items) }),
    ]
    for (const c of cases) {
      mockFetch(c)
      expect(await (await judge(PAGE_BODY)).text()).not.toContain(env.JEV_API_KEY)
    }
  })
})
