// @vitest-environment happy-dom
//
// 걸린 항목의 대목을 **미리** 모으는 부분.
//
// 여기서 보는 것 넷이다.
//   1. 판정이 나오면 팝업을 펼치지 않아도 모은다
//   2. 코드 몫을 **먼저** 내놓고 LLM 몫을 뒤에 덧붙인다 (기다리게 하지 않는다)
//   3. 코드가 찾은 항목은 **모델에 묻지 않는다** (호출을 아낀다)
//   4. 🟢·⚪ 에서는 아무것도 하지 않는다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import content from '../../../packages/content/ui.ko.json'
import type { Mark } from '../lib/highlight'
import type { ArticleVerdict, Message } from '../lib/protocol'
import { codeMarks, gatherMarks } from '../lib/marks'

/** `browser.storage.local` 을 흉내 낸다. 캐시가 여기에 쓴다. */
function 저장소() {
  const box: Record<string, unknown> = {}
  return {
    local: {
      get: (k: string) => Promise.resolve({ [k]: box[k] }),
      set: (o: Record<string, unknown>) => { Object.assign(box, o); return Promise.resolve() },
      remove: (k: string) => { delete box[k]; return Promise.resolve() },
    },
  }
}

beforeEach(() => {
  vi.stubGlobal('browser', { runtime: { id: 'test' }, storage: 저장소() })
})
afterEach(() => vi.unstubAllGlobals())

const URL_ = 'https://n.news.naver.com/article/001/0001'
/** `spr_urging` 규칙에 걸리는 글. 코드가 찾을 수 있다 */
const 공유요구 = '꼭 공유하세요'
const BODY = `정부가 대책을 내놓았다. 한 관계자는 더 오를 것이라고 말했다. ${공유요구}.`

function 판정(items: { id: string; score: number; isConfident: boolean }[]): ArticleVerdict {
  return {
    level: 'CAUTION',
    score: 0.8,
    cautionSignals: items.length,
    items: items.map((i) => ({ ...i })),
  } as ArticleVerdict
}

describe('코드가 찾는 몫', () => {
  it('정해진 표현을 찾아 항목 이름을 붙인다', () => {
    const got = codeMarks('spread_inducement', BODY)
    expect(got.length).toBeGreaterThan(0)
    expect(got[0]?.item).toBe('공유 유도')
    expect(got[0]?.text).toContain('공유')
  })

  it('없는 항목이면 빈손이다', () => {
    expect(codeMarks('없는항목', BODY)).toEqual([])
  })

  it('찾을 표현이 없으면 빈손이다', () => {
    expect(codeMarks('spread_inducement', '평범한 기사 본문이다.')).toEqual([])
  })
})

describe('미리 모으기', () => {
  it('**팝업을 펼치지 않아도 모은다** — 판정만 있으면 된다', async () => {
    const 받은: Mark[][] = []
    await gatherMarks({
      url: URL_,
      body: BODY,
      level: 'CAUTION',
      verdict: 판정([{ id: 'spread_inducement', score: 1, isConfident: true }]),
      onMarks: (m) => 받은.push(m),
      ask: () => Promise.resolve(null),
    })
    expect(받은.length).toBeGreaterThan(0)
    expect(받은.at(-1)?.[0]?.item).toBe('공유 유도')
  })

  it('**코드가 찾은 항목은 모델에 묻지 않는다**', async () => {
    const 물어본: string[] = []
    await gatherMarks({
      url: URL_,
      body: BODY,
      level: 'CAUTION',
      verdict: 판정([{ id: 'spread_inducement', score: 1, isConfident: true }]),
      onMarks: () => {},
      ask: (m: Message) => {
        if (m.kind === 'judge-explain') 물어본.push(m.itemId)
        return Promise.resolve(null)
      },
    })
    expect(물어본).toEqual([])
  })

  it('코드가 빈손인 항목만 모델에 묻는다', async () => {
    const 물어본: string[] = []
    await gatherMarks({
      url: URL_,
      body: BODY,
      level: 'CAUTION',
      verdict: 판정([
        { id: 'spread_inducement', score: 1, isConfident: true },
        { id: 'source_citation', score: 1, isConfident: true },
      ]),
      onMarks: () => {},
      ask: (m: Message) => {
        if (m.kind === 'judge-explain') 물어본.push(m.itemId)
        return Promise.resolve({ picks: [] })
      },
    })
    expect(물어본).toEqual(['source_citation'])
  })

  it('코드 몫을 **먼저** 내놓고 LLM 몫을 덧붙인다', async () => {
    const 차례: number[] = []
    await gatherMarks({
      url: URL_,
      body: BODY,
      level: 'CAUTION',
      verdict: 판정([
        { id: 'spread_inducement', score: 1, isConfident: true },
        { id: 'source_citation', score: 1, isConfident: true },
      ]),
      onMarks: (m) => 차례.push(m.length),
      ask: () => Promise.resolve({ picks: [{ text: '한 관계자는', why: 'src_group_only' }] }),
    })
    // 두 번 부른다. 두 번째가 더 많다 — 덧칠이지 갈아치우기가 아니다.
    expect(차례.length).toBe(2)
    expect(차례[1]).toBeGreaterThan(차례[0] ?? 0)
  })

  it('LLM 이 집어 온 것에 사유 문구가 붙는다', async () => {
    let 마지막: Mark[] = []
    await gatherMarks({
      url: URL_,
      body: BODY,
      level: 'CAUTION',
      verdict: 판정([{ id: 'source_citation', score: 1, isConfident: true }]),
      onMarks: (m) => { 마지막 = m },
      ask: () => Promise.resolve({ picks: [{ text: '한 관계자는', why: 'src_group_only' }] }),
    })
    expect(마지막[0]?.item).toBe('출처 표시')
    // 문구는 ChatKHU 가 쓴 것을 그대로 쓴다. 여기 적어 두면 두 곳이 어긋난다.
    expect(마지막[0]?.reason).toBe(content.explain.source_citation.reasons.src_group_only)
  })

  it('**지어낸 것은 버린다** — 본문에 없는 글자는 칠하지 않는다', async () => {
    let 마지막: Mark[] = []
    await gatherMarks({
      url: URL_,
      body: BODY,
      level: 'CAUTION',
      verdict: 판정([{ id: 'source_citation', score: 1, isConfident: true }]),
      onMarks: (m) => { 마지막 = m },
      ask: () => Promise.resolve({ picks: [{ text: '본문에 없는 지어낸 문장', why: 'src_none' }] }),
    })
    expect(마지막).toEqual([])
  })

  it.each([['SAFE'], ['UNDETERMINED']] as const)('%s 에서는 아무것도 하지 않는다', async (level) => {
    const 받은: Mark[][] = []
    const 물어본: string[] = []
    await gatherMarks({
      url: URL_,
      body: BODY,
      level,
      verdict: 판정([{ id: 'spread_inducement', score: 1, isConfident: true }]),
      onMarks: (m) => 받은.push(m),
      ask: (m: Message) => { if (m.kind === 'judge-explain') 물어본.push(m.itemId); return Promise.resolve(null) },
    })
    expect(받은).toEqual([])
    expect(물어본).toEqual([])
  })

  it('**확신이 없는 항목은 칠하지 않는다** — 보류를 칠하면 ⚪ 와 어긋난다', async () => {
    const 받은: Mark[][] = []
    await gatherMarks({
      url: URL_,
      body: BODY,
      level: 'CAUTION',
      verdict: 판정([{ id: 'spread_inducement', score: 1, isConfident: false }]),
      onMarks: (m) => 받은.push(m),
      ask: () => Promise.resolve(null),
    })
    expect(받은).toEqual([])
  })

  it('신호가 없다고 나온 항목은 칠하지 않는다', async () => {
    const 받은: Mark[][] = []
    await gatherMarks({
      url: URL_,
      body: BODY,
      level: 'CAUTION',
      verdict: 판정([{ id: 'spread_inducement', score: 0, isConfident: true }]),
      onMarks: (m) => 받은.push(m),
      ask: () => Promise.resolve(null),
    })
    expect(받은).toEqual([])
  })

  it('모델이 실패해도 코드 몫은 남는다', async () => {
    let 마지막: Mark[] = []
    await gatherMarks({
      url: URL_,
      body: BODY,
      level: 'CAUTION',
      verdict: 판정([
        { id: 'spread_inducement', score: 1, isConfident: true },
        { id: 'source_citation', score: 1, isConfident: true },
      ]),
      onMarks: (m) => { 마지막 = m },
      ask: () => Promise.reject(new Error('끊겼다')),
    })
    expect(마지막.length).toBeGreaterThan(0)
    expect(마지막[0]?.item).toBe('공유 유도')
  })

  it('**팝업이 쓸 캐시에 적어 둔다** — 펼칠 때 다시 묻지 않는다', async () => {
    const 물어본: string[] = []
    const ask = (m: Message) => {
      if (m.kind === 'judge-explain') 물어본.push(m.itemId)
      return Promise.resolve({ picks: [{ text: '한 관계자는', why: 'src_group_only' }] })
    }
    const 같은입력 = {
      url: URL_,
      body: BODY,
      level: 'CAUTION' as const,
      verdict: 판정([{ id: 'source_citation', score: 1, isConfident: true }]),
      onMarks: () => {},
      ask,
    }
    await gatherMarks(같은입력)
    expect(물어본).toEqual(['source_citation'])
    // 두 번째는 캐시에서 읽는다.
    await gatherMarks(같은입력)
    expect(물어본).toEqual(['source_citation'])
  })
})
