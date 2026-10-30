// 점수 합산과 단계 결정은 모델 없이 테스트한다 (docs/conventions/code-style.md "테스트").
// Jev 응답은 tests/fixtures/jev-answers.json 의 고정값이다.
import { describe, expect, it } from 'vitest'
import source from '../judgment-items.json'
import fixtures from './fixtures/jev-answers.json'
import {
  CAUTION_AT,
  CAUTION_CONFIDENCE,
  CONFIDENCE_FLOOR,
  ITEM_CAUTION_AT,
  ITEM_WEIGHTS,
  MIN_CAUTION_ITEMS,
  MIN_CONFIDENT_SENTENCES,
  NOISE,
  SAFE_BELOW,
  SIGNAL_SCORE,
  UNDETERMINED_BAND,
  decideBadge,
  judgeArticle,
  resolveBand,
  scoreArticle,
  scoreItem,
  scoreSentences,
  type ItemResult,
} from '../src'

const ALL_ITEMS = source.items.map((i) => i.id)
const choice = (choice: string, confidence = 0.9) => ({ type: 'choice', choice, probabilities: {}, confidence })
const score = (score: number, confidence = 0.9) => ({ type: 'score', score, legend: {}, probabilities: {}, confidence })
const noul = (p: number) => ({ type: 'noul', noul: p })
const sentence = (fa: number, nb: number) => ({ factual_assertion: noul(fa), named_basis: noul(nb) })
const judged = (id: string, s: number, isConfident = true): ItemResult => ({ id, score: s, isConfident })

describe('상수가 judgment-items.json 과 맞는다', () => {
  // 항목을 더하고 가중치를 빼먹으면 그 항목은 조용히 판단에서 빠진다.
  it('가중치·임계값이 모든 항목에 있고, 없는 항목에는 없다', () => {
    for (const table of [ITEM_WEIGHTS, CONFIDENCE_FLOOR, CAUTION_CONFIDENCE]) {
      expect(Object.keys(table).sort()).toEqual([...ALL_ITEMS].sort())
    }
  })

  it('Choice 의 signals 는 criteria 의 보기와 같고, 방향은 셋 중 하나다', () => {
    for (const item of source.items) {
      if (item.type !== 'choice') continue
      const signals = (item as unknown as { signals: Record<string, string> }).signals
      expect(Object.keys(signals).sort()).toEqual(Object.keys(item.question!.criteria).sort())
      for (const v of Object.values(signals)) expect(Object.keys(SIGNAL_SCORE)).toContain(v)
    }
  })

  it('문장 단위 항목의 combine 연산을 코드가 안다', () => {
    for (const item of source.items) {
      if (item.unit !== 'sentence') continue
      expect((item as unknown as { combine: { op: string } }).combine.op).toBe('and_not')
    }
  })

  it('경계가 모델 노이즈보다 넉넉하다', () => {
    const [lo, hi] = UNDETERMINED_BAND
    expect(0.5 - lo).toBeGreaterThan(NOISE * 3)
    expect(hi - 0.5).toBeGreaterThan(NOISE * 3)
    expect(CAUTION_AT - SAFE_BELOW).toBeGreaterThan(NOISE * 3)
  })

  it('🔴 은 🟢 보다 높은 확신도를 요구한다', () => {
    for (const id of ALL_ITEMS) {
      expect(CAUTION_CONFIDENCE[id as keyof typeof CAUTION_CONFIDENCE]).toBeGreaterThan(
        CONFIDENCE_FLOOR[id as keyof typeof CONFIDENCE_FLOOR],
      )
    }
  })
})

describe('고정 응답으로 기사 하나를 판단한다', () => {
  it('주의 신호가 여럿이고 확신도가 높으면 🔴', () => {
    const v = judgeArticle({ items: ALL_ITEMS, ...fixtures.caution })
    expect(v.level).toBe('CAUTION')
    expect(v.cautionSignals).toBeGreaterThanOrEqual(MIN_CAUTION_ITEMS)
  })

  it('신호가 없고 확신도가 충분하면 🟢', () => {
    expect(judgeArticle({ items: ALL_ITEMS, ...fixtures.safe }).level).toBe('SAFE')
  })

  it('확신도가 전부 낮으면 ⚪ — 항목마다 low_confidence, 문장은 uncertain', () => {
    const v = judgeArticle({ items: ALL_ITEMS, ...fixtures.low_confidence })
    expect(v.level).toBe('UNDETERMINED')
    expect(v.reason).toBe('not_enough_items')
    const reasons = Object.fromEntries(v.items.map((i) => [i.id, i.reason]))
    expect(reasons.source_citation).toBe('low_confidence')
    expect(reasons.emotional_language).toBe('low_confidence')
    expect(reasons.unverifiable_claim).toBe('uncertain')
  })

  it('응답이 정한 보기 밖이면 ⚪ — 확신도가 높아도', () => {
    const v = judgeArticle({ items: ALL_ITEMS, ...fixtures.out_of_options })
    expect(v.level).toBe('UNDETERMINED')
    for (const it of v.items) {
      expect(it.score).toBeNull()
      expect(it.reason).toBe('invalid_answer')
    }
  })

  it('⚪ 여도 항목별 결과는 남는다 (상세를 열 수 있어야 한다)', () => {
    const v = judgeArticle({ items: ALL_ITEMS, ...fixtures.low_confidence })
    expect(v.items.map((i) => i.id)).toEqual(ALL_ITEMS)
  })

  it('답이 아예 없는 항목은 missing_answer 로 ⚪', () => {
    const items = scoreArticle({ items: ['source_citation', 'unverifiable_claim'], answers: {} })
    expect(items.map((i) => i.reason)).toEqual(['missing_answer', 'missing_answer'])
  })
})

describe('scoreItem — Choice', () => {
  it('보기의 방향으로 점수를 낸다. 순서가 아니라 signals 를 읽는다', () => {
    expect(scoreItem('source_citation', choice('no_source')).score).toBe(1)
    expect(scoreItem('source_citation', choice('unnamed_source')).score).toBe(0.5)
    expect(scoreItem('source_citation', choice('named_source')).score).toBe(0)
  })

  it('확신도가 바닥선 아래면 ⚪, 바닥선과 같으면 판단한다', () => {
    const floor = CONFIDENCE_FLOOR.source_citation
    expect(scoreItem('source_citation', choice('no_source', floor - 0.01)).reason).toBe('low_confidence')
    const atFloor = scoreItem('source_citation', choice('no_source', floor))
    expect(atFloor.score).toBe(1)
    expect(atFloor.isConfident).toBe(false)
  })

  it('🔴 확신도 이상이어야 isConfident', () => {
    expect(scoreItem('source_citation', choice('no_source', CAUTION_CONFIDENCE.source_citation)).isConfident).toBe(true)
  })

  it.each([
    ['다른 항목의 보기', choice('strong')],
    ['프로토타입 이름', choice('constructor')],
    ['대소문자가 다른 보기', choice('No_Source')],
    ['유형이 다름', score(1)],
    ['confidence 없음', { type: 'choice', choice: 'no_source' }],
    ['confidence NaN', choice('no_source', Number.NaN)],
    ['confidence 1 초과', choice('no_source', 1.2)],
    ['객체가 아님', 'no_source'],
    ['배열', ['no_source']],
  ])('보기·모양 밖이면 invalid_answer: %s', (_name, answer) => {
    const r = scoreItem('source_citation', answer)
    expect(r.score).toBeNull()
    expect(r.reason).toBe('invalid_answer')
  })

  it('모르는 항목 id 는 unknown_item', () => {
    expect(scoreItem('constructor', choice('x')).reason).toBe('unknown_item')
    expect(scoreItem('factual_assertion', noul(0.9)).reason).toBe('unknown_item')
    // 문장 단위 항목을 기사 단위로 부르면 안 된다
    expect(scoreItem('unverifiable_claim', noul(0.9)).reason).toBe('unknown_item')
  })
})

describe('scoreItem — Score', () => {
  it('0 ~ (등급 수 − 1) 을 0~1 로 맞춘다', () => {
    expect(scoreItem('emotional_language', score(0)).score).toBe(0)
    expect(scoreItem('emotional_language', score(1.5)).score).toBe(0.5)
    expect(scoreItem('emotional_language', score(3)).score).toBe(1)
  })

  it('4등급의 위쪽 절반(2 이상)이 주의 신호다', () => {
    expect(scoreItem('emotional_language', score(2)).score!).toBeGreaterThanOrEqual(ITEM_CAUTION_AT)
    expect(scoreItem('emotional_language', score(1)).score!).toBeLessThan(ITEM_CAUTION_AT)
  })

  it.each([
    ['범위 밖', score(3.01)],
    ['음수', score(-0.1)],
    ['문자열 숫자', { type: 'score', score: '2', confidence: 0.9 }],
    ['Infinity', score(Number.POSITIVE_INFINITY)],
  ])('invalid_answer: %s', (_name, answer) => {
    expect(scoreItem('emotional_language', answer).reason).toBe('invalid_answer')
  })

  it('확신도가 낮으면 ⚪', () => {
    expect(scoreItem('ai_style_signal', score(3, 0.2)).reason).toBe('low_confidence')
  })
})

describe('scoreSentences — 곱하기 전에 판정한다', () => {
  const [lo, hi] = UNDETERMINED_BAND

  it('사실 단정이 아니면(의견 문장) 다른 질문은 보지 않고 0', () => {
    // named_basis 가 "모름" 이어도 결과가 정해진다
    expect(scoreSentences([sentence(0.1, 0.5)]).score).toBe(0)
  })

  it('실명 근거가 있으면 다른 질문은 보지 않고 0', () => {
    expect(scoreSentences([sentence(0.5, 0.9)]).score).toBe(0)
  })

  it('둘 다 0.5(모름)면 곱 0.25 가 아니라 ⚪', () => {
    const r = scoreSentences([sentence(0.5, 0.5)])
    expect(r.score).toBeNull()
    expect(r.reason).toBe('uncertain')
  })

  it('한쪽만 "모름" 이어도 그 문장은 ⚪', () => {
    expect(scoreSentences([sentence(0.9, 0.5)]).reason).toBe('uncertain')
  })

  it('밴드 양 끝은 "모름" 안이다', () => {
    expect(scoreSentences([sentence(hi, 0.1)]).reason).toBe('uncertain')
    expect(scoreSentences([sentence(0.9, lo)]).reason).toBe('uncertain')
  })

  it('둘 다 확실하면 combine 값 P(a) × (1 − P(b))', () => {
    expect(scoreSentences([sentence(0.9, 0.1)]).score).toBeCloseTo(0.81)
  })

  it('⚪ 문장은 분모에서 뺀다. 개수를 센다', () => {
    const r = scoreSentences([sentence(1, 0), sentence(0, 0), sentence(0.5, 0.5)])
    expect(r.score).toBe(0.5)
    expect(r.sentences).toEqual({ total: 3, judged: 2 })
  })

  it('판단된 문장이 MIN_CONFIDENT_SENTENCES 이상이어야 확신한 것으로 본다', () => {
    const many = Array.from({ length: MIN_CONFIDENT_SENTENCES }, () => sentence(0.9, 0.1))
    expect(scoreSentences(many).isConfident).toBe(true)
    expect(scoreSentences(many.slice(1)).isConfident).toBe(false)
    // "모름" 문장이 많아도 판단된 문장 수만 센다
    expect(scoreSentences([sentence(0.93, 0.05), ...Array(29).fill(sentence(0.5, 0.5))]).isConfident).toBe(false)
  })

  it('판단된 문장 하나로 🔴 을 받치지 않는다', () => {
    const v = judgeArticle({
      items: ['source_citation', 'unverifiable_claim'],
      answers: { source_citation: choice('no_source') },
      sentences: [sentence(0.93, 0.05), ...Array(29).fill(sentence(0.5, 0.5))],
    })
    expect(v.score!).toBeGreaterThanOrEqual(CAUTION_AT)
    expect(v.cautionSignals).toBe(1)
    expect(v.level).toBe('CHECK')
  })

  it('모양이 틀린 문장만 있으면 invalid_answer, 문장이 없으면 missing_answer', () => {
    expect(scoreSentences([{ factual_assertion: noul(0.9) }]).reason).toBe('invalid_answer')
    expect(scoreSentences([null, 'x']).reason).toBe('invalid_answer')
    expect(scoreSentences([]).reason).toBe('missing_answer')
  })

  it('기사 단위 항목을 문장 단위로 부르면 unknown_item', () => {
    expect(scoreSentences([sentence(0.9, 0.1)], 'source_citation').reason).toBe('unknown_item')
  })
})

describe('resolveBand — JSON 의 undetermined_band', () => {
  it('정해진 값이 기본값을 이긴다', () => {
    expect(resolveBand([0.35, 0.65])).toEqual([0.35, 0.65])
  })

  it.each([
    ['null', null],
    ['뒤집힌 구간', [0.6, 0.4]],
    ['폭 0', [0.5, 0.5]],
    ['문자열', ['0.4', '0.6']],
    ['범위 밖', [-0.1, 0.6]],
    ['길이가 다름', [0.4]],
  ])('모양이 틀리면 기본값: %s', (_name, raw) => {
    expect(resolveBand(raw)).toEqual(UNDETERMINED_BAND)
  })
})

describe('decideBadge — 단계 경계', () => {
  const clear = (ids: string[]) => ids.map((id) => judged(id, 0))

  it('판단된 항목이 하나뿐이면 ⚪ — 신호 하나로 기사 전체를 단정하지 않는다', () => {
    const v = decideBadge([judged('source_citation', 0), { id: 'clickbait_headline', score: null, isConfident: false }])
    expect(v.level).toBe('UNDETERMINED')
    expect(v.score).toBeNull()
  })

  it('ai_style_signal 은 단독으로 🔴 을 만들지 못한다', () => {
    const others = ALL_ITEMS.filter((id) => id !== 'ai_style_signal')
    const v = decideBadge([judged('ai_style_signal', 1), ...clear(others)])
    expect(v.level).not.toBe('CAUTION')
    // 다른 항목이 전부 중간이어도 마찬가지다
    const mid = decideBadge([judged('ai_style_signal', 1), ...others.map((id) => judged(id, 0.5))])
    expect(mid.level).not.toBe('CAUTION')
  })

  it('모든 항목이 중간 보기면 🟡 — 주의 신호가 없으니 🔴 이 아니다', () => {
    expect(decideBadge(ALL_ITEMS.map((id) => judged(id, 0.5))).level).toBe('CHECK')
  })

  it('주의 신호가 하나라도 있으면 🟢 이 아니다', () => {
    const [first, ...rest] = ALL_ITEMS
    expect(decideBadge([judged(first, 1), ...clear(rest)]).level).toBe('CHECK')
    // 확신도가 중간인 주의 신호도 🟢 은 막는다
    expect(decideBadge([judged(first, 1, false), ...clear(rest)]).level).toBe('CHECK')
  })

  it('주의 신호 둘에 나머지가 안심이면 🟡, 셋이면 🔴', () => {
    const ids = ALL_ITEMS.filter((id) => id !== 'ai_style_signal')
    const two = decideBadge([...ids.slice(0, 2).map((id) => judged(id, 1)), ...clear(ids.slice(2))])
    expect(two.level).toBe('CHECK')
    const three = decideBadge([...ids.slice(0, 3).map((id) => judged(id, 1)), ...clear(ids.slice(3))])
    expect(three.level).toBe('CAUTION')
  })

  it('확신도가 중간인 항목만으로는 🟢 도 아니다 — 🟡 로 간다', () => {
    const v = decideBadge(ALL_ITEMS.map((id) => judged(id, 0, false)))
    expect(v.score).toBe(0)
    expect(v.level).toBe('CHECK')
    // 확신도 높은 항목이 MIN_JUDGED_ITEMS 만큼 있으면 🟢
    const [a, b, ...rest] = ALL_ITEMS
    expect(decideBadge([judged(a, 0), judged(b, 0), ...rest.map((id) => judged(id, 0, false))]).level).toBe('SAFE')
  })

  it('확신도가 중간인 주의 신호는 🔴 을 받치지 못한다 — 🟡 로 간다', () => {
    const v = decideBadge(ALL_ITEMS.map((id) => judged(id, 1, false)))
    expect(v.score).toBe(1)
    expect(v.cautionSignals).toBe(0)
    expect(v.level).toBe('CHECK')
  })

  it('⚪ 항목은 평균을 끌어내리지 않는다', () => {
    const v = decideBadge([
      judged('source_citation', 1),
      judged('headline_body_match', 1),
      ...ALL_ITEMS.slice(2).map((id) => ({ id, score: null, isConfident: false })),
    ])
    expect(v.score).toBe(1)
    expect(v.level).toBe('CAUTION')
  })

  it('가중치가 평균에 반영된다', () => {
    const v = decideBadge([judged('ai_style_signal', 1), judged('source_citation', 0)])
    const w = ITEM_WEIGHTS.ai_style_signal
    expect(v.score).toBeCloseTo(w / (w + ITEM_WEIGHTS.source_citation))
  })

  it('모르는 항목 id 의 점수는 판단에 넣지 않는다', () => {
    const v = decideBadge([judged('constructor', 1), judged('toString', 1), judged('source_citation', 0)])
    expect(v.level).toBe('UNDETERMINED')
  })

  it('decideBadge 에 같은 항목이 두 번 와도 주의 신호 하나는 하나다', () => {
    const [x, y] = ALL_ITEMS
    const v = decideBadge([judged(x, 1), judged(x, 1), judged(y, 1, false)])
    expect(v.cautionSignals).toBe(1)
    expect(v.level).toBe('CHECK')
  })

  it.each([
    ['NaN', Number.NaN],
    ['1 초과', 5],
    ['음수', -1],
  ])('캐시에서 온 점수가 범위 밖이면 ⚪ 항목으로 본다: %s', (_name, bad) => {
    const [x, y, z] = ALL_ITEMS
    const v = decideBadge([judged(x, bad), judged(y, 1), judged(z, 0)])
    expect(v.score).toBe(0.5)
    expect(v.level).not.toBe('CAUTION')
  })

  it('같은 항목을 두 번 넣어도 한 번만 센다', () => {
    const items = scoreArticle({ items: ['source_citation', 'source_citation'], answers: fixtures.safe.answers })
    expect(items).toHaveLength(1)
  })
})
