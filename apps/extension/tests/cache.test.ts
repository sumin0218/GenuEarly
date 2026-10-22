// 판단 결과 캐시.
//
// 가장 중요한 검사는 **캐시가 열람 기록이 되지 않는가**와
// **② 가 채운 제목 항목만 보고 ① 이 "캐시 있음" 으로 넘어가지 않는가** 둘이다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import schema from '../../../packages/shared/judgment-items.json'
import { CACHE_TTL_MS, normalizeUrl, readScores, sweepExpired, writeScores } from '../lib/cache'

/** chrome.storage.local 을 메모리로 흉내 낸다. */
const store = new Map<string, unknown>()
const fakeStorage = {
  get: (k: string | null) =>
    Promise.resolve(k === null ? Object.fromEntries(store) : { [k]: store.get(k) }),
  set: (o: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(o)) store.set(k, v)
    return Promise.resolve()
  },
  remove: (keys: string[]) => {
    for (const k of keys) store.delete(k)
    return Promise.resolve()
  },
}

beforeEach(() => {
  store.clear()
  vi.useRealTimers()
  vi.stubGlobal('browser', { storage: { local: fakeStorage } })
})

const URL1 = 'https://n.news.naver.com/article/001/0001'

describe('URL 정규화 — 같은 기사가 여러 키로 갈라지지 않게', () => {
  it('쿼리를 버린다', () => {
    expect(normalizeUrl(`${URL1}?sid=105&utm_source=x`)).toBe(normalizeUrl(URL1))
  })

  it('mnews 경로를 맞춘다', () => {
    // 네이버는 같은 기사를 두 경로로 준다.
    expect(normalizeUrl('https://n.news.naver.com/mnews/article/001/0001')).toBe(normalizeUrl(URL1))
  })

  it('해시와 끝 슬래시를 버린다', () => {
    expect(normalizeUrl(`${URL1}/#comment`)).toBe(normalizeUrl(URL1))
  })

  it('다른 기사는 다른 값이다', () => {
    expect(normalizeUrl(URL1)).not.toBe(normalizeUrl('https://n.news.naver.com/article/001/0002'))
  })
})

describe('캐시가 열람 기록이 되지 않는다', () => {
  it('키에 URL 원문이 들어가지 않는다', async () => {
    await writeScores(URL1, { clickbait_headline: 1 })
    const keys = [...store.keys()]
    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatch(/^judgment:[0-9a-f]{64}$/)
    expect(keys[0]).not.toContain('naver')
  })

  it('값에 URL 도 기사 글도 들어가지 않는다', async () => {
    await writeScores(URL1, { clickbait_headline: 1, source_citation: 0 })
    const dumped = JSON.stringify([...store.entries()])
    expect(dumped).not.toContain('naver')
    expect(dumped).not.toContain('article')
  })

  it('판단 시각이 아니라 만료 시각만 둔다', async () => {
    const before = Date.now()
    await writeScores(URL1, { clickbait_headline: 1 })
    const e = [...store.values()][0] as Record<string, number>
    // 저장된 시각 값은 만료 하나뿐이고, 그 값에서 "언제 읽었는지" 를 바로 읽을 수 없다.
    const times = Object.values(e).filter((v) => typeof v === 'number')
    expect(times).toHaveLength(1)
    expect(e.exp).toBeGreaterThanOrEqual(before + CACHE_TTL_MS)
  })
})

describe('항목 단위로 쌓는다', () => {
  it('②가 제목 항목만 채워도 ①이 속지 않는다', async () => {
    // ② 포털 목록은 제목만 보는 항목만 판단한다.
    await writeScores(URL1, { clickbait_headline: 1, spread_inducement: 0 })
    const got = await readScores(URL1)

    // ① 이 필요로 하는 항목들
    const needed = ['clickbait_headline', 'source_citation', 'headline_body_match', 'unverifiable_claim']
    const missing = needed.filter((id) => !(id in got))
    expect(missing, '②가 안 채운 항목은 ①이 다시 물어야 한다')
      .toEqual(['source_citation', 'headline_body_match', 'unverifiable_claim'])
  })

  it('나중 것이 앞 것 위에 쌓인다', async () => {
    await writeScores(URL1, { clickbait_headline: 1 })
    await writeScores(URL1, { source_citation: 0 })
    expect(await readScores(URL1)).toEqual({ clickbait_headline: 1, source_citation: 0 })
  })

  it('판단 보류(null)도 결과로 저장한다', async () => {
    // null 은 "안 물어봤다" 가 아니라 "물어봤는데 모르겠다" 다. 다시 묻지 않는다.
    await writeScores(URL1, { ai_style_signal: null })
    const got = await readScores(URL1)
    expect('ai_style_signal' in got).toBe(true)
    expect(got.ai_style_signal).toBeNull()
  })
})

describe('버리는 조건', () => {
  it('만료되면 비어 있다', async () => {
    vi.useFakeTimers()
    await writeScores(URL1, { clickbait_headline: 1 })
    vi.advanceTimersByTime(CACHE_TTL_MS + 1000)
    expect(await readScores(URL1)).toEqual({})
  })

  it('질문 세트 버전이 다르면 버린다', async () => {
    // 다른 기준으로 낸 판단이다.
    await writeScores(URL1, { clickbait_headline: 1 })
    const [k, v] = [...store.entries()][0] as [string, Record<string, unknown>]
    store.set(k, { ...v, v: '0.0.1-old' })
    expect(await readScores(URL1)).toEqual({})
  })

  it('모델이 바뀌면 버린다', async () => {
    await writeScores(URL1, { clickbait_headline: 1 })
    const [k, v] = [...store.entries()][0] as [string, Record<string, unknown>]
    store.set(k, { ...v, m: 'jev-99' })
    expect(await readScores(URL1)).toEqual({})
  })

  it('지금 질문 세트로 쓴 것은 읽힌다', async () => {
    await writeScores(URL1, { clickbait_headline: 1 })
    const v = [...store.values()][0] as Record<string, unknown>
    expect(v.v).toBe(schema.version)
    expect(v.m).toBe(schema.model)
  })

  it('만료된 것을 비운다 — 남겨 두면 그 자체가 기록이다', async () => {
    vi.useFakeTimers()
    await writeScores(URL1, { clickbait_headline: 1 })
    await writeScores('https://n.news.naver.com/article/001/0002', { clickbait_headline: 0 })
    vi.advanceTimersByTime(CACHE_TTL_MS + 1000)
    expect(await sweepExpired()).toBe(2)
    expect(store.size).toBe(0)
  })

  it('살아 있는 것은 비우지 않는다', async () => {
    await writeScores(URL1, { clickbait_headline: 1 })
    expect(await sweepExpired()).toBe(0)
    expect(store.size).toBe(1)
  })
})

describe('저장소가 말을 안 들어도 판단을 막지 않는다', () => {
  it('읽기 실패는 캐시 없음으로 본다', async () => {
    vi.stubGlobal('browser', { storage: { local: { ...fakeStorage, get: () => Promise.reject(new Error('nope')) } } })
    expect(await readScores(URL1)).toEqual({})
  })

  it('쓰기 실패해도 던지지 않는다', async () => {
    vi.stubGlobal('browser', { storage: { local: { ...fakeStorage, set: () => Promise.reject(new Error('quota')) } } })
    await expect(writeScores(URL1, { clickbait_headline: 1 })).resolves.toBeUndefined()
  })

  it('빈 결과는 쓰지 않는다', async () => {
    await writeScores(URL1, {})
    expect(store.size).toBe(0)
  })
})
