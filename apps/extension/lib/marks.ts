// 걸린 항목마다 **본문의 어느 대목인지** 미리 모아 둔다.
//
// ## 왜 미리 하나
//
// 전에는 팝업에서 항목 옆 `V` 를 눌렀을 때 비로소 찾았다. 그러면 두 가지가 생긴다.
//
//   1. **기사에 칠할 수가 없다.** 누르기 전에는 어디를 칠할지 모른다
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
// 기관명·실명처럼 목록으로 담을 수 없는 것만 모델에 넘긴다 (apps/proxy/src/pinpoint.ts).
import content from '../../../packages/content/ui.ko.json'
import { findEvidence } from '@genuearly/shared'
import type { Mark } from './highlight'
import type { ArticleVerdict, DisplayLevel, Message } from './protocol'
import { packPicks, readExplain, unpackPicks, writeExplain } from './cache'

/** 항목 이름과 사유 문구를 꺼내는 곳. 없는 항목은 조용히 건너뛴다. */
type ExplainCopy = Record<string, { reasons?: Record<string, string>; parts?: Record<string, { present: string }> } | undefined>

/** 한 기사에서 칠할 상자 수 상한. 넘으면 본문이 온통 노랑이 되어 짚는 뜻이 사라진다. */
const MAX_MARKS = 24

/**
 * 칠할 항목인가.
 *
 * **걸린 것만** 칠한다. 신호가 없다고 나온 항목을 칠하면 "여기 문제 있다" 로 읽힌다.
 * 확신이 없는 항목(`isConfident === false`)도 빼는데, 보류를 칠하는 것은 ⚪ 를
 * 결과로 내놓는 것과 어긋난다.
 */
function flagged(v: ArticleVerdict): string[] {
  return v.items.filter((i) => i.isConfident && i.score !== null && i.score > 0).map((i) => i.id)
}

/** 항목 이름. 문구가 없으면 id 를 쓰지 않고 비운다 — 화면에 id 가 뜨면 안 된다. */
function itemName(itemId: string): string | undefined {
  return (content.items as Record<string, { name?: string } | undefined>)[itemId]?.name
}

/**
 * 코드가 찾은 것을 상자로 바꾼다. 비용이 없으므로 가장 먼저 한다.
 *
 * **본문만 넘긴다.** 제목은 기사 화면에서 우리가 칠할 자리가 아니다 — 제목 항목
 * (`clickbait_headline`·`headline_body_match`)은 팝업이 맡는다. 제목을 빼면
 * `findEvidence` 가 제목 규칙을 통째로 건너뛰므로(글이 없으면 `continue`),
 * 돌아오는 자리는 전부 본문의 것이다.
 */
export function codeMarks(itemId: string, body: string): Mark[] {
  const item = itemName(itemId)
  if (!item) return []
  const copy = (content.explain as ExplainCopy)[itemId]
  const out: Mark[] = []
  for (const e of findEvidence(itemId, { body })) {
    const reason = copy?.parts?.[e.id]?.present ?? copy?.reasons?.[e.id]
    for (const s of e.spans) out.push({ text: s.text, item, ...(reason ? { reason } : {}) })
  }
  return out
}

/** LLM 이 집어 온 것을 상자로 바꾼다. */
function pickMarks(itemId: string, picks: readonly { text: string; why: string }[]): Mark[] {
  const item = itemName(itemId)
  if (!item) return []
  const copy = (content.explain as ExplainCopy)[itemId]
  return picks.map((p) => {
    const reason = copy?.reasons?.[p.why] ?? copy?.parts?.[p.why]?.present
    return { text: p.text, item, ...(reason ? { reason } : {}) }
  })
}

/** 같은 글자를 두 번 칠하지 않는다. 항목이 겹치면 먼저 온 것을 남긴다. */
function dedupe(marks: readonly Mark[]): Mark[] {
  const seen = new Set<string>()
  const out: Mark[] = []
  for (const m of marks) {
    const key = `${m.item}\u0000${m.text}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(m)
    if (out.length >= MAX_MARKS) break
  }
  return out
}

export interface GatherInput {
  url: string
  body: string
  level: DisplayLevel
  verdict: ArticleVerdict
  /** 상자가 더 모이면 부른다. 코드 몫을 먼저 칠하고 LLM 몫을 덧칠하기 위해서다 */
  onMarks: (marks: Mark[]) => void
  /** 테스트에서 갈아 끼운다 */
  ask?: (msg: Message) => Promise<unknown>
}

/**
 * 걸린 항목의 대목을 모은다.
 *
 * **코드 몫을 먼저 칠하고 돌아온다.** LLM 몫은 뒤에서 하나씩 받아 덧칠한다 —
 * 한꺼번에 던지면 판단 예산을 밀어낸다 (apps/proxy/wrangler.jsonc 의 레이트 리밋
 * 주석: 기사 하나가 이미 최대 42건을 쓴다).
 */
export async function gatherMarks(input: GatherInput): Promise<void> {
  const { url, body, level, verdict, onMarks } = input
  // 🟢·⚪ 에서는 칠하지 않는다. 걸린 것이 없거나 판단하지 못한 것이다.
  if (level !== 'CHECK' && level !== 'CAUTION') return

  const ids = flagged(verdict)
  if (ids.length === 0) return

  const all: Mark[] = []
  /** 코드가 뭔가 찾은 항목. 이 항목은 모델에 묻지 않는다 */
  const covered = new Set<string>()

  for (const id of ids) {
    const found = codeMarks(id, body)
    if (found.length) {
      covered.add(id)
      all.push(...found)
    }
  }
  if (all.length) onMarks(dedupe(all))

  const ask = input.ask ?? ((m: Message) => browser.runtime.sendMessage(m))

  for (const id of ids) {
    if (covered.has(id)) continue
    if (all.length >= MAX_MARKS) break

    const lv = level
    // 받아 둔 답이 있으면 그것을 쓴다. 팝업과 **같은 캐시**다.
    const hit = await readExplain(url, id, lv)
    if (hit) {
      const picks = await unpackPicks(body, hit.p)
      if (picks.length) {
        all.push(...pickMarks(id, picks))
        onMarks(dedupe(all))
      }
      continue
    }

    const msg: Message = {
      kind: 'judge-explain',
      url,
      body,
      itemId: id,
      level: lv,
      // 코드가 빈손이라 여기까지 왔다.
      noEvidence: true,
    }
    const res = await ask(msg).catch((e) => {
      // 못 받아도 칠한 것은 남는다. 빈손이 실패는 아니다.
      console.warn('[GenuEarly] 대목을 받지 못했다', id, e)
      return null
    })
    const out = res as { found?: Record<string, boolean>; picks?: { text: string; why: string }[] } | null
    if (!out) continue

    // **집어 온 글자를 여기서 또 대조한다.** 본문을 들고 있는 것은 우리뿐이다.
    const picks = (out.picks ?? []).filter((p) => body.includes(p.text))
    await writeExplain(url, id, { lv, f: out.found ?? {}, p: await packPicks(body, picks) })
    if (picks.length) {
      all.push(...pickMarks(id, picks))
      onMarks(dedupe(all))
    }
  }
}
