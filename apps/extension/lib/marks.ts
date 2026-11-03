// 걸린 항목마다 **글의 어느 대목인지** 모은다.
//
// ## 물어보지 않는다. 이미 받아 둔 답을 쓴다
//
// 배지를 만들 때 Jev 에게 **문장마다** 두 가지를 물었다 (judgment-items.json 의
// `unverifiable_claim`).
//
//   1. 이 문장이 일·수치·인과를 **확정된 사실로** 서술하는가 (`factual_assertion`)
//   2. 그 문장 **안에** 근거가 적혀 있는가 (`named_basis`)
//
// 즉 **어느 문장이 걸렸는지 Jev 가 이미 문장 단위로 알려줬다.** 전에는 그것을 평균 내어
// 항목 하나로 뭉갠 다음, 칠할 자리를 찾으려고 `gpt-5.6-luna` 에게 "어느 문장이냐" 를
// 다시 물었다. 두 가지가 잘못이었다.
//
//   - **같은 것을 두 번 묻는다.** 호출도, 기다림도 두 배다
//   - **두 답이 어긋날 수 있다.** Jev 가 0점 준 문장을 gpt 가 집어 오면 배지의 근거와
//     화면의 형광펜이 서로 다른 말을 한다
//
// 그래서 **여기서는 모델을 부르지 않는다.** 판정과 함께 온 문장 점수를 그대로 쓴다
// (eval/results/2026-11-03-badge-with-search.md).
//
// ## 코드가 찾는 몫은 그대로 둔다
//
// 정해진 표현(`꼭 공유하세요`, `충격`…)은 글자 찾기라 모델이 필요 없다. 그쪽은
// `findEvidence` 가 맡는다.
import content from '../../../packages/content/ui.ko.json'
import { findEvidence, isCautionScore } from '@genuearly/shared'
import type { Mark, MarkLevel, Why } from './highlight'
import type { ArticleVerdict, DisplayLevel } from './protocol'
import { squeeze } from './spans'

/** 항목 이름과 사유 문구를 꺼내는 곳. 없는 항목은 조용히 건너뛴다. */
type ExplainCopy = Record<
  string,
  { reasons?: Record<string, string>; parts?: Record<string, { present: string }> } | undefined
>

/** 한 기사에서 칠할 대목 수 상한. 넘으면 글이 온통 칠해져 짚는 뜻이 사라진다. */
const MAX_MARKS = 24

/** 칠할 글이 어디에 있나. */
export type Where = 'headline' | 'body'

/** 제목을 보는 항목. 이 항목의 대목은 제목 요소에 칠한다. */
const HEADLINE_ITEMS = new Set(['clickbait_headline', 'headline_body_match'])

export const whereOf = (itemId: string): Where => (HEADLINE_ITEMS.has(itemId) ? 'headline' : 'body')

/** 문장 단위 항목. 이 항목만 Jev 가 문장마다 답을 준다. */
const SENTENCE_ITEM = 'unverifiable_claim'
/** 문장 점수를 같이 쓰는 기사 단위 항목. 둘 다 "근거가 그 문장에 있나" 를 본다. */
const SOURCE_ITEM = 'source_citation'

/**
 * 누구인지 밝히지 않은 출처 표현.
 *
 * Jev 는 `named_basis` 를 **예/아니오로만** 답한다 — "집단으로만 가리켰다" 와
 * "아예 없다" 를 가르지 않는다. 화면 문구는 그 둘이 다르므로 여기서 가른다.
 * **글자 찾기지 판단이 아니다** (docs/jev.md 3절, evidence.ts 와 같은 성격).
 */
const GROUP_ONLY = /관계자|전문가|업계에서는|소식통|당국자|한 교수|일각에서는/

/** 항목 이름. 문구가 없으면 비운다 — 화면에 id 가 뜨면 안 된다. */
function itemName(itemId: string): string | undefined {
  return (content.items as Record<string, { name?: string } | undefined>)[itemId]?.name
}

function reasonText(itemId: string, id: string): string | undefined {
  const copy = (content.explain as ExplainCopy)[itemId]
  return copy?.reasons?.[id] ?? copy?.parts?.[id]?.present
}

/** 빨강이 먼저. 같은 단계면 들어온 순서 그대로다. */
const 센것먼저 = (a: Why, b: Why): number =>
  a.level === b.level ? 0 : a.level === 'CAUTION' ? -1 : 1

interface Raw { text: string; why: Why; where: Where }

/**
 * 같은 글자에 붙은 사유를 하나로 묶는다.
 *
 * 한 문장이 여러 항목에 걸리는 일이 흔하다 — 근거 없이 단정한 문장은
 * `unverifiable_claim` 과 `source_citation` 에 함께 걸린다. 상자를 두 겹으로 칠하면
 * 색이 짙어지고 어느 쪽을 가리키는지 알 수 없다.
 *
 * **단계는 가장 센 것을 쓴다.** 빨강과 노랑이 함께 나오면 빨강이다.
 */
function merge(raw: readonly Raw[]): Mark[] {
  const by = new Map<string, Mark>()
  const order: string[] = []
  for (const r of raw) {
    const key = `${r.where}\u0000${squeeze(r.text)}`
    const got = by.get(key)
    if (!got) {
      by.set(key, { text: r.text, level: r.why.level, whys: [r.why], where: r.where })
      order.push(key)
      continue
    }
    if (got.whys.some((w) => w.item === r.why.item && w.reason === r.why.reason)) continue
    got.whys.push(r.why)
    if (r.why.level === 'CAUTION') got.level = 'CAUTION'
  }
  const out: Mark[] = []
  for (const key of order) {
    const m = by.get(key)
    if (!m) continue
    m.whys.sort(센것먼저)
    out.push(m)
    if (out.length >= MAX_MARKS) break
  }
  return out
}

/** 걸린 항목. 확신했고 점수가 0 보다 큰 것만. */
function flagged(v: ArticleVerdict): Map<string, MarkLevel> {
  const out = new Map<string, MarkLevel>()
  for (const i of v.items) {
    if (!i.isConfident || i.score === null || i.score <= 0) continue
    out.set(i.id, isCautionScore(i.score, i.isConfident) ? 'CAUTION' : 'CHECK')
  }
  return out
}

/** 코드가 찾은 것. 비용이 없다 — 글자 찾기다. */
export function codeMarks(
  itemId: string,
  level: MarkLevel,
  input: { headline?: string; body?: string },
): Raw[] {
  const item = itemName(itemId)
  if (!item) return []
  const where = whereOf(itemId)
  // 제목 항목은 제목만, 본문 항목은 본문만 넘긴다. 글이 없으면 `findEvidence` 가
  // 그 규칙을 건너뛰므로 돌아오는 자리는 전부 우리가 칠할 쪽의 것이다.
  const only = where === 'headline' ? { headline: input.headline } : { body: input.body }
  const out: Raw[] = []
  for (const e of findEvidence(itemId, only)) {
    const reason = reasonText(itemId, e.id)
    for (const s of e.spans) {
      out.push({ text: s.text, where, why: { item, level, ...(reason ? { reason } : {}) } })
    }
  }
  return out
}

/**
 * **Jev 가 문장마다 낸 답을 그대로 대목으로 바꾼다.** 모델을 부르지 않는다.
 *
 * 점수가 0 보다 큰 문장은 "확정해서 말하는데 그 문장 안에 근거가 없다" 는 뜻이다.
 * 그 문장이 곧 칠할 자리다.
 */
export function sentenceMarks(
  sentences: readonly string[],
  verdict: ArticleVerdict,
  flags: Map<string, MarkLevel>,
): Raw[] {
  const scores = verdict.sentenceScores
  if (!scores) return []

  const uvcName = itemName(SENTENCE_ITEM)
  const srcName = itemName(SOURCE_ITEM)
  const uvcFlagged = flags.has(SENTENCE_ITEM)
  const srcFlagged = flags.has(SOURCE_ITEM)
  if (!uvcFlagged && !srcFlagged) return []

  const basis = verdict.sentenceBasis
  const out: Raw[] = []
  for (const [i, text] of sentences.entries()) {
    const score = scores[i]
    if (score === null || score === undefined || score <= 0) continue
    // **문장마다 제 단계다.** 항목 평균이 아니다.
    const level: MarkLevel = isCautionScore(score) ? 'CAUTION' : 'CHECK'
    // 누구인지 밝히지 않은 출처가 있나. 화면 문구가 그 둘을 가른다.
    const group = GROUP_ONLY.test(text)

    if (uvcFlagged && uvcName) {
      const reason = reasonText(SENTENCE_ITEM, group ? 'uvc_group_only' : 'uvc_no_basis')
      out.push({ text, where: 'body', why: { item: uvcName, level, ...(reason ? { reason } : {}) } })
    }
    // 출처 항목은 기사 단위 판정이지만, **그 문장에 근거가 없다는 것은 Jev 가 문장마다
    // 답한 것**이다. 그 답이 있을 때만 붙인다.
    if (srcFlagged && srcName) {
      const b = basis?.[i]
      if (b === null || b === undefined || b >= 0.5) continue
      const reason = reasonText(SOURCE_ITEM, group ? 'src_group_only' : 'src_none')
      out.push({
        text,
        where: 'body',
        why: { item: srcName, level: flags.get(SOURCE_ITEM) ?? level, ...(reason ? { reason } : {}) },
      })
    }
  }
  return out
}

/** 이 항목은 Jev 의 문장 답만으로 설명할 수 있나. 그렇다면 모델을 부르지 않는다. */
export const hasSentenceAnswer = (itemId: string): boolean =>
  itemId === SENTENCE_ITEM || itemId === SOURCE_ITEM

/**
 * 팝업이 쓰는 모양(`{ text, why }`)으로 돌려준다. `why` 는 `explain.*.reasons` 의 id 다.
 *
 * **형광펜과 같은 곳에서 나온다.** 팝업이 따로 모델에 물으면 화면 두 곳이 다른 문장을
 * 가리키게 된다.
 */
export function sentencePicks(
  sentences: readonly string[],
  verdict: ArticleVerdict,
  itemId: string,
): { text: string; why: string }[] {
  const scores = verdict.sentenceScores
  if (!scores || !hasSentenceAnswer(itemId)) return []
  const basis = verdict.sentenceBasis
  const out: { text: string; why: string }[] = []
  for (const [i, text] of sentences.entries()) {
    const score = scores[i]
    if (score === null || score === undefined || score <= 0) continue
    const group = GROUP_ONLY.test(text)
    if (itemId === SENTENCE_ITEM) {
      out.push({ text, why: group ? 'uvc_group_only' : 'uvc_no_basis' })
      continue
    }
    const b = basis?.[i]
    if (b === null || b === undefined || b >= 0.5) continue
    out.push({ text, why: group ? 'src_group_only' : 'src_none' })
  }
  return out
}

export interface GatherInput {
  body: string
  headline: string
  /** 보낸 문장. `sentenceScores` 와 같은 순서다 */
  sentences: readonly string[]
  level: DisplayLevel
  verdict: ArticleVerdict
}

/**
 * 걸린 항목의 대목을 모은다. **모델을 부르지 않으므로 기다림이 없다.**
 *
 * 전에는 비동기였다 — gpt 를 불러 가며 덧칠했기 때문이다. 이제는 판정이 손에 들어온
 * 순간 다 알 수 있다.
 */
export function gatherMarks(input: GatherInput): Mark[] {
  const { body, headline, sentences, level, verdict } = input
  // 🟢·⚪ 에서는 칠하지 않는다. 걸린 것이 없거나 판단하지 못한 것이다.
  if (level !== 'CHECK' && level !== 'CAUTION') return []

  const flags = flagged(verdict)
  if (flags.size === 0) return []

  const raw: Raw[] = []
  for (const [id, lv] of flags) raw.push(...codeMarks(id, lv, { headline, body }))
  raw.push(...sentenceMarks(sentences, verdict, flags))
  return merge(raw)
}
