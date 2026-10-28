// 지난 리포트 보관함.
//
// 이 파일은 **디스크에 기사 제목과 주소를 글자 그대로 남기는 유일한 곳**을 지킨다
// (lib/archive.ts 머리말). 그것이 허용되는 조건이 셋이고, 아래 검사가 그 셋이다.
//
//   1. 사용자가 만든 것만 들어간다
//   2. 전부 보이고 전부 지워진다
//   3. 그래도 영원히 두지 않는다 — 상한과 만료
//
// 셋 중 하나가 무너지면 이 파일은 열람 기록이 된다. 그래서 검사로 박아 둔다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ARCHIVE_KEY,
  ARCHIVE_MAX,
  ARCHIVE_TTL_MS,
  clearArchive,
  listArchive,
  removeArchived,
  saveToArchive,
  sweepArchive,
} from '../lib/archive'
import type { Report } from '../lib/report'

/** chrome.storage.local 을 메모리로 흉내 낸다. cache.test.ts 와 같은 모양. */
const store = new Map<string, unknown>()
const fakeStorage = {
  get: (k: string | null) =>
    Promise.resolve(k === null ? Object.fromEntries(store) : { [k]: store.get(k) }),
  set: (o: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(o)) store.set(k, v)
    return Promise.resolve()
  },
  remove: (keys: string | string[]) => {
    for (const k of [keys].flat()) store.delete(k)
    return Promise.resolve()
  },
}

beforeEach(() => {
  store.clear()
  vi.stubGlobal('browser', { storage: { local: fakeStorage } })
})

/**
 * 저장소에 **직접** 심는다.
 *
 * `saveToArchive` 는 쓸 때마다 만료된 것을 함께 걷어낸다. 그래서 그것만으로는
 * "만료된 것이 남아 있는 저장소" 를 만들 수 없다 — 쓸어내기를 따로 보려면 심어야 한다.
 */
const 심는다 = (...items: Report[]) => store.set(ARCHIVE_KEY, { v: 1, items })

const 리포트 = (over: Partial<Report> = {}): Report => ({
  url: 'https://n.news.naver.com/article/001/0001',
  headline: '머리글',
  date: '2026-10-28',
  at: Date.now(),
  stage: 'done',
  rows: [],
  claims: [],
  ...over,
})

describe('① 사용자가 만든 것만 들어간다', () => {
  it('다 된 리포트를 보관한다', async () => {
    await saveToArchive(리포트())
    expect(await listArchive()).toHaveLength(1)
  })

  it.each(['claims', 'records', 'brief'] as const)('만드는 중(%s)인 것은 넣지 않는다', async (stage) => {
    await saveToArchive(리포트({ stage }))
    expect(await listArchive(), '만들다 만 것이 쌓이면 보관함이 쓰레기통이 된다').toHaveLength(0)
  })

  it('실패한 것은 넣지 않는다', async () => {
    await saveToArchive(리포트({ stage: 'failed', reason: 'no_claims' }))
    expect(await listArchive()).toHaveLength(0)
  })

  it('저장소를 건드린 적이 없으면 비어 있다 — 기사를 열기만 해서는 쌓이지 않는다', async () => {
    expect(await listArchive()).toEqual([])
    expect(store.size, '읽기만 해서는 칸도 만들지 않는다').toBe(0)
  })
})

describe('② 전부 보이고 전부 지워진다', () => {
  it('지우면 저장소에서 글자가 사라진다', async () => {
    await saveToArchive(리포트({ headline: '이태원 참사 외국인 유족' }))
    expect(JSON.stringify([...store])).toContain('이태원')

    await removeArchived('https://n.news.naver.com/article/001/0001')
    expect(JSON.stringify([...store]), '지웠다면 글자도 남지 않아야 한다').not.toContain('이태원')
    expect(await listArchive()).toHaveLength(0)
  })

  it('지울 때도 같은 기사를 알아본다 — 경로와 꼬리표가 달라도', async () => {
    await saveToArchive(리포트())
    await removeArchived('https://n.news.naver.com/mnews/article/001/0001?iid=829')
    expect(await listArchive()).toHaveLength(0)
  })

  it('모두 지우면 **칸 자체가 없어진다** — 빈 배열을 남기지 않는다', async () => {
    await saveToArchive(리포트())
    await saveToArchive(리포트({ url: 'https://n.news.naver.com/article/001/0002' }))
    await clearArchive()
    expect(store.has(ARCHIVE_KEY), '지웠으면 흔적도 없어야 한다').toBe(false)
    expect(await listArchive()).toEqual([])
  })

  it('새것이 앞에 온다', async () => {
    const now = Date.now()
    await saveToArchive(리포트({ url: 'https://n.news.naver.com/article/001/0001', at: now - 5000, headline: '먼저' }))
    await saveToArchive(리포트({ url: 'https://n.news.naver.com/article/001/0002', at: now, headline: '나중' }))
    expect((await listArchive()).map((r) => r.headline)).toEqual(['나중', '먼저'])
  })

  it('같은 기사를 다시 조사하면 갈아 끼운다 — 두 줄로 보이지 않는다', async () => {
    await saveToArchive(리포트({ headline: '처음', at: Date.now() - 5000 }))
    await saveToArchive(리포트({ url: 'https://n.news.naver.com/mnews/article/001/0001', headline: '다시' }))
    const got = await listArchive()
    expect(got).toHaveLength(1)
    expect(got[0]?.headline).toBe('다시')
  })
})

describe('③ 영원히 두지 않는다', () => {
  it(`${ARCHIVE_MAX}개를 넘기면 오래된 것부터 나간다`, async () => {
    const now = Date.now()
    for (let i = 0; i < ARCHIVE_MAX + 5; i++) {
      await saveToArchive(리포트({ url: `https://n.news.naver.com/article/001/${i}`, at: now + i, headline: `글 ${i}` }))
    }
    const got = await listArchive()
    expect(got).toHaveLength(ARCHIVE_MAX)
    expect(got[0]?.headline, '가장 새것이 남는다').toBe(`글 ${ARCHIVE_MAX + 4}`)
    expect(got.map((r) => r.headline), '가장 오래된 것은 밀려났다').not.toContain('글 0')
  })

  it('만료된 것은 쓸어내기 전에도 보이지 않는다', async () => {
    심는다(리포트({ at: Date.now() - ARCHIVE_TTL_MS - 1 }))
    expect(await listArchive()).toHaveLength(0)
  })

  it('새로 보관할 때도 만료된 것을 함께 걷어낸다', async () => {
    심는다(리포트({ headline: '옛것', at: Date.now() - ARCHIVE_TTL_MS - 1 }))
    await saveToArchive(리포트({ url: 'https://n.news.naver.com/article/001/0002', headline: '새것' }))
    expect(JSON.stringify([...store])).not.toContain('옛것')
  })

  it('쓸어내면 만료된 것이 저장소에서 사라진다', async () => {
    심는다(
      리포트({ url: 'https://n.news.naver.com/article/001/0001', headline: '옛것', at: Date.now() - ARCHIVE_TTL_MS - 1 }),
      리포트({ url: 'https://n.news.naver.com/article/001/0002', headline: '새것' }),
    )

    expect(await sweepArchive()).toBe(1)
    expect(JSON.stringify([...store])).not.toContain('옛것')
    expect(JSON.stringify([...store])).toContain('새것')
  })

  it('전부 만료였으면 칸을 지운다', async () => {
    심는다(리포트({ at: Date.now() - ARCHIVE_TTL_MS - 1 }))
    expect(await sweepArchive()).toBe(1)
    expect(store.has(ARCHIVE_KEY)).toBe(false)
  })

  it('비울 것이 없으면 0 을 돌려주고 손대지 않는다', async () => {
    await saveToArchive(리포트())
    const before = JSON.stringify([...store])
    expect(await sweepArchive()).toBe(0)
    expect(JSON.stringify([...store])).toBe(before)
  })
})

describe('깨진 저장소에 버티기', () => {
  it('모양이 다르면 통째로 버린다 — 반쯤 읽은 목록을 보여 주지 않는다', async () => {
    store.set(ARCHIVE_KEY, { v: 99, items: 'ㅇㅇ' })
    expect(await listArchive()).toEqual([])
  })

  it('저장소가 막혀도 터지지 않는다', async () => {
    vi.stubGlobal('browser', {
      storage: {
        local: {
          get: () => Promise.reject(new Error('막힘')),
          set: () => Promise.reject(new Error('막힘')),
          remove: () => Promise.reject(new Error('막힘')),
        },
      },
    })
    await expect(listArchive()).resolves.toEqual([])
    await expect(saveToArchive(리포트())).resolves.toBeUndefined()
    await expect(clearArchive()).resolves.toBeUndefined()
    await expect(sweepArchive()).resolves.toBe(0)
  })
})
