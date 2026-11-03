// @vitest-environment happy-dom
//
// 걸린 항목의 대목을 모으는 부분.
//
// 여기서 보는 것 넷이다.
//   1. **모델을 부르지 않는다.** 판정과 함께 온 Jev 의 문장 답만 쓴다
//   2. 문장마다 제 단계로 칠한다 (항목 평균이 아니다)
//   3. 한 문장이 여러 항목에 걸리면 하나로 묶고, 빨강이 앞에 온다
//   4. 팝업이 쓰는 문장과 형광펜이 쓰는 문장이 **같다**
import { describe, expect, it } from 'vitest'
import content from '../../../packages/content/ui.ko.json'
import type { ArticleVerdict } from '../lib/protocol'
import { codeMarks, gatherMarks, hasSentenceAnswer, sentencePicks } from '../lib/marks'

/** `spr_urging` 규칙에 걸리는 글. 코드가 찾을 수 있다 */
const 공유요구 = '꼭 공유하세요'
const 근거없는문장 = '한 관계자는 더 오를 것이라고 말했다.'
const 평범한문장 = '정부가 대책을 내놓았다.'
const SENTENCES = [평범한문장, 근거없는문장, `${공유요구}.`]
const BODY = SENTENCES.join(' ')
const HEADLINE = '충격! 역대급 대책이 나왔다'

function 판정(
  items: { id: string; score: number; isConfident: boolean }[],
  extra: Partial<ArticleVerdict> = {},
): ArticleVerdict {
  return {
    level: 'CAUTION',
    score: 0.8,
    cautionSignals: items.length,
    items: items.map((i) => ({ ...i })),
    ...extra,
  } as ArticleVerdict
}

const 기본 = { body: BODY, headline: HEADLINE, sentences: SENTENCES, level: 'CAUTION' as const }

describe('코드가 찾는 몫', () => {
  it('정해진 표현을 찾아 항목 이름을 붙인다', () => {
    const got = codeMarks('spread_inducement', 'CHECK', { body: BODY })
    expect(got.length).toBeGreaterThan(0)
    expect(got[0]?.why.item).toBe('공유 유도')
    expect(got[0]?.text).toContain('공유')
  })

  it('없는 항목이면 빈손이다', () => {
    expect(codeMarks('없는항목', 'CHECK', { body: BODY })).toEqual([])
  })

  it('제목 항목의 대목은 제목에서 찾는다', () => {
    const got = codeMarks('clickbait_headline', 'CAUTION', { headline: HEADLINE, body: BODY })
    expect(got.length).toBeGreaterThan(0)
    expect(got.every((r) => r.where === 'headline')).toBe(true)
    expect(got[0]?.why.item).toBe('제목 표현')
  })

  it('본문 항목은 본문에서 찾는다', () => {
    const got = codeMarks('spread_inducement', 'CHECK', { headline: HEADLINE, body: BODY })
    expect(got.every((r) => r.where === 'body')).toBe(true)
  })
})

describe('Jev 의 문장 답을 그대로 쓴다', () => {
  it('**점수가 붙은 문장을 그대로 칠한다** — 모델에 다시 묻지 않는다', () => {
    const got = gatherMarks({
      ...기본,
      verdict: 판정([{ id: 'unverifiable_claim', score: 0.5, isConfident: true }], {
        sentenceScores: [0, 0.5, 0],
      }),
    })
    expect(got).toHaveLength(1)
    expect(got[0]?.text).toBe(근거없는문장)
    expect(got[0]?.whys[0]?.item).toBe('확인하기 어려운 주장')
  })

  it('점수가 0 인 문장은 칠하지 않는다', () => {
    const got = gatherMarks({
      ...기본,
      verdict: 판정([{ id: 'unverifiable_claim', score: 0.5, isConfident: true }], {
        sentenceScores: [0, 0, 0],
      }),
    })
    expect(got).toEqual([])
  })

  it('문장 점수가 없으면 문장은 칠하지 않는다 — 캐시에서 온 판정이다', () => {
    const got = gatherMarks({
      ...기본,
      verdict: 판정([{ id: 'unverifiable_claim', score: 0.5, isConfident: true }]),
    })
    expect(got).toEqual([])
  })

  it('항목이 걸리지 않았으면 문장 점수가 있어도 그 항목으로 칠하지 않는다', () => {
    const got = gatherMarks({
      ...기본,
      verdict: 판정([{ id: 'spread_inducement', score: 0.5, isConfident: true }], {
        sentenceScores: [0, 0.9, 0],
      }),
    })
    expect(got.every((m) => m.whys.every((w) => w.item === '공유 유도'))).toBe(true)
  })
})

describe('단계', () => {
  it('**문장마다 제 단계다** — 항목 평균이 아니다', () => {
    const got = gatherMarks({
      ...기본,
      // 항목 평균은 0.3(노랑)인데 그 문장은 0.9(빨강)다.
      verdict: 판정([{ id: 'unverifiable_claim', score: 0.3, isConfident: true }], {
        sentenceScores: [0, 0.9, 0],
      }),
    })
    expect(got[0]?.level).toBe('CAUTION')
  })

  it('0.65 아래면 노랑이다', () => {
    const got = gatherMarks({
      ...기본,
      verdict: 판정([{ id: 'unverifiable_claim', score: 0.9, isConfident: true }], {
        sentenceScores: [0, 0.3, 0],
      }),
    })
    expect(got[0]?.level).toBe('CHECK')
  })

  it('코드가 찾은 몫은 항목 단계를 쓴다', () => {
    const got = gatherMarks({
      ...기본,
      verdict: 판정([{ id: 'spread_inducement', score: 0.9, isConfident: true }]),
    })
    expect(got[0]?.level).toBe('CAUTION')
  })

  it('확신이 없는 항목은 칠하지 않는다 — 보류를 칠하면 ⚪ 와 어긋난다', () => {
    const got = gatherMarks({
      ...기본,
      verdict: 판정([{ id: 'unverifiable_claim', score: 0.9, isConfident: false }], {
        sentenceScores: [0, 0.9, 0],
      }),
    })
    expect(got).toEqual([])
  })

  it('⚪ 에서는 아무것도 하지 않는다 — 판단 자체가 서지 않았다', () => {
    const got = gatherMarks({
      ...기본,
      level: 'UNDETERMINED',
      verdict: 판정([{ id: 'unverifiable_claim', score: 0.9, isConfident: true }], {
        sentenceScores: [0, 0.9, 0],
      }),
    })
    expect(got).toEqual([])
  })
})

describe('출처 항목도 같은 문장 답에서 나온다', () => {
  const 둘다 = [
    { id: 'unverifiable_claim', score: 0.3, isConfident: true },
    { id: 'source_citation', score: 0.9, isConfident: true },
  ]

  it('근거가 없다고 답한 문장에만 붙는다', () => {
    const got = gatherMarks({
      ...기본,
      verdict: 판정(둘다, { sentenceScores: [0, 0.3, 0], sentenceBasis: [null, 0.1, null] }),
    })
    expect(got).toHaveLength(1)
    expect(got[0]?.whys.map((w) => w.item).sort()).toEqual(['출처 표시', '확인하기 어려운 주장'])
  })

  it('근거가 있다고 답한 문장에는 출처 사유를 붙이지 않는다', () => {
    const got = gatherMarks({
      ...기본,
      verdict: 판정(둘다, { sentenceScores: [0, 0.3, 0], sentenceBasis: [null, 0.9, null] }),
    })
    expect(got[0]?.whys.map((w) => w.item)).toEqual(['확인하기 어려운 주장'])
  })

  it('**빨강과 노랑이 겹치면 빨강으로 칠하고 빨강 사유가 앞에 온다**', () => {
    const got = gatherMarks({
      ...기본,
      verdict: 판정(둘다, { sentenceScores: [0, 0.3, 0], sentenceBasis: [null, 0.1, null] }),
    })
    expect(got[0]?.level).toBe('CAUTION')
    expect(got[0]?.whys[0]?.level).toBe('CAUTION')
    expect(got[0]?.whys[0]?.item).toBe('출처 표시')
  })
})

describe('사유 문구', () => {
  it('집단·직함으로만 가리킨 문장과 아예 없는 문장을 가른다', () => {
    const 집단 = gatherMarks({
      ...기본,
      verdict: 판정([{ id: 'unverifiable_claim', score: 0.5, isConfident: true }], {
        sentenceScores: [0, 0.5, 0],
      }),
    })
    expect(집단[0]?.whys[0]?.reason).toBe(content.explain.unverifiable_claim.reasons.uvc_group_only)

    const 없음 = gatherMarks({
      ...기본,
      sentences: [평범한문장, '값이 두 배로 올랐다.', ''],
      verdict: 판정([{ id: 'unverifiable_claim', score: 0.5, isConfident: true }], {
        sentenceScores: [0, 0.5, 0],
      }),
    })
    expect(없음[0]?.whys[0]?.reason).toBe(content.explain.unverifiable_claim.reasons.uvc_no_basis)
  })

  it('화면에 id 가 뜨지 않는다 — 문구가 없으면 비운다', () => {
    const got = gatherMarks({
      ...기본,
      verdict: 판정([{ id: 'unverifiable_claim', score: 0.5, isConfident: true }], {
        sentenceScores: [0, 0.5, 0],
      }),
    })
    expect(got.length).toBeGreaterThan(0)
    for (const w of got[0]?.whys ?? []) {
      expect(w.item).not.toMatch(/^[a-z_]+$/)
      if (w.reason) expect(w.reason).not.toMatch(/^[a-z_]+$/)
    }
  })
})

describe('팝업과 형광펜이 같은 문장을 가리킨다', () => {
  it('문장 답이 있는 항목은 팝업도 모델에 묻지 않는다', () => {
    expect(hasSentenceAnswer('unverifiable_claim')).toBe(true)
    expect(hasSentenceAnswer('source_citation')).toBe(true)
    expect(hasSentenceAnswer('emotional_language')).toBe(false)
  })

  it('팝업이 받는 문장과 형광펜이 칠하는 문장이 같다', () => {
    const v = 판정([{ id: 'unverifiable_claim', score: 0.5, isConfident: true }], {
      sentenceScores: [0, 0.5, 0],
    })
    const 칠함 = gatherMarks({ ...기본, verdict: v }).map((m) => m.text)
    const 팝업 = sentencePicks(SENTENCES, v, 'unverifiable_claim').map((p) => p.text)
    expect(칠함.length).toBeGreaterThan(0)
    expect(팝업).toEqual(칠함)
  })

  it('팝업이 쓰는 why 는 문구가 있는 id 다', () => {
    const v = 판정([{ id: 'unverifiable_claim', score: 0.5, isConfident: true }], {
      sentenceScores: [0, 0.5, 0],
    })
    const picks = sentencePicks(SENTENCES, v, 'unverifiable_claim')
    const reasons = content.explain.unverifiable_claim.reasons as Record<string, string>
    expect(picks.length).toBeGreaterThan(0)
    for (const p of picks) expect(reasons[p.why]).toBeTruthy()
  })

  it('문장 답이 없는 항목에는 빈손이다 — 그때는 팝업이 모델에 묻는다', () => {
    const v = 판정([{ id: 'emotional_language', score: 0.5, isConfident: true }], {
      sentenceScores: [0, 0.5, 0],
    })
    expect(sentencePicks(SENTENCES, v, 'emotional_language')).toEqual([])
  })
})

describe('노랑도 제 자리를 얻는다', () => {
  it('**빨강이 자리를 다 가져가지 않는다** — 둘 다 칠해진다', () => {
    const 다섯 = ['가', '나', '다', '라', '마'].map((x) => `${x} 문장이 여기 있다.`)
    const got = gatherMarks({
      ...기본,
      sentences: 다섯,
      // 빨강 셋, 노랑 둘
      verdict: 판정([{ id: 'unverifiable_claim', score: 0.8, isConfident: true }], {
        sentenceScores: [0.9, 0.85, 0.8, 0.3, 0.2],
      }),
    })
    const levels = got.map((m) => m.level)
    expect(levels).toContain('CAUTION')
    expect(levels).toContain('CHECK')
  })

  it('단계마다 둘까지다', () => {
    const 여섯 = ['가', '나', '다', '라', '마', '바'].map((x) => `${x} 문장이 여기 있다.`)
    const got = gatherMarks({
      ...기본,
      sentences: 여섯,
      verdict: 판정([{ id: 'unverifiable_claim', score: 0.8, isConfident: true }], {
        sentenceScores: [0.9, 0.85, 0.8, 0.3, 0.25, 0.2],
      }),
    })
    expect(got.filter((m) => m.level === 'CAUTION')).toHaveLength(2)
    expect(got.filter((m) => m.level === 'CHECK')).toHaveLength(2)
  })

  it('각 단계에서 센 것을 고른다', () => {
    const 넷 = ['가', '나', '다', '라'].map((x) => `${x} 문장이 여기 있다.`)
    const got = gatherMarks({
      ...기본,
      sentences: 넷,
      verdict: 판정([{ id: 'unverifiable_claim', score: 0.8, isConfident: true }], {
        sentenceScores: [0.1, 0.5, 0.7, 0.95],
      }),
    })
    // 노랑 둘(0.5, 0.1 중 센 것 둘 = 0.5, 0.1), 빨강 둘(0.95, 0.7)
    expect(got.map((m) => m.text)).toEqual(넷)
  })

  it('기사에 나온 차례로 돌려준다 — 뽑은 순서에 끌려다니지 않는다', () => {
    const 셋 = ['가', '나', '다'].map((x) => `${x} 문장이 여기 있다.`)
    const got = gatherMarks({
      ...기본,
      sentences: 셋,
      verdict: 판정([{ id: 'unverifiable_claim', score: 0.8, isConfident: true }], {
        sentenceScores: [0.3, 0.9, 0.4],
      }),
    })
    expect(got.map((m) => m.text)).toEqual(셋)
  })
})

describe('감정적 표현도 문장 단위로 칠한다', () => {
  const 감정문장 = '충격적인 그의 행태에 모두가 경악했다.'
  const 담담한문장 = '정부가 대책을 내놓았다.'
  const 셋 = [담담한문장, 감정문장, '그 뒤 회의가 열렸다.']

  it('**Jev 가 그렇다고 답한 문장을 칠한다** — 코드가 못 찾는 것도 덮인다', () => {
    const got = gatherMarks({
      ...기본,
      sentences: 셋,
      verdict: 판정([{ id: 'emotional_language', score: 0.8, isConfident: true }], {
        sentenceScores: [0, 0, 0],
        sentenceEmotion: [0.1, 0.9, 0.2],
      }),
    })
    const 감정 = got.filter((m) => m.whys.some((w) => w.item === '감정적 표현'))
    expect(감정).toHaveLength(1)
    expect(감정[0]?.text).toBe(감정문장)
  })

  it('아니라고 답한 문장은 칠하지 않는다', () => {
    const got = gatherMarks({
      ...기본,
      sentences: 셋,
      verdict: 판정([{ id: 'emotional_language', score: 0.8, isConfident: true }], {
        sentenceScores: [0, 0, 0],
        sentenceEmotion: [0.1, 0.2, 0.3],
      }),
    })
    expect(got.filter((m) => m.whys.some((w) => w.item === '감정적 표현'))).toEqual([])
  })

  it('**단정 점수를 문턱으로 쓰지 않는다** — 담담한 문장도 그 점수는 높을 수 있다', () => {
    const got = gatherMarks({
      ...기본,
      sentences: 셋,
      verdict: 판정([{ id: 'emotional_language', score: 0.8, isConfident: true }], {
        // 담담한 문장(0번)이 단정 점수는 가장 높지만 감정은 아니다
        sentenceScores: [0.95, 0, 0],
        sentenceEmotion: [0.1, 0.9, 0.1],
      }),
    })
    const 감정 = got.filter((m) => m.whys.some((w) => w.item === '감정적 표현'))
    expect(감정[0]?.text).toBe(감정문장)
  })

  it('항목이 안 걸렸으면 칠하지 않는다', () => {
    const got = gatherMarks({
      ...기본,
      sentences: 셋,
      verdict: 판정([{ id: 'spread_inducement', score: 0.8, isConfident: true }], {
        sentenceScores: [0, 0, 0],
        sentenceEmotion: [0.9, 0.9, 0.9],
      }),
    })
    expect(got.filter((m) => m.whys.some((w) => w.item === '감정적 표현'))).toEqual([])
  })

  it('둘까지만 칠한다', () => {
    const 넷 = ['가 문장이다.', '나 문장이다.', '다 문장이다.', '라 문장이다.']
    const got = gatherMarks({
      ...기본,
      sentences: 넷,
      verdict: 판정([{ id: 'emotional_language', score: 0.8, isConfident: true }], {
        sentenceScores: [0, 0, 0, 0],
        sentenceEmotion: [0.9, 0.9, 0.9, 0.9],
      }),
    })
    expect(got.filter((m) => m.whys.some((w) => w.item === '감정적 표현'))).toHaveLength(2)
  })

  it('문장 답이 없으면 코드가 찾은 것만 남는다 — 캐시에서 온 옛 판정이다', () => {
    const got = gatherMarks({
      ...기본,
      sentences: 셋,
      verdict: 판정([{ id: 'emotional_language', score: 0.8, isConfident: true }]),
    })
    // 본문에 "충격" 같은 낱말이 없으므로 빈손이다. 터지지 않는 것이 중요하다.
    expect(Array.isArray(got)).toBe(true)
  })
})

describe('🟢 에서도 칠한다', () => {
  it('**배지가 안심이어도 걸린 자리는 보여 준다**', () => {
    const got = gatherMarks({
      ...기본,
      level: 'SAFE',
      verdict: 판정([{ id: 'unverifiable_claim', score: 0.3, isConfident: true }], {
        sentenceScores: [0, 0.3, 0],
      }),
    })
    expect(got).toHaveLength(1)
    expect(got[0]?.level).toBe('CHECK')
  })

  it('🟢 에서도 걸린 것이 없으면 빈손이다', () => {
    const got = gatherMarks({
      ...기본,
      level: 'SAFE',
      verdict: 판정([{ id: 'unverifiable_claim', score: 0, isConfident: true }], {
        sentenceScores: [0, 0, 0],
      }),
    })
    expect(got).toEqual([])
  })
})
