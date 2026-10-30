// ③ 의 결과를 background 에서 팝업으로 건네는 길.
//
// 리뷰(#21)가 짚은 것: 팝업이 판단을 기다린 뒤에 열리면 제스처가 끝나 열리지 않고,
// 결과가 `storage.session` 에 남아 **한참 뒤 다른 탭에서 아이콘을 눌렀을 때** 튀어나온다.
// 그래서 결과에 **시각과 탭**을 함께 둔다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SELECTION_FRESH_MS,
  SELECTION_KEY,
  clearSelection,
  peekSelection,
  putSelectionPending,
  putSelectionResult,
} from '../lib/selection'

const session = new Map<string, unknown>()

beforeEach(() => {
  session.clear()
  vi.useRealTimers()
  vi.stubGlobal('browser', {
    storage: {
      session: {
        get: (k: string) => Promise.resolve({ [k]: session.get(k) }),
        set: (o: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(o)) session.set(k, v)
          return Promise.resolve()
        },
        remove: (k: string) => { session.delete(k); return Promise.resolve() },
      },
    },
  })
})

const verdict = { level: 'CAUTION', score: 0.7, cautionSignals: 2, items: [] } as never
const done = { ok: true, verdict } as never

describe('판단이 도는 동안', () => {
  it('팝업이 빈 화면을 보지 않게 "살펴보는 중" 을 남긴다', async () => {
    await putSelectionPending(7)
    expect((await peekSelection(7))?.state).toBe('pending')
  })

  it('결과가 오면 덮어쓴다', async () => {
    await putSelectionPending(7)
    await putSelectionResult(done, 7)
    const rec = await peekSelection(7)
    expect(rec?.state).toBe('done')
    expect(rec?.outcome).toEqual(done)
  })
})

describe('오래된 결과는 버린다', () => {
  it('2분이 지나면 없는 것으로 본다', async () => {
    await putSelectionResult(done, 7)
    // 저장된 시각을 과거로 돌린다.
    const rec = session.get(SELECTION_KEY) as { at: number }
    rec.at = Date.now() - SELECTION_FRESH_MS - 1
    expect(await peekSelection(7), '몇 시간 전 선택 결과가 기사 배지를 가리면 안 된다').toBeNull()
  })

  it('방금 것은 그대로 쓴다', async () => {
    await putSelectionResult(done, 7)
    expect(await peekSelection(7)).not.toBeNull()
  })
})

describe('다른 탭의 결과는 보여 주지 않는다', () => {
  it('탭이 다르면 없는 것으로 본다', async () => {
    // 메신저 탭에서 고른 글의 판정이 기사 탭의 팝업에 뜨면 안 된다.
    await putSelectionResult(done, 7)
    expect(await peekSelection(9)).toBeNull()
  })

  it('같은 탭이면 쓴다', async () => {
    await putSelectionResult(done, 7)
    expect(await peekSelection(7)).not.toBeNull()
  })

  it('탭을 모르면 거르지 않는다 — 거르면 아무것도 못 본다', async () => {
    await putSelectionResult(done, undefined)
    expect(await peekSelection(9)).not.toBeNull()
  })
})

describe('한 번 보여 주면 지운다', () => {
  it('지우면 다음 번에 없다', async () => {
    await putSelectionResult(done, 7)
    await clearSelection()
    expect(await peekSelection(7)).toBeNull()
  })
})
