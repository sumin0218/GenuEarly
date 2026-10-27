// @vitest-environment happy-dom
//
// 팝업이 무엇을 그리는가.
//
// 문구 자체는 tests/content.test.ts 가 검사한다 (금지어·단정 표현).
// 여기서 보는 것은 **그 문구가 화면에 제대로 놓이는가**와,
// 화면에 **있으면 안 되는 것이 새어 나오지 않는가**다.
import { beforeEach, describe, expect, it } from 'vitest'
import content from '../../../packages/content/ui.ko.json'
import schema from '@genuearly/shared/judgment-items.json'
import { drawChrome, explainLines, render, renderTooLong } from '../entrypoints/popup/main'
import type { TabState } from '../lib/protocol'

/** 팝업 문서의 뼈대. entrypoints/popup/index.html 과 id 가 같아야 한다. */
function mountDocument(): void {
  document.body.dataset.level = ''
  document.body.replaceChildren()
  for (const [tag, id] of [['span', 'mark'], ['h1', 'name'], ['p', 'desc'], ['p', 'scope'], ['ul', 'items']] as const) {
    const el = document.createElement(tag)
    el.id = id
    if (id === 'scope') (el as HTMLElement).hidden = true
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
    // 전에는 색 동그라미 이모지(🟢🟡🔴⚪)였다. 넷이 **같은 동그라미**라 적록색각 이상에서는
    // 🟢 과 🔴 이 같아 보였다. 지금은 모양이 서로 다른 아이콘이다 (lib/item-view.ts).
    const shapes = new Set<string>()
    for (const level of ['SAFE', 'CHECK', 'CAUTION', 'UNDETERMINED'] as const) {
      render({ level })
      const svg = document.querySelector('#mark svg')
      shapes.add([...(svg?.querySelectorAll('path') ?? [])].map((p) => p.getAttribute('d')).join('|'))
    }
    expect(shapes.size, '모양이 겹치면 색으로만 구분된다').toBe(4)
  })

  it('이모지를 쓰지 않는다 — 플랫폼마다 다른 그림이 나온다', () => {
    // 같은 🟡 이 윈도우에서는 노랑, 안드로이드에서는 주황에 가깝다.
    // 단계별로 정한 색이 지켜지지 않고, 글꼴이 없으면 네모가 뜬다.
    for (const level of ['SAFE', 'CHECK', 'CAUTION', 'UNDETERMINED', 'PENDING'] as const) {
      render({ level })
      expect(document.getElementById('mark')?.textContent ?? '').toBe('')
    }
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

  it('판단했는데 항목이 없으면 그렇다고 말한다 — 빈 화면을 두지 않는다', () => {
    render(verdict([], 'UNDETERMINED'))
    expect(document.querySelector('.ge-popup__note')?.textContent)
      .toBe(content.undetermined.description)
  })
})

describe('판단한 적이 없는 경우', () => {
  // 기사 페이지가 아닌 곳에서 아이콘을 눌렀다. 우리는 아무것도 하지 않았다.
  it('"해 보고 실패했다" 가 아니라 "아직 안 했다" 로 말한다', () => {
    render({ level: 'UNDETERMINED' })
    expect(document.getElementById('name')?.textContent).toBe(content.notArticle.title)
    expect(document.getElementById('desc')?.textContent).toBe(content.notArticle.description)
  })

  it('무엇을 하면 되는지 알려 준다 — 막다른 화면을 두지 않는다', () => {
    render({ level: 'UNDETERMINED' })
    expect(content.notArticle.description).toMatch(/기사|선택/)
  })

  it('판단 결과가 있으면 ⚪ 라도 notArticle 문구를 쓰지 않는다', () => {
    // 판단했는데 ⚪ 인 것과 판단한 적이 없는 것은 다른 상태다.
    render(verdict([item('source_citation', null)], 'UNDETERMINED'))
    expect(document.getElementById('name')?.textContent).toBe(content.badge.UNDETERMINED.name)
  })

  it('말이 겹치지 않는다 — 머리말과 같은 뜻을 밑에 또 쓰지 않는다', () => {
    render({ level: 'UNDETERMINED' })
    expect(document.querySelector('.ge-popup__note')).toBeNull()
  })
})

describe('③ 선택한 글의 결과', () => {
  it('무엇에 대한 판단인지 밝힌다 — 지금 페이지로 읽히면 안 된다', () => {
    render(verdict([item('emotional_language', 1)]), document, 'selection')
    const scope = document.getElementById('scope') as HTMLElement
    expect(scope.hidden).toBe(false)
    expect(scope.textContent).toBe(content.selection.title)
  })

  it('페이지 결과에는 꼬리표를 달지 않는다', () => {
    render(verdict([item('emotional_language', 1)]), document, 'page')
    expect((document.getElementById('scope') as HTMLElement).hidden).toBe(true)
  })

  it('고른 글이 너무 길면 판정이 아니라 거절로 보여 준다', () => {
    renderTooLong(4000)
    expect(document.getElementById('name')?.textContent).toBe(content.selection.tooLong.title)
    expect(document.body.dataset.level, '거절은 판정이 아니다').toBe('UNDETERMINED')
    expect(document.querySelectorAll('.ge-popup__item')).toHaveLength(0)
  })

  it('거절 안내에 실제 상한 글자 수가 들어간다', () => {
    renderTooLong(4000)
    const desc = document.getElementById('desc')?.textContent ?? ''
    expect(desc).toContain('4000')
    expect(desc, '{limit} 가 그대로 새면 안 된다').not.toContain('{limit}')
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

describe('판단이 도는 동안의 팝업', () => {
  // 팝업은 판단보다 **먼저** 열린다 (제스처를 잃지 않으려고). 그동안 보여 줄 것이 있어야 한다.
  it('"살펴보는 중" 을 띄운다', () => {
    render({ level: 'PENDING' }, document, 'selection')
    expect(document.getElementById('name')?.textContent).toBe(content.badge.PENDING.name)
    expect(document.body.dataset.level).toBe('PENDING')
  })

  it('아직 "정보가 충분하지 않다" 고 말하지 않는다 — 끝난 뒤에 할 말이다', () => {
    render({ level: 'PENDING' }, document, 'selection')
    expect(document.querySelector('.ge-popup__note')).toBeNull()
  })

  it('무엇에 대한 판단인지는 먼저 밝힌다', () => {
    render({ level: 'PENDING' }, document, 'selection')
    expect((document.getElementById('scope') as HTMLElement).hidden).toBe(false)
  })
})

describe('제품 정보와 판단 근거', () => {
  /** 틀까지 갖춘 팝업 문서. entrypoints/popup/index.html 과 id 가 같아야 한다. */
  function mountFrame(): void {
    document.body.replaceChildren()
    const img = document.createElement('img')
    img.id = 'brand-icon'
    const version = document.createElement('span')
    version.id = 'version'
    const details = document.createElement('ul')
    details.id = 'details'
    details.hidden = true
    const foot = document.createElement('footer')
    foot.id = 'foot'
    foot.hidden = true
    const toggle = document.createElement('button')
    toggle.id = 'details-toggle'
    const home = document.createElement('a')
    home.id = 'homepage'
    foot.append(toggle, home)
    document.body.append(img, version, details, foot)
  }

  /** 4차를 받고 난 뒤의 모습. **실제 문구가 아니다** — 구조만 본다. */
  const 받은문구 = {
    homepage: '홈페이지',
    details: { open: '자세히', close: '접기' },
    basis: { page: '기사 전체를 보았습니다', headline: '제목만 보았습니다', selection: '고른 글만 보았습니다' },
    coverage: { sentences: '{total}문장 중 {judged}문장', capped: '앞부분만 보았습니다' },
    criteria: '기준 {version} · {model}',
    disclaimer: '참인지 거짓인지는 말하지 않습니다',
  }
  const 사실 = { version: '1.0.0', homepageUrl: 'https://example.invalid/', schemaVersion: '1.1.0', model: 'jev-1.13.0' }

  beforeEach(mountFrame)

  it('버전은 문구가 없어도 보인다 — 이름과 숫자는 생성할 말이 아니다', () => {
    drawChrome(undefined, 사실)
    expect(document.getElementById('version')?.textContent).toBe('v1.0.0')
  })

  it('문구가 없으면 자세히도 홈페이지도 그리지 않는다', () => {
    // **빈 자리를 영어나 임시 한국어로 채우지 않는다.** 그대로 배포본에 들어간다.
    drawChrome(undefined, { ...사실, basis: 'page' })
    expect((document.getElementById('foot') as HTMLElement).hidden).toBe(true)
    expect(document.getElementById('details')?.children.length).toBe(0)
  })

  it('문구가 들어오면 켜진다 — 코드를 더 고치지 않는다', () => {
    drawChrome(받은문구, { ...사실, basis: 'page' })
    expect((document.getElementById('foot') as HTMLElement).hidden).toBe(false)
    expect(document.getElementById('homepage')?.textContent).toBe('홈페이지')
    expect((document.getElementById('homepage') as HTMLAnchorElement).href).toContain('example.invalid')
  })

  it('접혀 있는 것이 기본이다 — 판정을 보러 연 팝업이다', () => {
    drawChrome(받은문구, { ...사실, basis: 'page' })
    expect((document.getElementById('details') as HTMLElement).hidden).toBe(true)
    expect(document.getElementById('details-toggle')?.getAttribute('aria-expanded')).toBe('false')
  })

  it('눌러서 펼치고 접는다', () => {
    drawChrome(받은문구, { ...사실, basis: 'page' })
    const toggle = document.getElementById('details-toggle') as HTMLButtonElement
    toggle.click()
    expect((document.getElementById('details') as HTMLElement).hidden).toBe(false)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.textContent).toBe('접기')
    toggle.click()
    expect((document.getElementById('details') as HTMLElement).hidden).toBe(true)
  })

  it('무엇을 보고 낸 판단인지 밝힌다', () => {
    drawChrome(받은문구, { ...사실, basis: 'selection' })
    const lines = [...document.querySelectorAll('.ge-popup__detail')].map((x) => x.textContent)
    expect(lines).toContain('고른 글만 보았습니다')
    expect(lines, '다른 근거의 말이 섞이면 안 된다').not.toContain('기사 전체를 보았습니다')
  })

  it('몇 문장 중 몇 문장을 봤는지 채워 넣는다', () => {
    drawChrome(받은문구, { ...사실, basis: 'page', sentences: { total: 28, judged: 24 } })
    const lines = [...document.querySelectorAll('.ge-popup__detail')].map((x) => x.textContent)
    expect(lines).toContain('28문장 중 24문장')
  })

  it('채울 값이 없으면 그 줄을 버린다 — 자리표시자가 화면에 새면 안 된다', () => {
    drawChrome(받은문구, { version: '1.0.0', basis: 'page' })
    const text = document.getElementById('details')?.textContent ?? ''
    expect(text).not.toContain('{')
    expect(text, '문장 수를 모르는데 줄을 만들지 않는다').not.toContain('문장 중')
  })

  it('참·거짓을 말하지 않는다는 한 줄이 맨 마지막이다', () => {
    drawChrome(받은문구, { ...사실, basis: 'page', sentences: { total: 10, judged: 9 } })
    const lines = [...document.querySelectorAll('.ge-popup__detail')].map((x) => x.textContent)
    expect(lines[lines.length - 1]).toBe('참인지 거짓인지는 말하지 않습니다')
  })

  it('점수가 자세히에도 새지 않는다', () => {
    drawChrome(받은문구, { ...사실, basis: 'page', sentences: { total: 28, judged: 24 } })
    const text = document.getElementById('details')?.textContent ?? ''
    expect(text, '문장 수는 얼마나 봤는지이지 점수가 아니다').not.toMatch(/0\.\d|\d+%|\d+점/)
  })

  it('아이콘 주소가 없으면 깨진 그림을 두지 않는다', () => {
    drawChrome(받은문구, 사실)
    expect(document.getElementById('brand-icon')).toBeNull()
  })

  it('아이콘 주소가 있으면 건다', () => {
    drawChrome(받은문구, { ...사실, iconUrl: 'chrome-extension://abc/icon/16.png' })
    expect((document.getElementById('brand-icon') as HTMLImageElement).src).toContain('icon/16.png')
  })
})

describe('왜 이 판정인가 — 확신이 모자란 🟡', () => {
  // decideBadge 는 주의 신호를 셀 때 **확신도 높은 것만** 센다. 그래서 점수가
  // 주의 쪽인 항목이 있어도 모델이 확신하지 못했으면 🔴 이 아니라 🟡 에 머문다.
  // 화면은 지금까지 그 둘을 같은 말로 보여 줬다 (PR #20 리뷰).
  beforeEach(() => {
    mountDocument()
    const details = document.createElement('ul')
    details.id = 'details'
    details.hidden = true
    const foot = document.createElement('footer')
    foot.id = 'foot'
    const toggle = document.createElement('button')
    toggle.id = 'details-toggle'
    const home = document.createElement('a')
    home.id = 'homepage'
    foot.append(toggle, home)
    document.body.append(details, foot)
  })

  const lines = () =>
    [...document.querySelectorAll('.ge-popup__detail')].map((x) => x.textContent ?? '')

  it('확신이 모자라 🟡 이면 그렇다고 말한다', () => {
    // 점수는 주의 쪽인데 확신하지 못한 항목이 있다.
    render(verdict([item('clickbait_headline', 0.9, false), item('source_citation', 0.2)], 'CHECK'))
    expect(lines()[0], '맨 앞에 와야 한다 — 자세히의 첫 질문이 "왜 이 판정인가" 다')
      .toBe(content.app.lowConfidence)
  })

  it('신호가 뚜렷해서 🟡 이면 그 말을 쓰지 않는다', () => {
    // 확신은 하는데 점수가 중간이라 🟡 인 경우. 이유가 다르다.
    render(verdict([item('clickbait_headline', 0.4), item('source_citation', 0.4)], 'CHECK'))
    expect(lines()).not.toContain(content.app.lowConfidence)
  })

  it('🔴 이나 🟢 에는 쓰지 않는다', () => {
    for (const level of ['CAUTION', 'SAFE'] as const) {
      render(verdict([item('clickbait_headline', 0.9, false)], level))
      expect(lines(), level).not.toContain(content.app.lowConfidence)
    }
  })
})

describe('4차 문구가 실제로 쓰인다', () => {
  // 문구를 받아 놓고 배선을 안 하면 ui.ko.json 에만 남는다.
  it('app 의 문구가 전부 어딘가에서 쓰인다', () => {
    const used = new Set(['homepage', 'details', 'basis', 'coverage', 'criteria', 'lowConfidence', 'disclaimer'])
    const keys = Object.keys(content.app).filter((k) => !k.startsWith('$'))
    expect(keys.filter((k) => !used.has(k)), '배선하지 않은 문구가 있다').toEqual([])
  })

  it('무엇을 보고 낸 판단인지 셋 다 있다', () => {
    expect(Object.keys(content.app.basis).sort()).toEqual(['headline', 'page', 'selection'])
  })

  it('자리표시자가 짝이 맞는다', () => {
    expect(content.app.coverage.sentences).toContain('{total}')
    expect(content.app.coverage.sentences).toContain('{judged}')
    expect(content.app.criteria).toContain('{version}')
    expect(content.app.criteria).toContain('{model}')
  })
})

describe('왜 이 판정인가 — 항목별 설명', () => {
  // 두 곳에서 온다 — Jev 가 **잰** 것과 코드가 **찾은** 것.
  // Jev 는 "이 표현이 있는가" 를 못 센다 (docs/jev.md 8절). 그 일은 코드가 한다.
  const parts = content.explain.emotional_language.parts

  it('코드가 찾은 글자를 그대로 인용한다', () => {
    const lines = explainLines('emotional_language', {
      itemId: 'emotional_language',
      found: {},
      spans: { emo_exclaim: ['!!'], emo_repeat: [], emo_fear: [] },
    })
    expect(lines[0]).toEqual({ text: parts.emo_exclaim.present, quotes: ['!!'] })
    expect(lines.map((l) => l.text)).toContain(parts.emo_repeat.absent)
  })

  it('Jev 가 잰 것과 코드가 찾은 것이 한 목록에 들어간다', () => {
    const lines = explainLines('ai_style_signal', {
      itemId: 'ai_style_signal',
      found: { ai_same_frame: true },
      spans: { ai_summary_phrase: ['결론적으로'] },
    })
    expect(lines.map((l) => l.text)).toEqual([
      content.explain.ai_style_signal.parts.ai_same_frame.present,
      content.explain.ai_style_signal.parts.ai_summary_phrase.present,
    ])
  })

  it('본 것이 전부 아니오면 한 줄로 말한다', () => {
    const lines = explainLines('emotional_language', {
      itemId: 'emotional_language',
      found: {},
      spans: { emo_exclaim: [], emo_repeat: [], emo_fear: [] },
    })
    expect(lines).toEqual([{ text: content.explain.emotional_language.none }])
  })

  it('답이 없으면 아무 줄도 만들지 않는다', () => {
    expect(explainLines('emotional_language', null)).toEqual([])
    expect(
      explainLines('emotional_language', { itemId: 'emotional_language', found: {}, spans: {} }),
    ).toEqual([])
  })

  it('짝 문구가 없는 항목은 본문에서 집어 온 대목으로 말한다', () => {
    // 출처 표시는 기관명·실명이라 목록을 만들 수 없다. 그래서 하위 질문이 아니라
    // **본문에서 떼어 온 글자**를 보여 준다 (apps/proxy/src/pinpoint.ts).
    const lines = explainLines('source_citation', {
      itemId: 'source_citation',
      found: {},
      spans: {},
      quotes: ['통계청은', '한 관계자는'],
    })
    expect(lines).toEqual([
      { text: content.explain.source_citation.found, quotes: ['통계청은', '한 관계자는'] },
    ])
  })

  it('집어 온 대목이 없으면 "찾지 못했다" 고 말한다 — 빈 화면을 두지 않는다', () => {
    // 눌렀는데 아무것도 안 뜨는 것이 가장 나쁘다. 못 찾았으면 못 찾았다고 적는다.
    expect(
      explainLines('source_citation', { itemId: 'source_citation', found: {}, spans: {} }),
    ).toEqual([{ text: content.explain.source_citation.none }])
  })

  it('집어 온 대목은 우리가 쓴 말과 섞이지 않는다', () => {
    // 화면의 **문장은 전부 ChatKHU 가 미리 쓴 것**이고, 인용은 본문 글자 그대로다.
    const quotes = ['한 관계자는 더 오를 것이라고 말했다']
    const lines = explainLines('unverifiable_claim', {
      itemId: 'unverifiable_claim',
      found: {},
      spans: {},
      quotes,
    })
    const line = lines[0]!
    expect(line.text).toBe(content.explain.unverifiable_claim.found)
    expect(line.quotes).toEqual(quotes)
  })

  it('점수 숫자가 설명에 새지 않는다', () => {
    const lines = explainLines('emotional_language', {
      itemId: 'emotional_language',
      found: {},
      spans: { emo_exclaim: ['!!'] },
    })
    expect(lines.map((l) => l.text).join(' ')).not.toMatch(/0\.\d|\d+%|\d+점/)
  })
})

describe('펼침은 걸린 항목에만 붙는다', () => {
  // 일곱 줄이 전부 눌리는 것처럼 보이면 안 된다.
  const opens = () => document.querySelectorAll('.ge-popup__item-open')

  it('🔴·🟡 이고 설명할 말이 있는 항목에만 붙는다', () => {
    render(verdict([
      item('emotional_language', 0.9),    // 🔴 + 설명 있음 → 붙는다
      item('clickbait_headline', 0.5),    // 🟡 + 설명 있음 → 붙는다
      item('headline_body_match', 0),     // 🟢 → 안 붙는다
    ], 'CAUTION'))
    expect(opens()).toHaveLength(2)
    expect([...opens()].map((o) => o.textContent))
      .toEqual([content.items.emotional_language.name, content.items.clickbait_headline.name])
  })

  it('걸린 항목은 **하나도 빠짐없이** 펼칠 수 있다', () => {
    // 어디가 부족한지 모르면 답답하다 (GE-44). 쪼갠 질문이든, 코드가 찾는 규칙이든,
    // 본문에서 집어 오는 대목이든 — 일곱 항목 모두 설명하는 길이 있다.
    const 모두 = (schema.items as { id: string }[]).map((i) => i.id)
    render(verdict(모두.map((id) => item(id, 0.9)), 'CAUTION'))
    expect(opens()).toHaveLength(모두.length)
  })

  it('🟢·⚪ 에는 붙지 않는다', () => {
    render(verdict([item('emotional_language', 0), item('clickbait_headline', null)], 'SAFE'))
    expect(opens()).toHaveLength(0)
  })

  it('선택한 글에는 붙지 않는다 — 탭의 기사에 물어보는 길이다', () => {
    render(verdict([item('emotional_language', 0.9)], 'CAUTION'), document, 'selection')
    expect(opens()).toHaveLength(0)
  })

  it('접혀 있는 것이 기본이다', () => {
    render(verdict([item('emotional_language', 0.9)], 'CAUTION'))
    expect(opens()[0]?.getAttribute('aria-expanded')).toBe('false')
    expect((document.querySelector('.ge-popup__why') as HTMLElement).hidden).toBe(true)
  })
})

describe('하지 않은 일을 했다고 말하지 않는다', () => {
  beforeEach(() => {
    mountDocument()
    const img = document.createElement('img')
    img.id = 'brand-icon'
    const version = document.createElement('span')
    version.id = 'version'
    const details = document.createElement('ul')
    details.id = 'details'
    details.hidden = true
    const foot = document.createElement('footer')
    foot.id = 'foot'
    const toggle = document.createElement('button')
    toggle.id = 'details-toggle'
    const home = document.createElement('a')
    home.id = 'homepage'
    foot.append(toggle, home)
    document.body.append(img, version, details, foot)
  })

  const detailText = () => document.getElementById('details')?.textContent ?? ''

  it('판단한 적이 없으면 무엇을 보았다고 말하지 않는다', () => {
    // 기사 페이지가 아닌 곳에서 아이콘을 누른 경우.
    render({ level: 'UNDETERMINED' })
    expect(detailText(), '하지 않은 일을 했다고 말하면 안 된다')
      .not.toContain(content.app.basis.page)
  })

  it('판단했으면 무엇을 보았는지 말한다', () => {
    render(verdict([item('source_citation', 0.2)], 'SAFE'))
    expect(detailText()).toContain(content.app.basis.page)
  })

  it('판단한 적이 없어도 틀은 그린다 — 빈 화면을 남기지 않는다', () => {
    render({ level: 'UNDETERMINED' })
    // 전제 한 줄은 판단 여부와 상관없이 할 말이다.
    expect(detailText()).toContain(content.app.disclaimer)
  })
})
