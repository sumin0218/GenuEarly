// @vitest-environment happy-dom
//
// 리포트가 **조사할 문장을 어디서 얻는가.**
//
// 둘에서 온다. ① 나란히 볼 핵심 문장은 `/v1/claims` 로 늘 고른다. ② 걸린 대목은
// **콘텐츠 스크립트가 Jev 의 문장 답에서 뽑아 넘겨 준다.**
//
// 여기서 보는 것은 **②가 생성 모델을 다시 부르지 않는가**다. 전에는 `/v1/explain`
// 으로 물었고, 그 답이 Jev 의 문장 점수와 어긋나면 리포트와 형광펜이 다른 문장을
// 가리켰다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReportRow } from '../lib/protocol'

let 부른곳: string[] = []
let 저장소: Record<string, unknown> = {}

/** `/v1/claims` 가 돌려줄 것. 시험마다 바꾼다 */
let 핵심문장: { text: string; why: string }[] = []

beforeEach(() => {
  부른곳 = []
  저장소 = {}
  핵심문장 = [{ text: '핵심 문장이다.', why: 'claim_core' }]
  vi.stubGlobal('browser', {
    runtime: { id: 'test' },
    storage: {
      session: {
        get: (k: string) => Promise.resolve({ [k]: 저장소[k] }),
        set: (o: Record<string, unknown>) => { Object.assign(저장소, o); return Promise.resolve() },
        remove: (k: string) => { delete 저장소[k]; return Promise.resolve() },
      },
      local: {
        get: (k: string) => Promise.resolve({ [k]: 저장소[k] }),
        set: (o: Record<string, unknown>) => { Object.assign(저장소, o); return Promise.resolve() },
      },
    },
  })
  vi.stubGlobal('fetch', (url: string) => {
    const u = String(url)
    부른곳.push(u.replace(/^https?:\/\/[^/]+/, ''))
    if (u.includes('/v1/claims')) {
      return Promise.resolve(new Response(JSON.stringify({ claims: 핵심문장 }), { status: 200 }))
    }
    if (u.includes('/v1/records')) {
      return Promise.resolve(new Response(JSON.stringify({ records: [] }), { status: 200 }))
    }
    if (u.includes('/v1/brief')) {
      return Promise.resolve(new Response(JSON.stringify({ brief: null, reason: 'unusable' }), { status: 200 }))
    }
    // **여기 오면 안 되는 길도 있다.** 오면 부른곳에 남아 시험이 잡는다.
    return Promise.resolve(new Response(JSON.stringify({ picks: [] }), { status: 200 }))
  })
})
afterEach(() => vi.unstubAllGlobals())

const 기사 = {
  url: 'https://n.news.naver.com/article/001/0001',
  headline: '머리글',
  date: '2026-10-28',
  body: '핵심 문장이다. 한 관계자는 더 오를 것이라고 말했다.',
}

const 걸린줄: ReportRow[] = [
  { id: 'unverifiable_claim', level: 'CAUTION' },
  { id: 'source_citation', level: 'CHECK' },
] as ReportRow[]

describe('걸린 대목을 어디서 얻나', () => {
  it('**/v1/explain 을 부르지 않는다**', async () => {
    const { buildReport } = await import('../lib/report')
    await buildReport(기사, 걸린줄, [{ text: '한 관계자는 더 오를 것이라고 말했다.', why: 'uvc_group_only' }])
    expect(부른곳.some((u) => u.includes('/v1/explain'))).toBe(false)
  })

  it('넘겨받은 대목이 리포트의 문장으로 들어간다', async () => {
    const { buildReport } = await import('../lib/report')
    const 대목 = { text: '한 관계자는 더 오를 것이라고 말했다.', why: 'uvc_group_only' }
    const r = await buildReport(기사, 걸린줄, [대목])
    expect(r.claims.map((c) => c.text)).toContain(대목.text)
  })

  it('**핵심 문장이 앞자리다** — 신호를 앞세우면 흠잡기로 읽힌다', async () => {
    const { buildReport } = await import('../lib/report')
    const r = await buildReport(기사, 걸린줄, [{ text: '한 관계자는 더 오를 것이라고 말했다.', why: 'uvc_group_only' }])
    expect(r.claims[0]?.text).toBe('핵심 문장이다.')
  })

  it('대목을 안 넘기면 핵심 문장만으로 간다 — 캐시에서 온 판정이다', async () => {
    const { buildReport } = await import('../lib/report')
    const r = await buildReport(기사, 걸린줄)
    expect(r.claims.map((c) => c.text)).toEqual(['핵심 문장이다.'])
    expect(부른곳.some((u) => u.includes('/v1/explain'))).toBe(false)
  })

  it('같은 문장이 두 곳에서 와도 한 번만 넣는다', async () => {
    const { buildReport } = await import('../lib/report')
    const r = await buildReport(기사, 걸린줄, [
      { text: '핵심 문장이다.', why: 'uvc_no_basis' },
      { text: '한 관계자는 더 오를 것이라고 말했다.', why: 'uvc_group_only' },
    ])
    expect(r.claims.filter((c) => c.text === '핵심 문장이다.')).toHaveLength(1)
  })

  it('핵심 문장도 대목도 없으면 리포트를 만들지 않는다', async () => {
    핵심문장 = []
    const { buildReport } = await import('../lib/report')
    const r = await buildReport(기사, [], [])
    expect(r.stage).toBe('failed')
    expect(r.reason).toBe('no_claims')
  })

  it('**본문을 리포트에 넣지 않는다** — 보관함까지 디스크로 간다', async () => {
    const { buildReport } = await import('../lib/report')
    const r = await buildReport(기사, 걸린줄, [])
    expect(JSON.stringify(r)).not.toContain(기사.body)
  })
})
