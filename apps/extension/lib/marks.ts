// 걸린 항목마다 **글의 어느 대목인지** 미리 모아 둔다.
//
// ## 왜 미리 하나
//
// 전에는 팝업에서 항목 옆 `V` 를 눌렀을 때 비로소 찾았다. 그러면 두 가지가 생긴다.
//
//   1. **글에 칠할 수가 없다.** 누르기 전에는 어디를 칠할지 모른다
//   2. 누른 뒤 LLM 을 기다린다. 펼쳤는데 한동안 빈 칸이다
//
// 그래서 판정이 나오면 바로 모은다. 모은 것은 `writeExplain` 으로 캐시에 들어가므로
// **팝업이 펼쳐질 때는 읽기만 한다** (lib/cache.ts — 캐시가 곧 재현성이다).
//
// ## 두 갈래로 모은다
//
// | | 누가 | 비용 |
// | --- | --- | --- |
// | 정해진 표현 | 코드 (`findEvidence`) | 없다. 글자 찾기다 |
// | 목록에 담을 수 없는 것 | `gpt-5.6-luna` | 호출 하나. 코드가 빈손일 때만 |
//
// ## 단계는 Jev 가 낸 것을 그대로 쓴다
//
// 우리가 다시 정하지 않는다. 문장 단위 항목은 **그 문장의 점수**를, 나머지는
// **그 항목의 점수**를 보고 `isCautionScore` 로 가른다 — 배지가 주의 신호를 세는
// 기준과 같은 함수다. 기준이 둘이 되면 배지는 🟡 인데 본문은 빨갛게 칠해진다.
import content from '../../../packages/content/ui.ko.json'
import { findEvidence, isCautionScore } from '@genuearly/shared'
import type { Mark, MarkLevel, Why } from './highlight'
import type { ArticleVerdict, DisplayLevel, Message } from './protocol'
import { packPicks, readExplain, unpackPicks, writeExplain } from './cache'
import { squeeze } from './spans'

/** 항목 이름과 사유 문구를 꺼내는 곳. 없는 항목은 조용히 건너뛴다. */
type ExplainCopy = Record<
  string,
  { reasons?: Record<string, string>; parts?: Record<string, { present: string }> } | undefined
>

/** 한 기사에서 칠할 대목 수 상한. 넘으면 글이 온통 칠해져 짚는 뜻이 사라진다. */
const MAX_MARKS = 24

/** 칠할 글이 어디에 있나. 제목 항목은 제목 요소에, 나머지는 본문에 칠한다. */
export type Where = 'headline' | 'body'

/** 제목을 보는 항목. 이 항목의 대목은 제목 요소에 칠한다. */
const HEADLINE_ITEMS = new Set(['clickbait_headline', 'headline_body_match'])

export const whereOf = (itemId: string): Where => (HEADLINE_ITEMS.has(itemId) ? 'headline' : 'body')

/** 문장 단위 항목. 이 항목만 문장마다 단계가 갈린다 (judgment-items.json 의 `unit`). */
const SENTENCE_ITEM = 'unverifiable_claim'

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

/**
 * 같은 글자에 붙은 사유를 하나로 묶는다.
 *
 * 한 문장이 여러 항목에 걸리는 일이 흔하다 — "체육계의 한 관계자는…" 은
 * `unverifiable_claim` 과 `source_citation` 에 함께 걸린다. 상자를 두 겹으로
 * 칠하면 색이 짙어지고 어느 쪽을 가리키는지 알 수 없다.
 *
 * **단계는 가장 센 것을 쓴다.** 빨강과 노랑이 함께 나오면 빨강이다.
 */
function merge(raw: readonly { text: string; why: Why; where: Where }[]): Mark[] {
  const by = new Map<string, Mark & { where: Where }>()
  const order: string[] = []
  for (const r of raw) {
    const key = `${r.where}\u0000${squeeze(r.text)}`
    const got = by.get(key)
    if (!got) {
      by.set(key, { text: r.text, level: r.why.level, whys: [r.why], where: r.where })
      order.push(key)
      continue
    }
    // 같은 항목이 같은 글자에 두 번 오면 한 번만 적는다.
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
function flagged(v: ArticleVerdict): { id: string; level: MarkLevel }[] {
  return v.items
    .filter((i) => i.isConfident && i.score !== null && i.score > 0)
    .map((i) => ({
      id: i.id,
      level: isCautionScore(i.score, i.isConfident) ? ('CAUTION' as const) : ('CHECK' as const),
    }))
}

/**
 * 문장마다의 단계. 공백을 지운 글자로 찾는다.
 *
 * **없으면 빈 지도다.** 캐시에서 읽은 판정에는 문장 점수가 없어서
 * (lib/protocol.ts 의 `sentenceScores`) 그때는 항목 단계로 칠한다.
 */
export function sentenceLevels(
  sentences: readonly string[],
  scores: readonly (number | null)[] | undefined,
): Map<string, MarkLevel> {
  const out = new Map<string, MarkLevel>()
  if (!scores) return out
  for (const [i, s] of sentences.entries()) {
    const score = scores[i]
    if (score === null || score === undefined || score <= 0) continue
    out.set(squeeze(s), isCautionScore(score) ? 'CAUTION' : 'CHECK')
  }
  return out
}

/**
 * 이 글자의 단계. **문장 단위 항목은 그 문장의 단계를 쓴다.**
 *
 * 집어 온 글자가 문장과 글자까지 같지 않을 수 있어(앞뒤가 조금 잘린다) 품는 쪽도 본다.
 */
function levelFor(
  itemId: string,
  text: string,
  itemLevel: MarkLevel,
  perSentence: Map<string, MarkLevel>,
): MarkLevel {
  if (itemId !== SENTENCE_ITEM || perSentence.size === 0) return itemLevel
  const want = squeeze(text)
  const hit = perSentence.get(want)
  if (hit) return hit
  for (const [s, lv] of perSentence) {
    if (s.includes(want) || want.includes(s)) return lv
  }
  return itemLevel
}

interface Raw { text: string; why: Why; where: Where }

/** 코드가 찾은 것. 비용이 없으므로 가장 먼저 한다. */
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

export interface GatherInput {
  url: string
  body: string
  headline: string
  /** 보낸 문장. `sentenceScores` 와 같은 순서다 */
  sentences: readonly string[]
  level: DisplayLevel
  verdict: ArticleVerdict
  /** 대목이 더 모이면 부른다. 코드 몫을 먼저 칠하고 LLM 몫을 덧칠하기 위해서다 */
  onMarks: (marks: Mark[]) => void
  /** 테스트에서 갈아 끼운다 */
  ask?: (msg: Message) => Promise<unknown>
}

/**
 * 걸린 항목의 대목을 모은다.
 *
 * **코드 몫을 먼저 내놓는다.** LLM 몫은 뒤에서 하나씩 받아 덧칠한다 — 한꺼번에
 * 던지면 판단 예산을 밀어낸다 (apps/proxy/wrangler.jsonc 의 레이트 리밋 주석:
 * 기사 하나가 이미 최대 42건을 쓴다).
 */
export async function gatherMarks(input: GatherInput): Promise<void> {
  const { url, body, headline, sentences, level, verdict, onMarks } = input
  // 🟢·⚪ 에서는 칠하지 않는다. 걸린 것이 없거나 판단하지 못한 것이다.
  if (level !== 'CHECK' && level !== 'CAUTION') return

  const items = flagged(verdict)
  if (items.length === 0) return

  const perSentence = sentenceLevels(sentences, verdict.sentenceScores)
  const raw: Raw[] = []
  /** 코드가 뭔가 찾은 항목. 이 항목은 모델에 묻지 않는다 */
  const covered = new Set<string>()

  for (const { id, level: lv } of items) {
    const found = codeMarks(id, lv, { headline, body })
    if (found.length) {
      covered.add(id)
      raw.push(...found)
    }
  }
  if (raw.length) onMarks(merge(raw))

  const ask = input.ask ?? ((m: Message) => browser.runtime.sendMessage(m))

  for (const { id, level: itemLevel } of items) {
    if (covered.has(id)) continue
    if (raw.length >= MAX_MARKS) break
    const item = itemName(id)
    if (!item) continue

    const add = (picks: readonly { text: string; why: string }[]): void => {
      for (const p of picks) {
        const reason = reasonText(id, p.why)
        raw.push({
          text: p.text,
          where: whereOf(id),
          why: {
            item,
            level: levelFor(id, p.text, itemLevel, perSentence),
            ...(reason ? { reason } : {}),
          },
        })
      }
      if (picks.length) onMarks(merge(raw))
    }

    // 받아 둔 답이 있으면 그것을 쓴다. 팝업과 **같은 캐시**다.
    const hit = await readExplain(url, id, level)
    if (hit) {
      add(await unpackPicks(body, hit.p))
      continue
    }

    const msg: Message = {
      kind: 'judge-explain',
      url,
      body,
      itemId: id,
      level,
      // 코드가 빈손이라 여기까지 왔다.
      noEvidence: true,
    }
    const res = await ask(msg).catch((e) => {
      // 못 받아도 칠한 것은 남는다. 빈손이 실패는 아니다.
      console.warn('[GenuEarly] 대목을 받지 못했다', id, e)
      return null
    })
    const out = res as
      | { found?: Record<string, boolean>; picks?: { text: string; why: string }[] }
      | null
    if (!out) continue

    // **집어 온 글자를 여기서 또 대조한다.** 본문을 들고 있는 것은 우리뿐이다.
    const picks = (out.picks ?? []).filter((p) => body.includes(p.text))
    await writeExplain(url, id, { lv: level, f: out.found ?? {}, p: await packPicks(body, picks) })
    add(picks)
  }
}
