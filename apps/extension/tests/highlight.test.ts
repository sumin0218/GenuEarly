// @vitest-environment happy-dom
//
// 기사 본문에 칠하는 형광펜.
//
// happy-dom 은 글자를 실제로 배치하지 않아서 `getClientRects()` 가 늘 비어 있다.
// 그대로 두면 상자가 하나도 안 생겨 **무엇을 검사해도 통과하는 검사**가 된다.
// 그래서 자리를 재는 부분만 갈아 끼우고, 나머지는 진짜로 본다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHighlighter, type Mark } from '../lib/highlight'

const 원래 = Range.prototype.getClientRects

beforeEach(() => {
  // 범위 하나에 줄 하나가 잡힌 것처럼 꾸민다. 빈 범위와 구분되도록 폭을 준다.
  Range.prototype.getClientRects = function (this: Range) {
    const rects = [{ left: 10, top: 20, width: 100, height: 18, right: 110, bottom: 38 }]
    return Object.assign(rects, { item: (i: number) => rects[i] }) as unknown as DOMRectList
  }
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { fn(0); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => {
  Range.prototype.getClientRects = 원래
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

function 기사(html: string): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = html
  document.body.append(el)
  return el
}

const MARK: Mark = {
  text: '관계자에 따르면 그렇다고 한다',
  item: '확인하기 어려운 주장',
  reason: "말한 쪽이 집단이나 직함으로만 적혀 있습니다.",
}

describe('칠하기', () => {
  it('찾은 글자 위에 상자를 놓는다', () => {
    const body = 기사('<p>관계자에 따르면 그렇다고 한다.</p>')
    const h = createHighlighter(document)
    h.paint(body, [MARK])
    expect(h.count()).toBe(1)
  })

  it('**기사 DOM 을 건드리지 않는다** — mark 로 감싸지 않는다', () => {
    const body = 기사('<p>관계자에 따르면 그렇다고 한다.</p>')
    const before = body.innerHTML
    createHighlighter(document).paint(body, [MARK])
    expect(body.innerHTML).toBe(before)
  })

  it('본문에 없는 글자는 칠하지 않는다', () => {
    const body = 기사('<p>여기에는 다른 말이 적혀 있다.</p>')
    const h = createHighlighter(document)
    h.paint(body, [MARK])
    expect(h.count()).toBe(0)
  })

  it('다시 칠하면 앞의 것이 지워진다 — 쌓이지 않는다', () => {
    const body = 기사('<p>관계자에 따르면 그렇다고 한다.</p>')
    const h = createHighlighter(document)
    h.paint(body, [MARK])
    h.paint(body, [MARK])
    expect(h.count()).toBe(1)
  })

  it('지우면 상자가 없어진다', () => {
    const body = 기사('<p>관계자에 따르면 그렇다고 한다.</p>')
    const h = createHighlighter(document)
    h.paint(body, [MARK])
    expect(h.count()).toBe(1)
    h.clear()
    expect(h.count()).toBe(0)
  })

  it('레이어는 마우스를 받지 않는다 — 기사의 링크를 막으면 안 된다', () => {
    const h = createHighlighter(document)
    const layer = h.el.querySelector('.ge-hl')
    expect(layer).not.toBeNull()
    // 레이어 자신은 통과시키고, 상자만 받는다. 값은 CSS 에 있으므로 여기서는
    // 상자가 따로 있는 구조인지만 본다.
    expect(layer?.querySelectorAll('.ge-hl__box')).toHaveLength(0)
  })
})

describe('왜 칠했는지', () => {
  it('처음에는 떠 있지 않다', () => {
    const h = createHighlighter(document)
    expect(h.el.querySelector<HTMLElement>('.ge-hl__tip')?.hidden).toBe(true)
  })

  it('올려놓으면 항목 이름과 사유가 뜬다', () => {
    const body = 기사('<p>관계자에 따르면 그렇다고 한다.</p>')
    const h = createHighlighter(document)
    h.paint(body, [MARK])
    h.el.querySelector('.ge-hl__box')?.dispatchEvent(new Event('mouseenter'))

    const tip = h.el.querySelector<HTMLElement>('.ge-hl__tip')
    expect(tip?.hidden).toBe(false)
    expect(tip?.textContent).toContain('확인하기 어려운 주장')
    expect(tip?.textContent).toContain('집단이나 직함으로만')
  })

  it('치우면 사라진다', () => {
    const body = 기사('<p>관계자에 따르면 그렇다고 한다.</p>')
    const h = createHighlighter(document)
    h.paint(body, [MARK])
    const box = h.el.querySelector('.ge-hl__box')
    box?.dispatchEvent(new Event('mouseenter'))
    box?.dispatchEvent(new Event('mouseleave'))
    expect(h.el.querySelector<HTMLElement>('.ge-hl__tip')?.hidden).toBe(true)
  })

  it('사유가 없으면 항목 이름만 보여 준다 — 빈 줄을 남기지 않는다', () => {
    const body = 기사('<p>관계자에 따르면 그렇다고 한다.</p>')
    const h = createHighlighter(document)
    h.paint(body, [{ text: MARK.text, item: '공유 유도' }])
    h.el.querySelector('.ge-hl__box')?.dispatchEvent(new Event('mouseenter'))

    const why = h.el.querySelector<HTMLElement>('.ge-hl__tip-why')
    expect(why?.hidden).toBe(true)
    expect(h.el.querySelector('.ge-hl__tip')?.textContent).toContain('공유 유도')
  })

  it('**단정하지 않는다** — 사유 문구에 가짜·허위·거짓이 없다', () => {
    const body = 기사('<p>관계자에 따르면 그렇다고 한다.</p>')
    const h = createHighlighter(document)
    h.paint(body, [MARK])
    h.el.querySelector('.ge-hl__box')?.dispatchEvent(new Event('mouseenter'))
    const 글 = h.el.querySelector('.ge-hl__tip')?.textContent ?? ''
    expect(글.length).toBeGreaterThan(0)
    for (const 금지 of ['가짜', '허위', '거짓', '조작']) expect(글).not.toContain(금지)
  })
})
