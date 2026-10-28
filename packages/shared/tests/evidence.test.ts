// 코드가 찾는 표현.
//
// **Jev 가 못 하는 일을 코드가 한다** — 글자가 거기 있는지 세는 일.
// 실제로 Jev 는 "이 소식을 꼭 공유해 주세요." 에 0.12 를 돌려줬다 (docs/jev.md 8절).
// 여기 검사는 그 자리를 코드가 틀림없이 찾는다는 것을 못 박는다.
import { describe, expect, it } from 'vitest'
import { evidenceRuleIds, findEvidence, hasCodeEvidence } from '../src/evidence'

/** 그 규칙이 찾아낸 글자들. 못 찾았으면 빈 배열. */
const found = (itemId: string, input: { headline?: string; body?: string }, id: string): string[] =>
  findEvidence(itemId, input).find((e) => e.id === id)?.spans.map((s) => s.text) ?? []

describe('제목 표현', () => {
  // **Jev 와 나눠 맡는 유일한 항목이다.** Jev 가 "큰 수식어가 있는가" 를 재고
  // (0.77, docs/jev.md 8절), 코드는 그게 어느 낱말인지 찾아 같은 줄에 붙인다.
  it('사안보다 큰 수식어를 **제목에서** 찾는다', () => {
    expect(found('clickbait_headline', { headline: '충격 … 전면 백지화' }, 'clk_inflating'))
      .toEqual(['충격'])
  })

  it('본문은 보지 않는다 — 이 질문의 판단 범위가 제목이다', () => {
    expect(found('clickbait_headline', { body: '충격적인 결과였다.' }, 'clk_inflating')).toEqual([])
  })

  it('궁금증만 남기는 구절을 **부호가 아니라 구절째** 뜬다', () => {
    // 실제로 놓쳤던 제목이다. 물음표 하나만 따오면 설명이 되지 않는다.
    expect(
      found(
        'clickbait_headline',
        { headline: '금메달 따면 군 면제? 달라진다…정부, 병역특례 대폭 축소 검토' },
        'clk_hiding',
      ),
    ).toEqual(['금메달 따면 군 면제?', '달라진다…'])
  })

  it('부호가 없으면 찾지 않는다', () => {
    expect(found('clickbait_headline', { headline: '정부, 병역특례 축소 검토' }, 'clk_hiding'))
      .toEqual([])
  })

  it('제목을 통째로 집지 않는다', () => {
    const headline = '가'.repeat(60) + '?'
    const got = found('clickbait_headline', { headline }, 'clk_hiding')
    expect(got[0]?.length).toBeLessThanOrEqual(21)
  })
})

describe('공유 유도', () => {
  it('공유를 직접 요구하는 말을 찾는다 — Jev 가 0.12 를 준 바로 그 글이다', () => {
    expect(found('spread_inducement', { body: '이 소식을 꼭 공유해 주세요.' }, 'spr_urging'))
      .toEqual(['공유해 주세요'])
  })

  it('전달할 필요를 강조하는 말을 찾는다', () => {
    expect(found('spread_inducement', { body: '모두가 알아야 할 내용입니다.' }, 'spr_hinting'))
      .toEqual(['모두가 알아야'])
  })

  it('없으면 빈 채로 돌려준다 — "없다" 도 할 말이다', () => {
    const out = findEvidence('spread_inducement', { body: '기상청은 비가 온다고 예보했다.' })
    expect(out.map((e) => e.id).sort()).toEqual(['spr_hinting', 'spr_urging'])
    expect(out.every((e) => e.spans.length === 0)).toBe(true)
  })
})

describe('감정적 표현', () => {
  it('연달아 쓴 느낌표를 찾는다 — Jev 는 0.41 로 "모르겠다" 였다', () => {
    expect(found('emotional_language', { body: '당신도 당할 수 있다!!' }, 'emo_exclaim'))
      .toEqual(['!!'])
  })

  it('느낌표 하나는 신호가 아니다', () => {
    expect(found('emotional_language', { body: '반가운 소식입니다!' }, 'emo_exclaim')).toEqual([])
  })

  it('감정 낱말은 **되풀이**될 때만 신호다', () => {
    // criteria 가 "낱말의 반복" 이라고 적어 두었다. 한 번은 반복이 아니다.
    expect(found('emotional_language', { body: '그는 분노했다.' }, 'emo_repeat')).toEqual([])
    expect(found('emotional_language', { body: '그는 분노했다. 시민들은 경악했다.' }, 'emo_repeat'))
      .toEqual(['분노', '경악'])
  })

  it('독자를 겨냥한 말을 찾는다', () => {
    expect(found('emotional_language', { body: '당신도 당할 수 있다.' }, 'emo_fear'))
      .toEqual(['당신도'])
  })
})

describe('글의 문체', () => {
  it('정리 표현을 찾는다 — Jev 는 0.2 였다', () => {
    expect(found('ai_style_signal', { body: '결론적으로 이번 주는 변화가 많습니다.' }, 'ai_summary_phrase'))
      .toEqual(['결론적으로'])
  })

  it('양쪽을 맞추는 문장을 찾는다', () => {
    expect(found('ai_style_signal', { body: '장단점이 모두 있습니다.' }, 'ai_both_sides'))
      .toEqual(['장단점이 모두 있'])
  })
})

describe('어디에 있는지 돌려준다', () => {
  // **이것이 Jev 도 LLM 도 못 하는 일이다.** 자리를 정확히 안다.
  it('자리가 원문과 맞는다', () => {
    const body = '앞말. 이 글을 꼭 공유해 주세요. 뒷말.'
    const span = findEvidence('spread_inducement', { body })
      .find((e) => e.id === 'spr_urging')?.spans[0]
    expect(span).toBeDefined()
    expect(body.slice(span!.start, span!.end)).toBe(span!.text)
  })

  it('한 규칙이 글을 통째로 집어삼키지 않는다', () => {
    const body = '분노 '.repeat(50)
    const spans = findEvidence('emotional_language', { body })
      .find((e) => e.id === 'emo_repeat')?.spans ?? []
    expect(spans.length).toBeLessThanOrEqual(5)
  })

  it('원문을 고치지 않는다', () => {
    const body = '이 글을 꼭 공유해 주세요.'
    findEvidence('spread_inducement', { body })
    expect(body).toBe('이 글을 꼭 공유해 주세요.')
  })
})

describe('무엇을 설명할 수 있는가', () => {
  it('코드가 맡는 항목만 참이다', () => {
    expect(hasCodeEvidence('spread_inducement')).toBe(true)
    expect(hasCodeEvidence('emotional_language')).toBe(true)
    expect(hasCodeEvidence('ai_style_signal')).toBe(true)
    // 제목 표현은 Jev 와 나눠 맡는다 — 재는 것은 Jev, 어느 낱말인지는 코드.
    expect(hasCodeEvidence('clickbait_headline')).toBe(true)
    // 제목과 본문이 어긋나는 자리는 낱말이 아니라 **관계**라 떼어 올 글자가 없다.
    expect(hasCodeEvidence('headline_body_match')).toBe(false)
    // 출처 표시는 기관명·실명이라 사전이 있어야 하고, 우리에게 없다 — LLM 몫이다.
    expect(hasCodeEvidence('source_citation')).toBe(false)
  })

  it('모르는 항목에는 아무것도 돌려주지 않는다', () => {
    expect(findEvidence('없는항목', { body: '분노 분노' })).toEqual([])
  })

  it('볼 글이 없으면 아무것도 돌려주지 않는다', () => {
    expect(findEvidence('emotional_language', {})).toEqual([])
    expect(findEvidence('emotional_language', { body: '' })).toEqual([])
  })

  it('규칙 id 가 겹치지 않는다', () => {
    const ids = evidenceRuleIds()
    expect(new Set(ids).size).toBe(ids.length)
  })
})
