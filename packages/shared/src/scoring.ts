// Jev 의 답을 항목 점수로 바꾸고, 항목 점수를 배지 단계로 접는다.
//
// **모델에 점수를 묻지 않는다. 합산과 단계 결정은 전부 여기서 코드가 한다** (docs/jev.md 3절 ②).
// 숫자는 scoring-config.ts 에만 있다. 여기에는 판정 순서만 있다.
//
// DOM·브라우저 API·네트워크를 쓰지 않는다. 확장 프로그램과 중계 서버 어디서 불러도 같은 답이 나와야 한다.
import source from '../judgment-items.json'
import {
  CAUTION_AT,
  CAUTION_CONFIDENCE,
  CONFIDENCE_FLOOR,
  ITEM_CAUTION_AT,
  ITEM_WEIGHTS,
  MIN_CAUTION_ITEMS,
  MIN_CONFIDENT_SENTENCES,
  MIN_JUDGED_ITEMS,
  SAFE_BELOW,
  SIGNAL_SCORE,
  UNDETERMINED_BAND,
  type ItemId,
} from './scoring-config'

/** 배지 단계. 코드가 쓰는 값이다. 화면의 말은 packages/content 에서 고른다. */
export type BadgeLevel = 'SAFE' | 'CHECK' | 'CAUTION' | 'UNDETERMINED'

/**
 * 항목이 ⚪ 가 된 이유. **로그용이다. 사용자에게 구분해 보여 주지 않는다** (docs/requirements.md 2절).
 * 우리가 고칠 것(`invalid_answer`, `missing_answer`)과 모델이 모르는 것(`low_confidence`, `uncertain`)은
 * 다른 문제라 나눠 둔다.
 */
export type UndeterminedReason =
  | 'missing_answer' // 그 질문의 답이 응답에 없다
  | 'invalid_answer' // 정한 보기·범위 밖의 답, 유형이 다른 답
  | 'low_confidence' // Choice·Score 의 confidence 가 바닥선 아래
  | 'uncertain' // Noul 확률이 "모름" 구간 안. 문장 단위 항목에서 판단된 문장이 하나도 없다
  | 'unknown_item' // judgment-items.json 에 없는 항목 id

export interface ItemResult {
  id: string
  /** 0(안심) ~ 1(주의). `null` 이면 이 항목은 ⚪ */
  score: number | null
  /** 🔴 을 받쳐 줄 만큼 확신했는가 (`CAUTION_CONFIDENCE` 이상) */
  isConfident: boolean
  reason?: UndeterminedReason
  /** 문장 단위 항목만. **개수는 코드가 센다** (docs/product.md 4절) */
  sentences?: { total: number; judged: number }
}

export interface Verdict {
  level: BadgeLevel
  /** 판단된 항목의 가중평균. **로그와 eval 용이다. 사용자에게 숫자를 보여 주지 않는다** (docs/product.md 3절) */
  score: number | null
  /** 확신도 높은 주의 신호의 수 */
  cautionSignals: number
  /** ⚪ 상태에서도 상세를 연다. 어느 항목이 판단됐고 어느 항목이 보류인지 여기서 본다 */
  items: ItemResult[]
  reason?: 'not_enough_items'
}

// --- judgment-items.json 읽기 ------------------------------------------------------

interface ItemDef {
  id: string
  type: 'choice' | 'score' | 'noul'
  unit: 'article' | 'sentence'
  signals?: Record<string, keyof typeof SIGNAL_SCORE>
  question?: { criteria: Record<string, string> | string[] }
  combine?: { op: string; a: string; b: string }
  undetermined_band?: [number, number] | null
}

const ITEMS = new Map((source.items as unknown as ItemDef[]).map((i) => [i.id, i]))

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** NaN·Infinity·문자열 숫자를 거른다. 응답은 네트워크에서 온 값이라 믿지 않는다. */
const isUnitNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1

/** 이 항목이 우리가 아는 항목인가. `Map.has` 라 "constructor" 같은 프로토타입 이름에 속지 않는다. */
function itemDef(id: string): ItemDef | undefined {
  return ITEMS.get(id)
}

const undetermined = (id: string, reason: UndeterminedReason): ItemResult => ({
  id,
  score: null,
  isConfident: false,
  reason,
})

// --- 항목 하나 (기사 단위) ---------------------------------------------------------

/**
 * 기사 단위 항목(Choice·Score) 하나의 답을 점수로 바꾼다.
 *
 * Choice 는 **고른 보기의 방향(`signals`)만** 점수로 쓴다. `probabilities` 로 기댓값을 내지 않는다.
 * 상세 화면에서 "어느 보기가 나왔다" 로 설명할 수 있어야 하고, 분포의 퍼짐은 이미 `confidence` 가 담고 있다.
 */
export function scoreItem(id: string, answer: unknown): ItemResult {
  const def = itemDef(id)
  if (!def || def.unit !== 'article') return undetermined(id, 'unknown_item')
  if (answer === undefined || answer === null) return undetermined(id, 'missing_answer')
  if (!isPlainObject(answer)) return undetermined(id, 'invalid_answer')
  if (answer.type !== def.type) return undetermined(id, 'invalid_answer')
  if (!isUnitNumber(answer.confidence)) return undetermined(id, 'invalid_answer')

  let score: number
  if (def.type === 'choice') {
    const signals = def.signals ?? {}
    // `in` 은 프로토타입까지 본다. "constructor" 같은 답이 통과하면 안 된다.
    if (typeof answer.choice !== 'string' || !Object.hasOwn(signals, answer.choice))
      return undetermined(id, 'invalid_answer')
    score = SIGNAL_SCORE[signals[answer.choice]]
  } else if (def.type === 'score') {
    const grades = Array.isArray(def.question?.criteria) ? def.question.criteria.length : 0
    if (grades < 2) return undetermined(id, 'invalid_answer')
    const max = grades - 1
    // **Score 는 0~1 이 아니라 0 ~ (등급 수 − 1) 이다** (2026-10-21 실측, packages/shared/README.md).
    // 등급 수가 다른 항목을 섞기 전에 (등급 수 − 1) 로 나눠 0~1 로 맞춘다.
    if (typeof answer.score !== 'number' || !Number.isFinite(answer.score)) return undetermined(id, 'invalid_answer')
    if (answer.score < 0 || answer.score > max) return undetermined(id, 'invalid_answer')
    score = answer.score / max
  } else {
    return undetermined(id, 'unknown_item')
  }

  // 답의 모양을 먼저 보고 확신도를 본다. 보기 밖의 답은 확신도가 높아도 쓸 수 없다.
  const confidence = answer.confidence
  if (confidence < CONFIDENCE_FLOOR[id as ItemId]) return undetermined(id, 'low_confidence')
  return { id, score, isConfident: confidence >= CAUTION_CONFIDENCE[id as ItemId] }
}

// --- 문장 단위 항목 ------------------------------------------------------------------

/** Noul 답에서 "예" 확률만 꺼낸다. 모양이 틀리면 `null`. */
function noulOf(answer: unknown): number | null {
  if (!isPlainObject(answer) || answer.type !== 'noul') return null
  return isUnitNumber(answer.noul) ? answer.noul : null
}

/**
 * "모름" 구간. judgment-items.json 의 `undetermined_band` 가 정해졌으면 그 값이 이긴다.
 * `null` 이거나 **모양이 틀리면 기본값**이다. 뒤집힌 구간(`[0.6, 0.4]`)을 그대로 쓰면 모든 값이
 * "모름 밖" 이 되어 0.5 두 개의 곱이 확신한 값으로 쓰인다.
 */
export function resolveBand(raw: unknown): readonly [number, number] {
  if (!Array.isArray(raw) || raw.length !== 2) return UNDETERMINED_BAND
  const [lo, hi] = raw
  if (!isUnitNumber(lo) || !isUnitNumber(hi) || lo >= hi) return UNDETERMINED_BAND
  return [lo, hi]
}

/**
 * 문장 하나의 값. 0(안심) ~ 1(주의), "모름" 이면 `'uncertain'`, 답 모양이 틀리면 `'invalid'`.
 *
 * **곱하기 전에 판정한다.** 둘 다 0.5(모름)면 곱이 0.25 라 확신한 것처럼 보이기 때문이다.
 * 순서는 packages/shared/README.md "`combine`과 ⚪ — 판정 순서" 를 그대로 옮겼다.
 */
function sentenceValue(def: ItemDef, answers: unknown): number | 'uncertain' | 'invalid' {
  const combine = def.combine
  // 지금 아는 연산은 and_not 하나다. 모르는 연산을 추측해서 계산하지 않는다.
  if (!combine || combine.op !== 'and_not') return 'invalid'
  if (!isPlainObject(answers)) return 'invalid'
  const a = noulOf(answers[combine.a])
  const b = noulOf(answers[combine.b])
  if (a === null || b === null) return 'invalid'

  const [lo, hi] = resolveBand(def.undetermined_band)
  // 1. 하나가 결과를 정하면 다른 질문은 보지 않는다 (의견 문장, 실명 출처가 있는 문장)
  if (a < lo || b > hi) return 0
  // 2. 그 밖에 하나라도 "모름" 이면 그 문장은 ⚪. 1 을 지났으니 a 는 hi 초과, b 는 lo 미만이어야 "앎" 이다
  if (a <= hi || b >= lo) return 'uncertain'
  // 3. 둘 다 "모름" 밖이면 combine 값
  return a * (1 - b)
}

/**
 * 문장 단위 항목(`unverifiable_claim`)의 점수. `perSentence` 는 문장마다 받은 `answers` 다
 * (키는 항목 id 가 아니라 **질문 id**, docs/architecture.md 4절).
 *
 * 점수는 **판단된 문장들의 값의 평균**이다. ⚪ 문장은 분모에도 넣지 않는다.
 * 판단된 문장이 하나도 없으면 이 항목은 ⚪ 다.
 */
export function scoreSentences(perSentence: readonly unknown[], id = 'unverifiable_claim'): ItemResult {
  const def = itemDef(id)
  if (!def || def.unit !== 'sentence') return undetermined(id, 'unknown_item')
  const total = perSentence.length
  if (total === 0) return { ...undetermined(id, 'missing_answer'), sentences: { total, judged: 0 } }

  let sum = 0
  let judged = 0
  let invalid = 0
  for (const s of perSentence) {
    const v = sentenceValue(def, s)
    if (v === 'invalid') invalid++
    else if (v !== 'uncertain') {
      sum += v
      judged++
    }
  }
  if (judged === 0) {
    // 전부 모양이 틀렸으면 우리 쪽 문제, 하나라도 "모름" 이 있었으면 모델이 모르는 것이다.
    const reason = invalid === total ? 'invalid_answer' : 'uncertain'
    return { ...undetermined(id, reason), sentences: { total, judged } }
  }
  // Noul 에는 confidence 가 없다. 대신 **판단된 문장 수**를 확신도로 본다.
  // 문장 하나는 "모름" 밖이라도 기사 전체의 주의 신호로는 근거가 얇다.
  return { id, score: sum / judged, isConfident: judged >= MIN_CONFIDENT_SENTENCES, sentences: { total, judged } }
}

// --- 기사 하나 -----------------------------------------------------------------------

export interface ArticleAnswers {
  /** 이번에 판단하려던 항목 id. **답이 없는 항목도 ⚪ 로 결과에 남기려고** 따로 받는다 */
  items: readonly string[]
  /** 기사 단위 요청들의 `answers` 를 합친 것. 키는 질문 id */
  answers?: unknown
  /** 문장 단위 항목의 문장별 `answers` */
  sentences?: readonly unknown[]
}

/** 기사 하나의 항목별 결과. 같은 id 를 두 번 넣어도 한 번만 센다. */
export function scoreArticle({ items, answers, sentences = [] }: ArticleAnswers): ItemResult[] {
  const byQuestion = isPlainObject(answers) ? answers : {}
  return [...new Set(items)].map((id) => {
    const def = itemDef(id)
    if (!def) return undetermined(id, 'unknown_item')
    if (def.unit === 'sentence') return scoreSentences(sentences, id)
    return scoreItem(id, Object.hasOwn(byQuestion, id) ? byQuestion[id] : undefined)
  })
}

/**
 * 항목별 결과를 배지 단계로 접는다. 판정 순서:
 *
 * 1. 판단된 항목이 `MIN_JUDGED_ITEMS` 보다 적으면 ⚪
 * 2. 판단된 항목의 가중평균을 낸다. ⚪ 항목은 분자에도 분모에도 넣지 않는다
 * 3. 평균이 `CAUTION_AT` 이상이고 **확신도 높은 주의 신호**가 `MIN_CAUTION_ITEMS` 이상이면 🔴
 * 4. 평균이 `SAFE_BELOW` 미만이고, 주의 신호가 **하나도 없고**, 확신도 높은 항목이
 *    `MIN_JUDGED_ITEMS` 이상이면 🟢
 * 5. 그 밖은 🟡
 *
 * 확신도가 중간인 항목은 🟢 도 🔴 도 받치지 못한다 — docs/jev.md 5절의 "중간이면 🟡 쪽으로" 다.
 * 🔴 은 그에 더해 **주의 신호**가 확신도 높은 것이어야 한다. 멀쩡한 기사에 🔴 을 붙이는 쪽이
 * 대가가 크다 (docs/product.md 5절). 그래서 🟢 은 "확신한 항목이 충분한가" 만, 🔴 은 "확신한 주의 신호가
 * 충분한가" 까지 본다.
 */
export function decideBadge(items: readonly ItemResult[]): Verdict {
  let weightSum = 0
  let weighted = 0
  let judged = 0
  let confident = 0
  let cautionSignals = 0
  let anyCaution = false

  for (const it of items) {
    if (it.score === null) continue
    // 가중치가 없는 id 는 우리가 모르는 항목이다. 판단에 넣지 않는다.
    const w = Object.hasOwn(ITEM_WEIGHTS, it.id) ? ITEM_WEIGHTS[it.id as ItemId] : undefined
    if (w === undefined || w <= 0) continue
    judged++
    weightSum += w
    weighted += w * it.score
    if (it.isConfident) confident++
    if (it.score >= ITEM_CAUTION_AT) {
      anyCaution = true
      if (it.isConfident) cautionSignals++
    }
  }

  if (judged < MIN_JUDGED_ITEMS) {
    return { level: 'UNDETERMINED', score: null, cautionSignals, items: [...items], reason: 'not_enough_items' }
  }

  const score = weighted / weightSum
  let level: BadgeLevel = 'CHECK'
  if (score >= CAUTION_AT && cautionSignals >= MIN_CAUTION_ITEMS) level = 'CAUTION'
  else if (score < SAFE_BELOW && !anyCaution && confident >= MIN_JUDGED_ITEMS) level = 'SAFE'
  return { level, score, cautionSignals, items: [...items] }
}

/** `scoreArticle` 과 `decideBadge` 를 한 번에. */
export function judgeArticle(input: ArticleAnswers): Verdict {
  return decideBadge(scoreArticle(input))
}
