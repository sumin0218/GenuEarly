// service worker. 확장 프로그램의 "뒤에서 도는 부분"이다.
//
// MV3 의 service worker 는 수시로 종료된다. 켜져 있다고 가정하지 않는다.
// 전역 변수에 캐시나 진행 상태를 두지 말고 chrome.storage 에 쓴다.
//
// **중계 호출을 여기서 하는 이유**: 콘텐츠 스크립트의 fetch 는 기사 페이지의 origin
// (https://n.news.naver.com)으로 나간다. 우리 중계 서버는 chrome-extension:// 만 받으므로
// 거절당한다. background 의 fetch 는 확장 origin 으로 나간다.
import schema from '../../../packages/shared/judgment-items.json'
import { scoreArticle } from '../lib/scoring'
import {
  PROXY_URL,
  type ArticleVerdict,
  type BadgeLevel,
  type JevAnswer,
  type JudgeRequest,
  type JudgeResponse,
  type Message,
  isUndetermined,
} from '../lib/protocol'

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

const BADGE_TEXT: Record<BadgeLevel, string> = {
  PENDING: '…', SAFE: '안심', CHECK: '확인', CAUTION: '주의', UNDETERMINED: '?',
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

async function judgeArticle(msg: Extract<Message, { kind: 'judge-article' }>, tabId?: number): Promise<ArticleVerdict> {
  setIconBadge(tabId, 'PENDING')
  const { groups, sentenceItem } = plan('page')

  // 그룹별 요청과 문장별 요청을 한꺼번에 보낸다. 서버가 분당 110건에서 막아 준다.
  const groupJobs = [...groups.entries()].map(([group, items]) => {
    const fields = (schema.request_groups as Record<string, { state_fields: string[] } | undefined>)[group]?.state_fields ?? []
    const state: Record<string, string> = {}
    for (const f of fields) {
      if (f === 'headline') state.headline = msg.headline
      if (f === 'body') state.body = msg.body
    }
    return callProxy({ feature: 'page', group, items, state })
  })

  const sentenceJobs = sentenceItem
    ? msg.sentences.map((sentence) =>
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
  for (const r of sentenceOut) {
    if (!r || isUndetermined(r)) continue
    perSentence.push(r.answers)
  }

  const verdict = scoreArticle(answers, perSentence)
  setIconBadge(tabId, verdict.level)
  return verdict
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    const msg = raw as Message
    // **보낸 곳을 확인한다.** 우리 콘텐츠 스크립트가 아니면 받지 않는다.
    if (!sender.tab || sender.id !== browser.runtime.id) return false
    if (msg?.kind !== 'judge-article') return false

    judgeArticle(msg, sender.tab.id)
      .then(sendResponse)
      .catch((e) => {
        console.warn('[GenuEarly] 판단 실패', e)
        sendResponse({ level: 'UNDETERMINED', items: [], reason: 'error' } satisfies ArticleVerdict)
      })
    return true   // 비동기로 답한다
  })
})
