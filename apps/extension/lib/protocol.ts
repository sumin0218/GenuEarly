// 콘텐츠 스크립트 ↔ background ↔ 중계 서버 사이에 오가는 모양.
//
// **중계 호출은 background 가 한다.** 콘텐츠 스크립트의 fetch 는 기사 페이지의 origin 으로
// 나가서 우리 서버가 거절한다 (서버는 chrome-extension:// 만 받는다).

/**
 * 중계 서버 주소. **빌드할 때 넣는다.**
 *
 * 상수로 두었더니 `localhost` 가 제출본에 그대로 들어갈 뻔했다 — 그러면 심사위원 브라우저에서
 * 모든 기사가 ⚪ 가 된다. 주석 하나에 기대지 않고 **빌드 결과를 검사**한다
 * (apps/extension/tests/manifest.test.ts 의 "제출본에 localhost 가 없다").
 *
 *   WXT_PROXY_URL=https://<배포주소> npm run build -w @genuearly/extension
 *
 * 개발에서는 값을 안 주면 로컬 중계를 본다.
 */
import type { BadgeLevel, Verdict } from '@genuearly/shared'

export type { BadgeLevel, Verdict }

export const PROXY_URL: string = import.meta.env.WXT_PROXY_URL ?? 'http://localhost:8787'

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

/**
 * 화면에 뜨는 단계.
 *
 * `PENDING` 은 **판단 결과가 아니라 화면 상태**다 — 요청을 보내 놓고 기다리는 중이다.
 * 그래서 `@genuearly/shared` 의 `BadgeLevel` 에는 없고 여기서만 더한다.
 */
export type DisplayLevel = BadgeLevel | 'PENDING'

/** 판단 결과. `@genuearly/shared` 의 `Verdict` 를 그대로 쓴다. */
export type ArticleVerdict = Verdict
