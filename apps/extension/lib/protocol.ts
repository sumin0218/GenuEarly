// 콘텐츠 스크립트 ↔ background ↔ 중계 서버 사이에 오가는 모양.
//
// **중계 호출은 background 가 한다.** 콘텐츠 스크립트의 fetch 는 기사 페이지의 origin 으로
// 나가서 우리 서버가 거절한다 (서버는 chrome-extension:// 만 받는다).

/** 중계 서버 주소. 배포하면 바꾼다 (GE-20). */
export const PROXY_URL = 'http://localhost:8787'

export type Feature = 'page' | 'portal_list' | 'selection'

export interface JudgeRequest {
  feature: Feature
  group: string
  items: string[]
  state: Record<string, string>
}

export interface JudgeOk {
  model: string
  answers: Record<string, JevAnswer>
}
export interface JudgeUndetermined {
  model: string
  undetermined: true
  reason: string
}
export type JudgeResponse = JudgeOk | JudgeUndetermined

export type JevAnswer =
  | { type: 'choice'; choice: string; confidence: number; probabilities?: Record<string, number> }
  | { type: 'score'; score: number; confidence: number; legend?: Record<string, string> }
  | { type: 'noul'; noul: number }

export const isUndetermined = (r: JudgeResponse): r is JudgeUndetermined =>
  (r as JudgeUndetermined).undetermined === true

// ── 콘텐츠 스크립트가 background 에 보내는 것 ────────────────────────────────
export interface JudgeArticleMessage {
  kind: 'judge-article'
  url: string
  headline: string
  body: string
  sentences: string[]
}

export type Message = JudgeArticleMessage

export type BadgeLevel = 'PENDING' | 'SAFE' | 'CHECK' | 'CAUTION' | 'UNDETERMINED'

export interface ArticleVerdict {
  level: BadgeLevel
  /** 어느 항목이 어떻게 나왔는지. 팝업 상세와 디버깅에 쓴다 */
  items: { id: string; level: BadgeLevel; note: string }[]
  /** 전부 ⚪ 일 때의 이유. 사용자에게 보여 주지 않는다 */
  reason?: string
}
