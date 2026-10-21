// 진짜 게이트웨이에 붙여 보는 테스트. **키가 있을 때만 돈다.**
//
// 모의 테스트(worker.test.ts)는 우리가 상상한 게이트웨이와만 맞춰 본다.
// 규약이 실제와 맞는지는 한 번 불러 봐야 안다 — GE-31 에서 질문 세트 전체가
// 400 으로 돌아온 것이 모의만 보고 있었기 때문이다.
//
//   node --env-file=tools/content-gen/.env node_modules/vitest/vitest.mjs run integration
//
// CI 에서는 키가 없으므로 건너뛴다.
import { describe, expect, it } from 'vitest'
import worker, { type Env } from '../src/index'

const KEY = process.env.CHATKHU_API_KEY
const BASE = process.env.CHATKHU_API_BASE_URL

const env: Env = {
  JEV_API_KEY: KEY ?? '',
  JEV_API_BASE_URL: BASE ?? '',
  JEV_MODEL: 'jev-1.13.0',
  JEV_TIMEOUT_MS: '8000',
  MAX_REQUEST_BYTES: '65536',
}
const ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop'

const judge = (body: unknown) =>
  worker.fetch(
    new Request('https://proxy.invalid/v1/judge', {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env,
  )

// 실제 기사가 아니라 시험용으로 지어낸 글이다 (공개 저장소 규칙).
const HEADLINE = '충격! 전문가가 경고한 이 식품, 당신도 매일 먹고 있다'
const BODY =
  '최근 한 전문가가 특정 가공식품의 위험성을 지적했다. 업계에서는 과장된 주장이라는 반응이 나왔다. 꼭 주변에 공유해서 알려주시기 바란다.'

describe.skipIf(!KEY || !BASE)('실제 게이트웨이 (CHATKHU_API_KEY 가 있을 때만)', () => {
  const cases: [string, unknown, string[]][] = [
    ['① 제목+본문', {
      feature: 'page', group: 'headline_body',
      items: ['source_citation', 'headline_body_match', 'spread_inducement', 'emotional_language', 'ai_style_signal'],
      state: { headline: HEADLINE, body: BODY },
    }, ['source_citation', 'headline_body_match', 'spread_inducement', 'emotional_language', 'ai_style_signal']],

    ['① 제목만', {
      feature: 'page', group: 'headline_only',
      items: ['clickbait_headline'], state: { headline: HEADLINE },
    }, ['clickbait_headline']],

    ['① 문장', {
      feature: 'page', group: 'sentence',
      items: ['unverifiable_claim'],
      state: { sentence: '해당 식품의 국내 연간 소비량은 약 12만 톤으로 알려졌다.' },
    }, ['factual_assertion', 'named_basis']],

    ['② 포털 목록', {
      feature: 'portal_list', group: 'headline_only',
      items: ['clickbait_headline', 'spread_inducement'], state: { headline: HEADLINE },
    }, ['clickbait_headline', 'spread_inducement']],

    ['③ 선택 텍스트', {
      feature: 'selection', group: 'headline_body',
      items: ['emotional_language', 'ai_style_signal'], state: { body: BODY },
    }, ['emotional_language', 'ai_style_signal']],
  ]

  it.each(cases)('%s 가 답을 받는다', async (_name, body, expected) => {
    const res = await judge(body)
    expect(res.status).toBe(200)
    const j = (await res.json()) as { answers?: Record<string, unknown>; reason?: string }
    expect(j.reason, '판단 보류로 떨어지면 안 된다').toBeUndefined()
    expect(Object.keys(j.answers ?? {}).sort()).toEqual([...expected].sort())
  }, 20_000)

  it('어떤 응답에도 키가 들어가지 않는다', async () => {
    const res = await judge({
      feature: 'page', group: 'headline_only',
      items: ['clickbait_headline'], state: { headline: HEADLINE },
    })
    expect(await res.text()).not.toContain(KEY)
  }, 20_000)

  it('모르는 항목은 게이트웨이를 부르기 전에 거절한다', async () => {
    const res = await judge({
      feature: 'page', group: 'headline_body',
      items: ['make_me_a_poem'], state: { headline: HEADLINE, body: BODY },
    })
    expect(res.status).toBe(400)
  })
})
