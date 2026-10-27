// 기사 하나를 판단하는 흐름. **background 에서 돈다.**
//
// **중계 호출을 background 에서 하는 이유**: 콘텐츠 스크립트의 fetch 는 기사 페이지의 origin
// (https://n.news.naver.com)으로 나간다. 우리 중계 서버는 chrome-extension:// 만 받으므로
// 거절당한다. background 의 fetch 는 확장 origin 으로 나간다.
//
// 엔트리포인트(entrypoints/background.ts)가 아니라 여기 둔 이유는 **테스트에서 부르기 위해서다.**
// 엔트리포인트는 WXT 의 defineBackground 로 감싸여 있어 그대로는 불러올 수 없다.
// **점수 규칙은 여기 없다.** `@genuearly/shared` 하나가 원본이고 중계 서버와 함께 쓴다 (GE-15).
// 두 벌을 두면 조용히 갈라진다.
import { decideBadge, hasCodeEvidence, resolveBand, scoreArticle, type ItemResult } from '@genuearly/shared'
import schema from '@genuearly/shared/judgment-items.json'
import {
  headlineFingerprint,
  isReusable,
  readScores,
  sweepExpired,
  writeScores,
  type CachedItem,
  type ItemScores,
} from './cache'
import { GLYPH, LEVEL_INK } from './item-view'
import {
  PROXY_URL,
  type ArticleVerdict,
  type DisplayLevel,
  type JevAnswer,
  type JudgeRequest,
  type JudgeResponse,
  type HeadlineVerdict,
  type Message,
  isUndetermined,
  type ExplainLevel,
  type ExplainPick,
  type ExplainResult,
} from './protocol'

/**
 * 기사 하나에서 문장 판단에 쓸 최대 문장 수.
 *
 * 문장마다 요청 하나라 상한이 없으면 긴 기사가 서버 전체 한도를 넘긴다 —
 * 실제로 **133문장짜리 기사(요청 135건)** 를 봤고, 그 1분 동안 **다른 모든 사용자의 요청까지** 막힌다.
 * 중계 서버의 IP 당 한도가 분당 60 이라 `2 + 40 = 42` 가 그 안에 든다.
 *
 * GE-11 에서 "정확도를 지키려고 문장 수를 줄이지 않는다" 고 정했지만 **그때 본 표본은 9~39문장**이었다.
 * 100문장이 넘는 기사는 그 결정이 다루지 않은 영역이다 (docs/requirements.md 8-1절).
 */
const MAX_SENTENCES = 40

/**
 * **모델이 내린 판단만 캐시한다.**
 *
 * `scoreArticle` 은 답이 안 온 항목도 ⚪ 로 돌려준다 — 중계가 끊겼을 때와 모델이 "모르겠다" 고
 * 했을 때가 같은 모양이 된다. 앞의 것을 6시간 들고 있으면 **서버가 돌아온 뒤에도 계속 ⚪ 로 보인다.**
 * `low_confidence`·`uncertain` 은 모델이 답을 주고 확신이 낮았던 경우라 캐시한다.
 *
 * ①과 ②가 같은 캐시에 쓰므로 **규칙도 하나여야 한다** (requirements.md 3-6절).
 */
const JUDGED: readonly (string | undefined)[] = [undefined, 'low_confidence', 'uncertain']

/** 그 기능에서 **항목 하나를 어느 그룹으로 보내는가.** 캐시를 다시 쓸 수 있는지 가릴 때 쓴다. */
function groupOf(feature: string): Map<string, string> {
  const m = new Map<string, string>()
  for (const item of schema.items as unknown as { id: string; request_group: Record<string, string> }[]) {
    const g = item.request_group[feature]
    if (g) m.set(item.id, g)
  }
  return m
}

/** 그 그룹이 제목을 보는가. 보면 캐시를 다시 쓸 때 제목까지 같아야 한다. */
function usesHeadline(group: string): boolean {
  const def = (schema.request_groups as Record<string, { state_fields: string[] } | undefined>)[group]
  return (def?.state_fields ?? []).includes('headline')
}

/**
 * 캐시에서 **지금 그대로 쓸 수 있는 것만** 추린다.
 *
 * 같은 항목 id 라도 **무엇을 보고 낸 판단인지**가 다르면 쓸 수 없다 (리뷰 #22).
 * 추리지 않고 통째로 넘기면 `decideBadge` 가 먼저 온 값을 쓰기 때문에
 * **제목만 보고 낸 값이 본문까지 본 값을 이긴다.**
 */
function reusable(cached: ItemScores, ids: readonly string[], gmap: Map<string, string>, fp?: string): ItemScores {
  const out: ItemScores = {}
  for (const id of ids) {
    const g = gmap.get(id)
    if (!g) continue
    const c = cached[id]
    if (isReusable(c, g, usesHeadline(g) ? fp : undefined)) out[id] = c as CachedItem
  }
  return out
}

/** 캐시에 넣을 모양으로. **무엇을 보고 낸 판단인지 함께 적는다.** */
function stamp(r: ItemResult, group: string, fp?: string): CachedItem {
  return {
    score: r.score,
    isConfident: r.isConfident,
    reason: r.reason,
    g: group,
    ...(usesHeadline(group) && fp !== undefined ? { h: fp } : {}),
  }
}

/** 기능별로 어느 항목이 어느 요청 그룹에 들어가는지. 원본은 judgment-items.json 이다. */
function plan(feature: string) {
  const groups = new Map<string, string[]>()
  let sentenceItem: string | null = null
  for (const item of schema.items as unknown as { id: string; unit: string; request_group: Record<string, string> }[]) {
    const g = item.request_group[feature]
    if (!g) continue
    if (item.unit === 'sentence') { sentenceItem = item.id; continue }
    groups.set(g, [...(groups.get(g) ?? []), item.id])
  }
  return { groups, sentenceItem }
}

export async function callProxy(body: JudgeRequest): Promise<JudgeResponse | null> {
  try {
    const res = await fetch(`${PROXY_URL}/v1/judge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.status === 429) {
      // 우리 차단기다. 물러서라는 뜻이라 재시도하지 않는다 (docs/architecture.md 4절).
      console.warn('[GenuEarly] 차단기에 걸렸다', res.headers.get('Retry-After'))
      return null
    }
    if (!res.ok) {
      console.warn('[GenuEarly] 중계 거절', res.status)
      return null
    }
    return (await res.json()) as JudgeResponse
  } catch (e) {
    console.warn('[GenuEarly] 중계에 닿지 못했다', e)
    return null
  }
}

/** 아이콘 배지. 권한이 필요 없다 — action 키만 선언한다 (requirements.md 2-1절). */
export function setIconBadge(tabId: number | undefined, level: DisplayLevel) {
  if (tabId === undefined) return
  // 탭마다 따로 둔다. 다른 탭의 기사 상태가 섞이면 안 된다.
  void browser.action.setBadgeText({ tabId, text: GLYPH[level] })
  void browser.action.setBadgeBackgroundColor({ tabId, color: LEVEL_INK[level] })
}

export async function judgeArticle(msg: Extract<Message, { kind: 'judge-article' }>, tabId?: number): Promise<ArticleVerdict> {
  const { groups, sentenceItem } = plan('page')

  // --- 캐시 -----------------------------------------------------------------
  // **항목 단위다.** ② 포털 목록은 제목 항목만 채우므로, 기사 단위로 "있다/없다" 를
  // 보면 제목만 본 결과가 기사 배지로 나간다 (requirements.md 3-6절).
  const stored = await readScores(msg.url)
  const needed = [...[...groups.values()].flat(), ...(sentenceItem ? [sentenceItem] : [])]
  const gmap = groupOf('page')
  const fp = await headlineFingerprint(msg.headline)
  // **②가 제목만 보고 낸 값을 본문까지 본 것으로 쓰지 않는다** (리뷰 #22).
  const cached = reusable(stored, needed, gmap, fp)
  const missing = new Set(needed.filter((id) => !(id in cached)))

  if (missing.size === 0) {
    // 다 있다. **PENDING 을 거치지 않고 바로 보여 준다.**
    const verdict = decideBadge(toResults(cached))
    setIconBadge(tabId, verdict.level)
    return verdict
  }

  setIconBadge(tabId, 'PENDING')

  // 그룹별 요청과 문장별 요청을 한꺼번에 보낸다. 서버가 분당 110건에서 막아 준다.
  const groupJobs = [...groups.entries()]
    .map(([group, items]) => [group, items.filter((id) => missing.has(id))] as const)
    .filter(([, items]) => items.length > 0)
    .map(([group, items]) => {
      const fields = (schema.request_groups as Record<string, { state_fields: string[] } | undefined>)[group]?.state_fields ?? []
      const state: Record<string, string> = {}
      for (const f of fields) {
        if (f === 'headline') state.headline = msg.headline
        if (f === 'body') state.body = msg.body
      }
      return callProxy({ feature: 'page', group, items: [...items], state })
    })

  // 문장 항목은 쪼갤 수 없다 — 캐시에 없으면 문장을 **상한까지** 다시 묻는다.
  const sentences = msg.sentences.slice(0, MAX_SENTENCES)
  const sentenceJobs = sentenceItem && missing.has(sentenceItem)
    ? sentences.map((sentence) =>
        callProxy({ feature: 'page', group: 'sentence', items: [sentenceItem], state: { sentence } }))
    : []

  const [groupOut, sentenceOut] = await Promise.all([
    Promise.all(groupJobs),
    Promise.all(sentenceJobs),
  ])

  const answers: Record<string, JevAnswer> = {}
  for (const r of groupOut) {
    if (!r || isUndetermined(r)) continue
    Object.assign(answers, r.answers)
  }
  const perSentence: Record<string, JevAnswer>[] = []
  let sentenceFailed = false
  for (const r of sentenceOut) {
    if (!r || isUndetermined(r)) { sentenceFailed = true; continue }
    perSentence.push(r.answers)
  }

  // 이번에 물어본 항목만 채점한다. 캐시에 있던 것은 그대로 쓴다.
  const fresh = scoreArticle({ items: [...missing], answers, sentences: perSentence })

  // 모델이 내린 판단만 캐시한다 (`JUDGED`). 더해서,
  // **문장이 하나라도 실패했으면 그 항목을 캐시하지 않는다.**
  // 성공한 문장만으로 낸 비율을 "완성된 판단" 으로 6시간 들고 있으면,
  // 판단 범위가 조용히 줄어든 결과가 고정된다. 이번 판정에서만 쓰고 다음에 다시 묻는다.
  // (requirements.md 3-6절 "실패한 판단은 캐시하지 않는다")
  const toCache: ItemScores = {}
  for (const r of fresh) {
    if (sentenceFailed && r.id === sentenceItem) continue
    if (!JUDGED.includes(r.reason)) continue
    const g = gmap.get(r.id)
    if (!g) continue
    toCache[r.id] = stamp(r, g, fp)
  }
  await writeScores(msg.url, toCache)

  const verdict = decideBadge([...toResults(cached), ...fresh])
  setIconBadge(tabId, verdict.level)
  return verdict
}

/** 캐시에서 읽은 것을 `decideBadge` 가 받는 모양으로 되돌린다. */
function toResults(cached: ItemScores): ItemResult[] {
  return Object.entries(cached).map(([id, c]) => ({ id, ...c }))
}

/**
 * ② 목록의 제목 하나를 판단한다.
 *
 * **아이콘 배지를 건드리지 않는다.** 아이콘 배지는 "지금 탭의 상태 하나" 인데
 * 목록 페이지에는 기사가 서른 개 있다. 그중 하나의 판정을 탭 전체의 상태로 올리면
 * 그 페이지가 주의 대상인 것처럼 보인다 (requirements.md 2-1절).
 *
 * **캐시가 본문까지 본 결과를 들고 있으면 그것을 쓴다. 비용 0이다** (4-4절).
 * 사용자가 전에 읽었거나 ①이 이미 판단한 기사가 목록에 다시 뜬 경우다.
 */
export async function judgeHeadline(msg: Extract<Message, { kind: 'judge-headline' }>): Promise<HeadlineVerdict> {
  const portal = plan('portal_list')
  const portalItems = [...portal.groups.values()].flat()

  const stored = await readScores(msg.url)

  // --- 진한 동그라미: ①이 쓰는 항목이 캐시에 다 있는가 ------------------------
  // **①과 같은 기준으로 본다.** 여기서 느슨하게 보면 제목만 본 결과가 "본문까지 봤다" 로 나간다 —
  // `spread_inducement` 는 ①에서 본문까지, ②에서 제목만 보므로 그룹이 다르면 쓸 수 없다.
  //
  // **제목 지문은 보지 않는다.** ①이 쓴 값의 지문은 기사 페이지의 진짜 제목에서 나온 것이고,
  // 여기 있는 것은 목록 링크의 글자다. 둘이 달라도 ①의 판단이 더 믿을 만하다.
  const page = plan('page')
  const pageGroups = groupOf('page')
  const pageItems = [...[...page.groups.values()].flat(), ...(page.sentenceItem ? [page.sentenceItem] : [])]
  const full = reusable(stored, pageItems, pageGroups)
  if (pageItems.every((id) => id in full)) {
    const verdict = decideBadge(toResults(full))
    return { level: verdict.level, basis: 'full' }
  }

  // --- 옅은 동그라미: 제목만 ---------------------------------------------------
  //
  // 목록 링크의 글자가 바뀌면 다시 묻는다 — 그 글자가 곧 판단의 입력이다.
  const portalGroups = groupOf('portal_list')
  const fp = await headlineFingerprint(msg.headline)
  const cached = reusable(stored, portalItems, portalGroups, fp)
  const missing = portalItems.filter((id) => !(id in cached))
  if (missing.length > 0) {
    const jobs = [...portal.groups.entries()]
      .map(([group, items]) => [group, items.filter((id) => missing.includes(id))] as const)
      .filter(([, items]) => items.length > 0)
      .map(([group, items]) => callProxy({
        feature: 'portal_list', group, items: [...items], state: { headline: msg.headline },
      }))

    const answers: Record<string, JevAnswer> = {}
    for (const r of await Promise.all(jobs)) {
      if (!r || isUndetermined(r)) continue
      Object.assign(answers, r.answers)
    }

    const fresh = scoreArticle({ items: missing, answers, sentences: [] })
    // ①과 같은 규칙으로 거른다. 실패한 판단을 6시간 들고 있으면 안 된다.
    const toCache: ItemScores = {}
    for (const r of fresh) {
      if (!JUDGED.includes(r.reason)) continue
      const g = portalGroups.get(r.id)
      if (!g) continue
      toCache[r.id] = stamp(r, g, fp)
    }
    // **①이 재사용할 수 있는 것만 재사용한다.** 두 기능에서 요청 그룹이 같고 제목도 같은
    // 항목(`clickbait_headline`)만 해당된다. 나머지는 ①이 본문을 넣어 다시 묻는다.
    await writeScores(msg.url, toCache)

    const verdict = decideBadge([...toResults(cached), ...fresh])
    return { level: verdict.level, basis: 'headline' }
  }

  const verdict = decideBadge(toResults(cached))
  return { level: verdict.level, basis: 'headline' }
}

// ── 심층 분석 ───────────────────────────────────────────────────────────────

/**
 * "모름" 구간. Noul 확률이 이 안이면 **그 질문은 답하지 않은 것으로 본다.**
 *
 * `@genuearly/shared` 의 문장 판단이 쓰는 것과 같은 구간이다. 찾았는지 못 찾았는지를
 * 0.5 근처에서 억지로 가르면, 모델이 모르겠다고 말한 것을 우리가 단정하는 셈이 된다.
 */
const EXPLAIN_BAND = resolveBand(null)

/** 설명 전용 항목. **`items` 가 아니라 `explain_items` 다** (judgment-items.json). */
interface ExplainItemDef {
  id: string
  explain_for: string
  request_group: Record<string, string>
  questions: { id: string }[]
}
const EXPLAIN_ITEMS = ((schema as unknown as { explain_items?: ExplainItemDef[] }).explain_items ?? [])

/** 그 판단 항목을 설명하는 질문 묶음이 있는가. */
export const explainableItems = (): string[] => EXPLAIN_ITEMS.map((i) => i.explain_for)

/**
 * **아무도 설명하지 못하는 항목.** 여기만 LLM 이 본문에서 대목을 집어 온다.
 *
 * 목록을 손으로 적지 않고 **빼서 구한다.** 적어 두면 질문을 쪼개거나 규칙을 더할 때
 * 조용히 어긋난다 — 두 곳이 같은 항목을 설명하거나, 아무도 설명하지 않게 된다.
 */
const NEEDS_PINPOINT: ReadonlySet<string> = new Set(
  (schema.items as unknown as { id: string }[])
    .map((i) => i.id)
    .filter((id) => !explainableItems().includes(id) && !hasCodeEvidence(id)),
)

/**
 * 중계 서버에 **본문에서 대목을 집어 달라고** 한다.
 *
 * 프롬프트는 **중계 서버가 만든다.** 여기서는 항목 id 와 판정 이름과 본문만 보낸다 —
 * 자유 텍스트 지시를 보낼 수 있으면 우리 키로 남이 생성 모델을 쓰는 길이 열린다.
 *
 * **돌려받은 것을 여기서 한 번 더 대조한다.** 중계 서버도 대조하지만, 화면에 인용으로
 * 올라가는 글자라 두 번 본다. 본문에 없는 글자는 한 자도 보이지 않는다.
 */
async function pinpointPicks(
  body: string,
  itemId: string,
  level: ExplainLevel,
): Promise<ExplainPick[]> {
  try {
    const res = await fetch(`${PROXY_URL}/v1/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, level, body }),
    })
    if (!res.ok) {
      console.warn('[GenuEarly] 심층 분석 거절', res.status)
      return []
    }
    const out = (await res.json()) as { picks?: unknown }
    if (!Array.isArray(out.picks)) return []
    return out.picks.filter(
      (x): x is ExplainPick =>
        typeof x === 'object' &&
        x !== null &&
        typeof (x as ExplainPick).text === 'string' &&
        typeof (x as ExplainPick).why === 'string' &&
        body.includes((x as ExplainPick).text),
    )
  } catch (e) {
    console.warn('[GenuEarly] 심층 분석에 닿지 못했다', e)
    return []
  }
}

/**
 * 판정이 **왜 그렇게 나왔는지** 묻는다.
 *
 * Jev 는 이유를 돌려주지 않는다 — 분류기라 "고른 보기 + 확률 + 확신도" 가 전부다
 * (docs/jev.md 2절). 그래서 그 항목의 criteria 를 쪼갠 질문들을 **따로** 물어
 * "무엇이 있고 무엇이 없어서 그렇게 봤는지" 를 알아낸다.
 *
 * **점수에 들어가지 않는다.** 판정은 이미 났고 바뀌지 않는다 (GE-44).
 * **사용자가 누를 때만 불린다.** 기사를 여는 것만으로는 한 건도 나가지 않는다.
 *
 * 모름 구간 안의 답은 **빼고 준다.** 억지로 가르면 모델이 모르겠다고 한 것을
 * 우리가 단정하게 된다.
 */
export async function judgeExplain(
  msg: Extract<Message, { kind: 'judge-explain' }>,
): Promise<ExplainResult | null> {
  const def = EXPLAIN_ITEMS.find((i) => i.explain_for === msg.itemId)
  const group = def?.request_group.explain
  const pinpoint = NEEDS_PINPOINT.has(msg.itemId)
  // 둘 다 아니면 이 항목은 코드가 설명한다. 바깥에 물어볼 것이 없다.
  if ((!def || !group) && !pinpoint) return null

  const found: Record<string, boolean> = {}
  if (def && group) {
    const out = await callProxy({
      feature: 'explain',
      group,
      items: [def.id],
      state: { body: msg.body },
    })
    if (out && !isUndetermined(out)) {
      const [lo, hi] = EXPLAIN_BAND
      for (const q of def.questions) {
        const a = out.answers[q.id] as { type?: string; noul?: unknown } | undefined
        if (a?.type !== 'noul' || typeof a.noul !== 'number' || !Number.isFinite(a.noul)) continue
        if (a.noul > hi) found[q.id] = true
        else if (a.noul < lo) found[q.id] = false
        // 그 사이는 모름이다. 넣지 않는다.
      }
    } else if (!pinpoint) {
      return null
    }
  }

  const picks = pinpoint ? await pinpointPicks(msg.body, msg.itemId, msg.level) : []
  // 코드가 찾은 것은 콘텐츠 스크립트가 채운다 — 여기서는 Jev 가 **잰** 것과 LLM 이 **집어 온** 것만 낸다.
  return { itemId: msg.itemId, found, spans: {}, ...(picks.length ? { picks } : {}) }
}
