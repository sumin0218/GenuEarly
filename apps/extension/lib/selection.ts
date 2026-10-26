// ③ 선택 텍스트 검사. **기사 페이지가 아닌 곳에서도 쓴다** — 메신저, SNS, 커뮤니티
// (docs/requirements.md 5절).
//
// **호스트 권한이 늘지 않는다.** `contextMenus` 하나만 더 받는다.
// 오른쪽 클릭 메뉴의 `info.selectionText` 는 background 로 바로 온다 — 그 글을 읽으려고
// 임의의 사이트에 콘텐츠 스크립트를 넣지 않는다. 결과도 우리 팝업에 띄우므로
// `activeTab` 도 `scripting` 도 필요 없다 (requirements.md 5-1절).
import { decideBadge, scoreArticle } from '@genuearly/shared'
import schema from '@genuearly/shared/judgment-items.json'
import { splitSentences } from './sentences'
import type { ArticleVerdict, JevAnswer } from './protocol'

/**
 * 선택한 글의 길이 상한(글자).
 *
 * 넘으면 **묻지 않고 거절한다.** 이유는 셋이다.
 * - 문장마다 요청 하나라 긴 글은 그대로 요청 수가 된다. ①이 `MAX_SENTENCES` 로 막는 것과 같은 문제다
 * - 중계 서버가 요청 본문을 65,536바이트에서 자른다 (`MAX_REQUEST_BYTES`).
 *   한글은 UTF-8 에서 3바이트라 4,000자면 본문만 12KB 다
 * - 글이 길수록 "선택한 글" 이 아니라 "페이지 전체" 에 가까워진다. 그건 ①이 할 일이다
 *
 * 4,000자는 신문 기사 한 편(보통 1,500~3,000자)을 넉넉히 덮는 자리다.
 * **측정으로 정한 값이 아니다** (requirements.md 5절 "선택 글 길이의 하한·상한" TODO).
 */
export const MAX_SELECTION_CHARS = 4000

/**
 * 하한은 두지 않는다.
 *
 * requirements.md 5절이 **"입력이 짧아 ⚪가 자주 나오는 것이 정상이다"** 로 정했다.
 * 짧다고 거절하면 사용자는 "왜 안 되지" 를 묻게 되고, 짧아서 판단이 안 됐다는 사실 자체가
 * 알려 줄 만한 결과다. 거절 대신 ⚪ 로 돌려준다.
 */

export type SelectionOutcome =
  | { ok: true; verdict: ArticleVerdict }
  | { ok: false; reason: 'too_long'; chars: number; limit: number }

/** 선택 검사에 쓰는 항목. 원본은 judgment-items.json 의 `request_group.selection` 이다. */
function plan() {
  const groups = new Map<string, string[]>()
  let sentenceItem: string | null = null
  for (const item of schema.items as unknown as { id: string; unit: string; request_group: Record<string, string> }[]) {
    const g = item.request_group.selection
    if (!g) continue
    if (item.unit === 'sentence') { sentenceItem = item.id; continue }
    groups.set(g, [...(groups.get(g) ?? []), item.id])
  }
  return { groups, sentenceItem }
}

/** 문장 단위 요청 수의 상한. ①과 같은 이유로 둔다 (lib/judge.ts 의 `MAX_SENTENCES`). */
const MAX_SENTENCES = 40

/**
 * 고른 글을 판단한다.
 *
 * **캐시하지 않는다.** 캐시 키는 정규화한 URL 인데 선택한 글에는 URL 이 없다.
 * 글 자체를 키로 쓰면 **사용자가 읽은 문장이 해시 형태로 저장소에 남는다** — 그게 바로
 * 캐시에서 피하려던 것이다 (docs/security/secure-coding.md 6절).
 *
 * **`source_citation` 을 묻지 않는다.** 출처는 고른 글 밖에 있기 쉽다
 * (requirements.md 5절, packages/shared/README.md). 그래서 `request_group.selection` 에 없다.
 */
export async function judgeSelection(
  text: string,
  call: (body: { feature: 'selection'; group: string; items: string[]; state: Record<string, string> }) => Promise<unknown>,
): Promise<SelectionOutcome> {
  const trimmed = text.trim()
  if (trimmed.length > MAX_SELECTION_CHARS) {
    return { ok: false, reason: 'too_long', chars: trimmed.length, limit: MAX_SELECTION_CHARS }
  }

  const { groups, sentenceItem } = plan()

  const groupJobs = [...groups.entries()].map(([group, items]) => {
    // **고른 글은 `body` 에 넣는다.** `headline` 은 보내지 않는다 — 제목이 없기 때문이고,
    // 질문의 instructions 가 "headline 이 비어 있으면 body 만 보고 판단한다" 로 적혀 있다.
    // 중계 서버의 필수 필드 검사도 selection 에서는 `body` 하나만 요구한다.
    return call({ feature: 'selection', group, items: [...items], state: { body: trimmed } })
  })

  const sentences = splitSentences(trimmed).slice(0, MAX_SENTENCES)
  const sentenceJobs = sentenceItem
    ? sentences.map((sentence) =>
        call({ feature: 'selection', group: 'sentence', items: [sentenceItem], state: { sentence } }))
    : []

  const [groupOut, sentenceOut] = await Promise.all([
    Promise.all(groupJobs),
    Promise.all(sentenceJobs),
  ])

  const answers: Record<string, JevAnswer> = {}
  for (const r of groupOut) {
    const ok = r as { answers?: Record<string, JevAnswer>; undetermined?: true } | null
    if (!ok || ok.undetermined || !ok.answers) continue
    Object.assign(answers, ok.answers)
  }
  const perSentence: Record<string, JevAnswer>[] = []
  for (const r of sentenceOut) {
    const ok = r as { answers?: Record<string, JevAnswer>; undetermined?: true } | null
    if (!ok || ok.undetermined || !ok.answers) continue
    perSentence.push(ok.answers)
  }

  const items = [...[...groups.values()].flat(), ...(sentenceItem ? [sentenceItem] : [])]
  const results = scoreArticle({ items, answers, sentences: perSentence })
  return { ok: true, verdict: decideBadge(results) }
}

// ── 팝업으로 건네주기 ────────────────────────────────────────────────────────
//
// **`storage.session` 을 쓴다.** 디스크에 쓰이지 않고 브라우저를 닫으면 사라진다.
// `storage.local` 이면 "이 사람이 무엇을 검사해 봤는가" 가 디스크에 남는다
// (docs/security/secure-coding.md 6절). 담는 것도 **판정뿐이고 고른 글은 넣지 않는다.**
const KEY = 'selection-result'

export async function putSelectionResult(r: SelectionOutcome): Promise<void> {
  await browser.storage.session.set({ [KEY]: r })
}

/**
 * 읽고 **지운다.**
 *
 * 남겨 두면 다음에 기사에서 아이콘을 눌렀을 때 **지난번 선택 결과가 기사 배지를 가린다.**
 * ③ 의 결과는 "방금 검사한 것" 이라 한 번 보여 주면 역할이 끝난다.
 */
export async function takeSelectionResult(): Promise<SelectionOutcome | null> {
  const got = (await browser.storage.session.get(KEY)) as Record<string, SelectionOutcome | undefined>
  const r = got[KEY]
  if (r) await browser.storage.session.remove(KEY)
  return r ?? null
}
