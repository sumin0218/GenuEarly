// 판단 결과 캐시.
//
// 가장 중요한 검사는 **캐시가 열람 기록이 되지 않는가**와
// **② 가 채운 제목 항목만 보고 ① 이 "캐시 있음" 으로 넘어가지 않는가** 둘이다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import schema from '../../../packages/shared/judgment-items.json'
import {
  CACHE_TTL_MS,
  normalizeUrl,
  packPicks,
  readExplain,
  readScores,
  sweepExpired,
  unpackPicks,
  writeExplain,
  writeScores,
  type CachedItem,
} from '../lib/cache'

/** 캐시에 넣는 항목 결과를 짧게 만든다. `isConfident` 가 빠지면 decideBadge 가 다르게 읽는다. */
const item = (score: number | null, isConfident = true): CachedItem => ({ score, isConfident })

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
    await writeScores(URL1, { clickbait_headline: item(1) })
    const keys = [...store.keys()]
    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatch(/^judgment:[0-9a-f]{64}$/)
    expect(keys[0]).not.toContain('naver')
  })

  it('값에 URL 도 기사 글도 들어가지 않는다', async () => {
    await writeScores(URL1, { clickbait_headline: item(1), source_citation: item(0) })
    const dumped = JSON.stringify([...store.entries()])
    expect(dumped).not.toContain('naver')
    expect(dumped).not.toContain('article')
  })

  it('판단 시각이 아니라 만료 시각만 둔다', async () => {
    const before = Date.now()
    await writeScores(URL1, { clickbait_headline: item(1) })
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
    await writeScores(URL1, { clickbait_headline: item(1), spread_inducement: item(0) })
    const got = await readScores(URL1)

    // ① 이 필요로 하는 항목들
    const needed = ['clickbait_headline', 'source_citation', 'headline_body_match', 'unverifiable_claim']
    const missing = needed.filter((id) => !(id in got))
    expect(missing, '②가 안 채운 항목은 ①이 다시 물어야 한다')
      .toEqual(['source_citation', 'headline_body_match', 'unverifiable_claim'])
  })

  it('나중 것이 앞 것 위에 쌓인다', async () => {
    await writeScores(URL1, { clickbait_headline: item(1) })
    await writeScores(URL1, { source_citation: item(0) })
    expect(await readScores(URL1)).toEqual({ clickbait_headline: item(1), source_citation: item(0) })
  })

  it('판단 보류(null)도 결과로 저장한다', async () => {
    // null 은 "안 물어봤다" 가 아니라 "물어봤는데 모르겠다" 다. 다시 묻지 않는다.
    await writeScores(URL1, { ai_style_signal: item(null, false) })
    const got = await readScores(URL1)
    expect('ai_style_signal' in got).toBe(true)
    expect(got.ai_style_signal?.score).toBeNull()
  })
})

describe('버리는 조건', () => {
  it('만료되면 비어 있다', async () => {
    vi.useFakeTimers()
    await writeScores(URL1, { clickbait_headline: item(1) })
    vi.advanceTimersByTime(CACHE_TTL_MS + 1000)
    expect(await readScores(URL1)).toEqual({})
  })

  it('질문 세트 버전이 다르면 버린다', async () => {
    // 다른 기준으로 낸 판단이다.
    await writeScores(URL1, { clickbait_headline: item(1) })
    const [k, v] = [...store.entries()][0] as [string, Record<string, unknown>]
    store.set(k, { ...v, v: '0.0.1-old' })
    expect(await readScores(URL1)).toEqual({})
  })

  it('모델이 바뀌면 버린다', async () => {
    await writeScores(URL1, { clickbait_headline: item(1) })
    const [k, v] = [...store.entries()][0] as [string, Record<string, unknown>]
    store.set(k, { ...v, m: 'jev-99' })
    expect(await readScores(URL1)).toEqual({})
  })

  it('지금 질문 세트로 쓴 것은 읽힌다', async () => {
    await writeScores(URL1, { clickbait_headline: item(1) })
    const v = [...store.values()][0] as Record<string, unknown>
    expect(v.v).toBe(schema.version)
    expect(v.m).toBe(schema.model)
  })

  it('만료된 것을 비운다 — 남겨 두면 그 자체가 기록이다', async () => {
    vi.useFakeTimers()
    await writeScores(URL1, { clickbait_headline: item(1) })
    await writeScores('https://n.news.naver.com/article/001/0002', { clickbait_headline: item(0) })
    vi.advanceTimersByTime(CACHE_TTL_MS + 1000)
    expect(await sweepExpired()).toBe(2)
    expect(store.size).toBe(0)
  })

  it('살아 있는 것은 비우지 않는다', async () => {
    await writeScores(URL1, { clickbait_headline: item(1) })
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
    await expect(writeScores(URL1, { clickbait_headline: item(1) })).resolves.toBeUndefined()
  })

  it('빈 결과는 쓰지 않는다', async () => {
    await writeScores(URL1, {})
    expect(store.size).toBe(0)
  })
})

describe('심층 분석 답을 들고 있는다 — 같은 기사엔 같은 답', () => {
  // 생성 모델은 같은 글에도 매번 다르게 답한다. 눌렀다 접었다 할 때마다 짚는 문장이
  // 바뀌면 사용자는 어느 쪽을 믿어야 할지 알 수 없다. **캐시가 곧 재현성이다.**
  const BODY = '앞말. 한 관계자는 더 오를 것이라고 말했다. 뒷말.'
  const PICKS = [{ text: '한 관계자는 더 오를 것이라고 말했다', why: 'src_group_only' }]
  /** 실제로 적히는 모양. **빈 답은 적히지 않으므로** 검사에서도 빈 값을 쓰지 않는다. */
  const 적힌답 = { lv: 'CAUTION', f: { src_group_only: true }, p: [] }

  it('적어 둔 답을 그대로 돌려준다', async () => {
    await writeExplain(URL1, 'source_citation', {
      lv: 'CAUTION',
      f: {},
      p: await packPicks(BODY, PICKS),
    })
    const hit = await readExplain(URL1, 'source_citation', 'CAUTION')
    expect(hit).toBeDefined()
    expect(await unpackPicks(BODY, hit!.p)).toEqual(PICKS)
  })

  it('**기사 글자를 저장하지 않는다** — 캐시가 열람 기록이 되면 안 된다', async () => {
    // 이 파일 머리말의 규칙을 심층 분석에서도 지킨다. 자리와 지문만 둔다.
    await writeExplain(URL1, 'source_citation', {
      lv: 'CAUTION',
      f: {},
      p: await packPicks(BODY, PICKS),
    })
    const dumped = JSON.stringify([...store.entries()])
    expect(dumped).not.toContain('한 관계자는')
    expect(dumped).not.toContain(URL1)
  })

  it('기사가 고쳐져 자리가 밀리면 버린다 — 엉뚱한 인용은 지어낸 인용과 같다', async () => {
    const packed = await packPicks(BODY, PICKS)
    expect(await unpackPicks(`덧붙은 머리말. ${BODY}`, packed)).toEqual([])
  })

  it('본문에 없는 글자는 적어 두지도 않는다', async () => {
    expect(await packPicks(BODY, [{ text: '한국은행은', why: 'src_none' }])).toEqual([])
  })

  it('판정이 달라지면 다시 묻는다 — 판정이 프롬프트에 들어간다', async () => {
    await writeExplain(URL1, 'source_citation', 적힌답)
    expect(await readExplain(URL1, 'source_citation', 'CHECK')).toBeUndefined()
  })

  it('다른 항목의 답을 쓰지 않는다', async () => {
    await writeExplain(URL1, 'source_citation', 적힌답)
    expect(await readExplain(URL1, 'unverifiable_claim', 'CAUTION')).toBeUndefined()
  })

  it('**빈 답은 적지 않는다** — 빈 화면이 여섯 시간 굳는다', async () => {
    // 실제로 굳었다. 못 찾은 것은 대개 한 번의 실패라, 다음에 다시 묻는 편이 낫다.
    await writeExplain(URL1, 'source_citation', { lv: 'CAUTION', f: {}, p: [] })
    expect(store.size).toBe(0)
    expect(await readExplain(URL1, 'source_citation', 'CAUTION')).toBeUndefined()
  })

  it('문구가 바뀌면 적어 둔 답을 버린다', async () => {
    // 고른 이유의 id 와 화면 문구는 짝이다. 짝이 없는 id 는 화면에서 조용히 빠진다.
    await writeExplain(URL1, 'source_citation', 적힌답)
    const key = [...store.keys()][0]!
    const e = store.get(key) as { explain: Record<string, { cv?: string }> }
    e.explain.source_citation!.cv = '0.0.1-옛날'
    expect(await readExplain(URL1, 'source_citation', 'CAUTION')).toBeUndefined()
  })

  it('점수를 다시 써도 적어 둔 답이 살아남는다', async () => {
    // 기사를 다시 열면 점수가 먼저 쓰인다. 거기서 지워지면 받아 둔 답이
    // **한 번도 살아남지 못한다.**
    await writeExplain(URL1, 'source_citation', 적힌답)
    await writeScores(URL1, { clickbait_headline: item(1) })
    expect(await readExplain(URL1, 'source_citation', 'CAUTION')).toBeDefined()
  })
  it('점수와 같은 칸에 들어가고 같이 지워진다', async () => {
    await writeScores(URL1, { clickbait_headline: item(1) })
    await writeExplain(URL1, 'source_citation', 적힌답)
    // 점수가 살아 있어야 한다 — 심층 분석을 적는다고 점수를 밀어내면 안 된다.
    expect(await readScores(URL1)).toHaveProperty('clickbait_headline')

    vi.useFakeTimers()
    vi.advanceTimersByTime(CACHE_TTL_MS + 1000)
    expect(await sweepExpired()).toBe(1)
    expect(await readExplain(URL1, 'source_citation', 'CAUTION')).toBeUndefined()
  })

  it('심층 분석을 눌러도 만료가 미뤄지지 않는다', async () => {
    // 미뤄지면 점수까지 함께 오래 남는다. 점수를 받은 그 시각이 기준이다.
    await writeScores(URL1, { clickbait_headline: item(1) })
    const before = ([...store.values()][0] as { exp: number }).exp
    await writeExplain(URL1, 'source_citation', 적힌답)
    expect(([...store.values()][0] as { exp: number }).exp).toBe(before)
  })

  it('읽기·쓰기 실패는 답 없음으로 본다', async () => {
    vi.stubGlobal('browser', {
      storage: { local: { ...fakeStorage, get: () => Promise.reject(new Error('nope')) } },
    })
    expect(await readExplain(URL1, 'source_citation', 'CAUTION')).toBeUndefined()
    await expect(writeExplain(URL1, 'source_citation', 적힌답)).resolves.toBeUndefined()
  })
})
