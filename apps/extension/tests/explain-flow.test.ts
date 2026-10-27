// 심층 분석이 **실제로 중계 서버까지 가는가.** 배포본에서 "짚어 내지 못했습니다" 만
// 뜨는데 중계 서버를 직접 두드리면 잘 집어 오길래, 가운데 어디서 끊기는지 본다.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { judgeExplain } from '../lib/judge'

let calls: { url: string; body: unknown }[] = []

beforeEach(() => {
  calls = []
  vi.stubGlobal('browser', { runtime: { id: 'test' } })
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(init.body as string) })
    if (String(url).includes('/v1/explain')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ picks: [{ text: '한 관계자는', why: 'src_group_only' }] }),
          { status: 200 },
        ),
      )
    }
    return Promise.resolve(new Response(JSON.stringify({ answers: {} }), { status: 200 }))
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('심층 분석이 중계 서버까지 가는가', () => {
  const BODY = '한 관계자는 더 오를 것이라고 말했다.'

  it('출처 표시는 /v1/explain 을 부른다', async () => {
    const out = await judgeExplain({
      kind: 'judge-explain',
      url: 'https://n.news.naver.com/article/001/0001',
      body: BODY,
      itemId: 'source_citation',
      level: 'CAUTION',
    })
    console.log('부른 곳:', calls.map((c) => c.url))
    console.log('돌려준 것:', JSON.stringify(out))
    expect(calls.some((c) => c.url.includes('/v1/explain'))).toBe(true)
    expect(out?.picks).toEqual([{ text: '한 관계자는', why: 'src_group_only' }])
  })

  it('확인하기 어려운 주장도 부른다', async () => {
    const out = await judgeExplain({
      kind: 'judge-explain',
      url: 'https://n.news.naver.com/article/001/0001',
      body: BODY,
      itemId: 'unverifiable_claim',
      level: 'CAUTION',
    })
    expect(calls.some((c) => c.url.includes('/v1/explain'))).toBe(true)
    expect(out?.picks?.length).toBe(1)
  })

  it('감정적 표현은 코드가 빈손일 때만 부른다', async () => {
    await judgeExplain({
      kind: 'judge-explain', url: 'x', body: BODY, itemId: 'emotional_language', level: 'CAUTION',
    })
    expect(calls, '코드가 찾았으면 부르지 않는다').toHaveLength(0)

    await judgeExplain({
      kind: 'judge-explain', url: 'x', body: BODY, itemId: 'emotional_language',
      level: 'CAUTION', noEvidence: true,
    })
    expect(calls.some((c) => c.url.includes('/v1/explain'))).toBe(true)
  })
})
