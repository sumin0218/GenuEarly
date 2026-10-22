// Jev 의 답을 배지 단계로 바꾼다.
//
// ⚠️ **여기 숫자는 전부 잠정값이다 (GE-15·GE-17).** 평가 세트(GE-13)가 없어서
// 측정으로 정한 것이 아니다. 근거가 있는 것은 `NOISE` 하나뿐이다.
// 값을 바꾸는 PR 은 eval 전후 수치를 적는다 (packages/shared/README.md).
import schema from '../../../packages/shared/judgment-items.json'
import type { ArticleVerdict, BadgeLevel, JevAnswer } from './protocol'

/**
 * 모델 자체의 흔들림. **이것만 측정값이다.**
 * 같은 입력 3회, 396자리에서 평균 0.018 · 95% 0.06 · 최대 0.15
 * (eval/experiments/sentence-batching).
 */
const NOISE = 0.02

/** 이 구간 안이면 "모르겠다" 로 본다. 노이즈보다 넉넉히 넓게 잡았다. */
const UNDETERMINED_BAND: [number, number] = [0.4, 0.6]

/** Choice·Score 의 confidence 가 이 아래면 그 항목은 ⚪. TODO(GE-17): 측정으로 정한다 */
const MIN_CONFIDENCE = 0.5

/** 항목 점수의 가중 평균이 이 위면 🔴, 아래 경계보다 낮으면 🟢. TODO(GE-17) */
const CAUTION_AT = 0.6
const SAFE_BELOW = 0.3

/** 판단된 항목이 이보다 적으면 기사 전체를 ⚪ 로 둔다. */
const MIN_JUDGED_ITEMS = 2

interface Item {
  id: string
  type: string
  signals?: Record<string, string>
  question?: { criteria: unknown }
}
const ITEMS = new Map((schema.items as unknown as Item[]).map((i) => [i.id, i]))

/** 항목 하나를 0(안심) ~ 1(주의) 로. 판단할 수 없으면 null. */
function itemScore(id: string, a: JevAnswer | undefined): number | null {
  if (!a) return null
  const item = ITEMS.get(id)
  if (!item) return null

  if (a.type === 'choice') {
    if (a.confidence < MIN_CONFIDENCE) return null
    const signal = item.signals?.[a.choice]
    if (signal === 'caution') return 1
    if (signal === 'neutral') return 0.5
    if (signal === 'clear') return 0
    return null   // 우리가 아는 보기 밖
  }
  if (a.type === 'score') {
    if (a.confidence < MIN_CONFIDENCE) return null
    const grades = Array.isArray(item.question?.criteria) ? item.question.criteria.length : 0
    if (grades < 2) return null
    // **Score 는 0~1 이 아니라 0~(등급 수 − 1) 이다** (2026-10-21 실측).
    return Math.min(1, Math.max(0, a.score / (grades - 1)))
  }
  return null
}

/**
 * 문장 단위 항목. 문장마다 `P(단정) × (1 − P(근거 있음))` 을 구해
 * **"확인할 수 없는 주장" 으로 보이는 문장의 비율**을 점수로 쓴다.
 */
function sentenceScore(perSentence: Record<string, JevAnswer>[]): number | null {
  let judged = 0
  let flagged = 0
  for (const s of perSentence) {
    const fa = s.factual_assertion
    const nb = s.named_basis
    if (fa?.type !== 'noul' || nb?.type !== 'noul') continue
    const [lo, hi] = UNDETERMINED_BAND
    // 결과를 정하는 답이 먼저다 (packages/shared/README.md 의 판정 순서).
    if (fa.noul < lo) { judged++; continue }              // 단정이 아니다 → 0
    if (nb.noul > hi) { judged++; continue }              // 근거가 있다 → 0
    if (fa.noul <= hi || nb.noul >= lo) continue          // 둘 중 하나가 "모름" → 이 문장은 ⚪
    judged++
    if (fa.noul * (1 - nb.noul) > 0.5) flagged++
  }
  if (judged === 0) return null
  return flagged / judged
}

const label = (v: number): BadgeLevel =>
  v >= CAUTION_AT ? 'CAUTION' : v < SAFE_BELOW ? 'SAFE' : 'CHECK'

export function scoreArticle(
  answers: Record<string, JevAnswer>,
  perSentence: Record<string, JevAnswer>[],
): ArticleVerdict {
  const items: ArticleVerdict['items'] = []
  const scores: number[] = []

  for (const id of Object.keys(answers)) {
    if (id === 'factual_assertion' || id === 'named_basis') continue
    const v = itemScore(id, answers[id])
    if (v === null) {
      items.push({ id, level: 'UNDETERMINED', note: '확신도가 낮거나 아는 보기 밖' })
      continue
    }
    scores.push(v)
    items.push({ id, level: label(v), note: v.toFixed(2) })
  }

  const s = sentenceScore(perSentence)
  if (s === null) {
    items.push({ id: 'unverifiable_claim', level: 'UNDETERMINED', note: '판단된 문장 없음' })
  } else {
    scores.push(s)
    items.push({ id: 'unverifiable_claim', level: label(s), note: s.toFixed(2) })
  }

  if (scores.length < MIN_JUDGED_ITEMS) {
    return { level: 'UNDETERMINED', items, reason: 'not_enough_items' }
  }
  const total = scores.reduce((a, b) => a + b, 0) / scores.length
  return { level: label(total), items }
}

/** 임계값이 모델 노이즈보다 넉넉한지. 좁으면 같은 기사가 새로고침마다 바뀐다. */
export const bandIsWiderThanNoise = UNDETERMINED_BAND[1] - UNDETERMINED_BAND[0] > NOISE * 4
