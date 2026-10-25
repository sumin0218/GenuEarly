// 기사 하나를 판단하는 흐름. **background 에서 돈다.**
//
// **중계 호출을 background 에서 하는 이유**: 콘텐츠 스크립트의 fetch 는 기사 페이지의 origin
// (https://n.news.naver.com)으로 나간다. 우리 중계 서버는 chrome-extension:// 만 받으므로
// 거절당한다. background 의 fetch 는 확장 origin 으로 나간다.
//
// 엔트리포인트(entrypoints/background.ts)가 아니라 여기 둔 이유는 **테스트에서 부르기 위해서다.**
// 엔트리포인트는 WXT 의 defineBackground 로 감싸여 있어 그대로는 불러올 수 없다.
import schema from '../../../packages/shared/judgment-items.json'
import { readScores, sweepExpired, writeScores } from './cache'
import { toItemScores, verdictFrom } from './scoring'
import {
  PROXY_URL,
  type ArticleVerdict,
  type BadgeLevel,
  type JevAnswer,
  type JudgeRequest,
  type JudgeResponse,
  type Message,
  isUndetermined,
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

async function callProxy(body: JudgeRequest): Promise<JudgeResponse | null> {
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

/**
 * 아이콘 배지에 넣는 글자.
 *
 * **여기에 사용자에게 보이는 말을 쓰지 않는다.** 한때 `'안심'` 이라고 적어 두었는데,
 * ChatKHU 가 쓴 문구는 SAFE 를 일부러 **"눈에 띄는 신호 없음"** 으로 썼다 —
 * 우리는 신호를 못 찾은 것이지 안심해도 된다고 말한 적이 없다 (docs/product.md 2절).
 *
 * 배지 칸은 네 글자 남짓이라 문구를 그대로 넣을 수 없다. **글자 대신 기호를 쓰고 색으로 가른다.**
 * 색만으로는 색각 이상에서 구분되지 않으므로 기호 모양을 서로 다르게 둔다.
 * 짧은 이름을 ChatKHU 로 따로 받으면 그때 `ui.ko.json` 에서 읽는다 (requirements.md 2-1절 TODO).
 */
const BADGE_TEXT: Record<BadgeLevel, string> = {
  PENDING: '…', SAFE: '○', CHECK: '△', CAUTION: '!', UNDETERMINED: '?',
}
const BADGE_COLOR: Record<BadgeLevel, string> = {
  PENDING: '#9aa0a6', SAFE: '#1e8e3e', CHECK: '#f29900', CAUTION: '#d93025', UNDETERMINED: '#5f6368',
}

/** 아이콘 배지. 권한이 필요 없다 — action 키만 선언한다 (requirements.md 2-1절). */
function setIconBadge(tabId: number | undefined, level: BadgeLevel) {
  if (tabId === undefined) return
  // 탭마다 따로 둔다. 다른 탭의 기사 상태가 섞이면 안 된다.
  void browser.action.setBadgeText({ tabId, text: BADGE_TEXT[level] })
  void browser.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR[level] })
}

export async function judgeArticle(msg: Extract<Message, { kind: 'judge-article' }>, tabId?: number): Promise<ArticleVerdict> {
  const { groups, sentenceItem } = plan('page')

  // --- 캐시 -----------------------------------------------------------------
  // **항목 단위다.** ② 포털 목록은 제목 항목만 채우므로, 기사 단위로 "있다/없다" 를
  // 보면 제목만 본 결과가 기사 배지로 나간다 (requirements.md 3-6절).
  const cached = await readScores(msg.url)
  const needed = [...[...groups.values()].flat(), ...(sentenceItem ? [sentenceItem] : [])]
  const missing = new Set(needed.filter((id) => !(id in cached)))

  if (missing.size === 0) {
    // 다 있다. **PENDING 을 거치지 않고 바로 보여 준다.**
    const verdict = verdictFrom(cached)
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

  const fresh = toItemScores(answers, perSentence)

  // **문장이 하나라도 실패했으면 그 항목을 캐시하지 않는다.**
  // 성공한 문장만으로 낸 비율을 "완성된 판단" 으로 6시간 들고 있으면,
  // 판단 범위가 조용히 줄어든 결과가 고정된다. 이번 판정에서만 쓰고 다음에 다시 묻는다.
  // (requirements.md 3-6절 "실패한 판단은 캐시하지 않는다")
  const toCache = { ...fresh }
  if (sentenceFailed && sentenceItem) delete toCache[sentenceItem]
  await writeScores(msg.url, toCache)

  const verdict = verdictFrom({ ...cached, ...fresh })
  setIconBadge(tabId, verdict.level)
  return verdict
}
