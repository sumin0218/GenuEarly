// @vitest-environment happy-dom
//
// 팝업이 무엇을 그리는가.
//
// 문구 자체는 tests/content.test.ts 가 검사한다 (금지어·단정 표현).
// 여기서 보는 것은 **그 문구가 화면에 제대로 놓이는가**와,
// 화면에 **있으면 안 되는 것이 새어 나오지 않는가**다.
import { beforeEach, describe, expect, it } from 'vitest'
import content from '../../../packages/content/ui.ko.json'
import { render } from '../entrypoints/popup/main'
import type { TabState } from '../lib/protocol'

/** 팝업 문서의 뼈대. entrypoints/popup/index.html 과 id 가 같아야 한다. */
function mountDocument(): void {
  document.body.dataset.level = ''
  document.body.replaceChildren()
  for (const [tag, id] of [['span', 'mark'], ['h1', 'name'], ['p', 'desc'], ['ul', 'items']] as const) {
    const el = document.createElement(tag)
    el.id = id
    document.body.append(el)
  }
}

const item = (id: string, score: number | null, isConfident = true) =>
  ({ id, score, isConfident, confidence: 0.9 }) as never

const verdict = (items: unknown[], level: TabState['level'] = 'CHECK'): TabState => ({
  level,
  verdict: { level, score: 0.4, cautionSignals: 1, items: items as never } as never,
})

beforeEach(mountDocument)

describe('머리말', () => {
  it('단계에 맞는 문구를 packages/content 에서 가져온다', () => {
    render({ level: 'CAUTION' })
    expect(document.getElementById('name')?.textContent).toBe(content.badge.CAUTION.name)
    expect(document.getElementById('desc')?.textContent).toBe(content.badge.CAUTION.description)
  })

  it('단계를 body 에 적는다 — 색은 CSS 가 고른다', () => {
    render({ level: 'SAFE' })
    expect(document.body.dataset.level).toBe('SAFE')
  })

  it('기호가 단계마다 다르다 — 색각 이상에서 색만으로 구분되지 않는다', () => {
    const marks = new Set<string>()
    for (const level of ['SAFE', 'CHECK', 'CAUTION', 'UNDETERMINED'] as const) {
      render({ level })
      marks.add(document.getElementById('mark')?.textContent ?? '')
    }
    expect(marks.size).toBe(4)
  })
})

describe('항목 목록', () => {
  it('판단한 항목을 전부 보여 준다 — 걸린 것만 보여 주지 않는다', () => {
    render(verdict([
      item('source_citation', 0),
      item('clickbait_headline', 1),
      item('ai_style_signal', null),
    ]))
    expect(document.querySelectorAll('.ge-popup__item')).toHaveLength(3)
  })

  it('걸린 것이 위로 온다', () => {
    render(verdict([
      item('source_citation', 0),        // 🟢
      item('ai_style_signal', null),     // ⚪
      item('clickbait_headline', 1),     // 🔴
      item('emotional_language', 0.5),   // 🟡
    ]))
    const levels = [...document.querySelectorAll<HTMLElement>('.ge-popup__item')]
      .map((el) => el.dataset.level)
    expect(levels).toEqual(['CAUTION', 'CHECK', 'UNDETERMINED', 'SAFE'])
  })

  it('항목 이름이 아니라 packages/content 의 문구를 쓴다', () => {
    render(verdict([item('clickbait_headline', 1)]))
    const row = document.querySelector('.ge-popup__item')?.textContent ?? ''
    expect(row).toContain(content.items.clickbait_headline.name)
    expect(row).toContain(content.items.clickbait_headline.signal)
    expect(row, '내부 id 가 화면에 새면 안 된다').not.toContain('clickbait_headline')
  })

  it('같은 항목이라도 안심이면 안심 문구를 쓴다', () => {
    render(verdict([item('clickbait_headline', 0)]))
    const row = document.querySelector('.ge-popup__item')?.textContent ?? ''
    expect(row).toContain(content.items.clickbait_headline.safe)
    expect(row).not.toContain(content.items.clickbait_headline.signal)
  })

  it('판단한 항목이 없으면 그렇다고 말한다 — 빈 화면을 두지 않는다', () => {
    render({ level: 'UNDETERMINED' })
    expect(document.querySelector('.ge-popup__note')?.textContent)
      .toBe(content.undetermined.description)
  })
})

describe('화면에 새면 안 되는 것', () => {
  // docs/product.md 6절: 정밀해 보이는 숫자는 단정으로 읽힌다.
  it('점수 숫자가 보이지 않는다', () => {
    render(verdict([
      item('clickbait_headline', 1),
      item('emotional_language', 0.67),
      item('source_citation', 0),
    ]))
    const text = document.body.textContent ?? ''
    expect(text, '점수가 화면에 새어 나왔다').not.toMatch(/0\.\d|\d+%|\d+점/)
  })

  it('확신도도 보이지 않는다', () => {
    render(verdict([item('clickbait_headline', 1)]))
    expect(document.body.textContent ?? '').not.toContain('0.9')
  })

  it('기사 본문이나 주소가 들어가지 않는다', () => {
    // 팝업은 판정만 받는다. 본문을 받을 길이 없어야 한다 (secure-coding.md 6절).
    render(verdict([item('clickbait_headline', 1)]))
    expect(document.body.textContent ?? '').not.toMatch(/https?:\/\//)
  })
})

describe('배지와 항목 줄이 같은 말을 한다', () => {
  // 리뷰(#20)가 짚은 것: 항목 줄의 🟡 경계가 기사 배지의 경계보다 높으면
  // **배지는 "확인해 볼 점 있음" 인데 일곱 줄이 전부 "신호 없음"** 이 된다.
  it('기사가 CHECK 면 🟡 이상인 줄이 적어도 하나 있다', () => {
    // 가중평균 0.33 — SAFE_BELOW(0.3) 위라 배지는 🟡 다.
    render(verdict([
      item('source_citation', 0.33),
      item('headline_body_match', 0.33),
      item('clickbait_headline', 0.33),
    ], 'CHECK'))
    const levels = [...document.querySelectorAll<HTMLElement>('.ge-popup__item')]
      .map((el) => el.dataset.level)
    expect(levels, '배지는 🟡 인데 줄이 전부 🟢 이면 무엇을 확인하라는 것인지 알 수 없다')
      .not.toEqual(['SAFE', 'SAFE', 'SAFE'])
    expect(levels.filter((l) => l === 'CHECK' || l === 'CAUTION').length).toBeGreaterThan(0)
  })

  it('정말 낮은 점수는 그대로 🟢 다', () => {
    render(verdict([item('source_citation', 0.1), item('clickbait_headline', 0)], 'SAFE'))
    const levels = [...document.querySelectorAll<HTMLElement>('.ge-popup__item')]
      .map((el) => el.dataset.level)
    expect(levels).toEqual(['SAFE', 'SAFE'])
  })
})
