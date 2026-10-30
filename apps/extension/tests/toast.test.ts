// @vitest-environment happy-dom
//
// 기사를 다 살펴봤다고 알리는 말풍선.
//
// 배지는 오른쪽 아래에 조용히 떠 있어서 **못 보고 지나친다.** 그래서 끝났을 때 한 번
// 오른쪽 위에 알린다. 여기서 보는 것은 **결과를 말하지 않는가**와 **저절로 사라지는가**다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import content from '../../../packages/content/ui.ko.json'
import { TOAST_MS, createToast } from '../lib/toast'

const C = content.analyzed

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('말풍선', () => {
  it('처음에는 떠 있지 않다', () => {
    expect(createToast(document).el.hidden).toBe(true)
  })

  it('끝났다는 것과 어디를 누르라는 것만 말한다', () => {
    const t = createToast(document)
    t.show(TOAST_MS)
    const 글 = t.el.textContent ?? ''
    expect(글).toContain(C.done)
    expect(글).toContain(C.hint)
  })

  it('**결과를 말하지 않는다** — 기사를 덮은 채 판정을 선언하면 안 된다', () => {
    const t = createToast(document)
    t.show(TOAST_MS)
    const 글 = t.el.textContent ?? ''
    // 배지 다섯 단계의 이름이 하나라도 들어가면 그것이 곧 판정 선언이다.
    for (const level of ['PENDING', 'SAFE', 'CHECK', 'CAUTION', 'UNDETERMINED'] as const) {
      expect(글, `${level} 이름이 말풍선에 들어갔다`).not.toContain(content.badge[level].name)
    }
    expect(글, '점수도 새면 안 된다').not.toMatch(/0\.\d|\d+%|\d+점/)
  })

  it('저절로 사라진다', () => {
    const t = createToast(document)
    t.show(TOAST_MS)
    expect(t.el.hidden).toBe(false)
    vi.advanceTimersByTime(TOAST_MS - 1)
    expect(t.el.hidden).toBe(false)
    vi.advanceTimersByTime(1)
    expect(t.el.hidden, '읽을 생각이 없는 사람에게 계속 떠 있으면 안 된다').toBe(true)
  })

  it('X 로 바로 닫는다', () => {
    const t = createToast(document)
    t.show(TOAST_MS)
    t.el.querySelector('button')?.click()
    expect(t.el.hidden).toBe(true)
  })

  it('닫기 단추에 이름이 붙는다 — 글자가 ✕ 뿐이다', () => {
    const x = createToast(document).el.querySelector('button')
    expect(x?.getAttribute('aria-label')).toBe(C.close)
    expect(C.close, '같은 제품의 다른 단추와 겹치면 안 된다').not.toBe(content.portal.legend.collapse)
  })

  it('두 번 띄워도 타이머가 겹치지 않는다', () => {
    const t = createToast(document)
    t.show(TOAST_MS)
    vi.advanceTimersByTime(TOAST_MS - 100)
    t.show(TOAST_MS) // 다시 띄운다 — 앞 타이머가 살아 있으면 100ms 뒤에 꺼진다
    vi.advanceTimersByTime(200)
    expect(t.el.hidden, '앞 타이머가 새 말풍선을 꺼뜨리면 안 된다').toBe(false)
  })

  it('화면을 읽어 주는 도구에 알린다', () => {
    expect(createToast(document).el.getAttribute('role')).toBe('status')
  })
})
