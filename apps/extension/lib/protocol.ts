// 콘텐츠 스크립트 ↔ background ↔ 중계 서버 사이에 오가는 모양.
//
// **중계 호출은 background 가 한다.** 콘텐츠 스크립트의 fetch 는 기사 페이지의 origin 으로
// 나가서 우리 서버가 거절한다 (서버는 chrome-extension:// 만 받는다).

/**
 * 중계 서버 주소.
 *
 * **기본값이 배포 주소다.** 전에는 기본이 `localhost` 였고 빌드할 때마다
 * `WXT_PROXY_URL` 을 손으로 넣어야 했는데, **한 번 빠뜨리면 모든 기사가 ⚪ 가 된다.**
 * 실제로 그렇게 나갔고, background 콘솔에만 `Failed to fetch` 가 찍혀 원인을 찾는 데
 * 한참 걸렸다 — 화면에는 "판단하지 못함" 으로만 보인다.
 *
 * 빠뜨렸을 때의 결과가 한쪽은 **조용한 고장**이고 다른 쪽은 **개발 중에 진짜 서버를
 * 쓰는 것**뿐이라, 기본을 뒤집는 편이 안전하다. 로컬 중계를 보려면 값을 준다.
 *
 *   WXT_PROXY_URL=http://localhost:8787 npm run dev -w @genuearly/extension
 *
 * 비밀이 아니다 — 주소일 뿐이고 키는 서버만 들고 있다.
 */
import type { BadgeLevel, Verdict } from '@genuearly/shared'

export type { BadgeLevel, Verdict }

export const PROXY_URL: string =
  import.meta.env.WXT_PROXY_URL ?? 'https://genuearly-proxy.genuearly-proxy.workers.dev'

export type Feature = 'page' | 'portal_list' | 'selection' | 'explain'

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

/**
 * ② 목록의 제목 하나. **본문이 없다** — 목록 페이지에는 제목밖에 없다.
 *
 * 그래서 `request_group` 에 `portal_list` 가 있는 항목만 판단한다.
 * 결과는 ①과 **같은 캐시에 항목 단위로** 쌓인다 (requirements.md 3-6절).
 */
export interface JudgeHeadlineMessage {
  kind: 'judge-headline'
  url: string
  headline: string
}

/** ②가 돌려받는 것. **근거가 무엇이었는지 함께 준다** (requirements.md 4-3절). */
export interface HeadlineVerdict {
  level: BadgeLevel
  /** `'full'` 이면 캐시에 본문까지 본 결과가 있었다는 뜻이다. 비용은 0이었다 */
  basis: 'headline' | 'full'
}

/**
 * 심층 분석. **점수에 들어가지 않는다** — 판정은 이미 났고 그 이유만 묻는다.
 *
 * 사용자가 누를 때만 나간다. 기사를 여는 것만으로는 한 건도 나가지 않는다
 * (judgment-items.json 의 `explain_items`, GE-44).
 */
export interface ExplainMessage {
  kind: 'judge-explain'
  url: string
  body: string
  /** 설명할 판단 항목. `explain_items[].explain_for` 와 같은 값 */
  itemId: string
  /** 이미 나온 판정. **중계 서버가 프롬프트에 적어 준다** — 모델은 이것을 바꾸지 않는다 */
  level: ExplainLevel
  /**
   * **코드가 찾아봤는데 빈손이었는가.**
   *
   * 코드 사전은 criteria 에 적힌 낱말만 안다. 다른 말로 감정을 자극하면 못 찾고,
   * 그러면 판정은 걸렸는데 보여 줄 것이 없다. 그때만 LLM 에 넘긴다 —
   * 코드가 찾았으면 부르지 않는다. 더 정확하고, 빠르고, 크레딧을 쓰지 않는다.
   */
  noEvidence?: boolean
}

/**
 * 심층 분석을 할 수 있는 판정.
 *
 * 🟢·⚪ 는 없다. 설명할 것이 없고, 크레딧을 쓸 이유도 없다.
 * 중계 서버도 같은 둘만 받는다 (apps/proxy/src/pinpoint.ts).
 */
export type ExplainLevel = 'CAUTION' | 'CHECK'

/**
 * 심층 분석 결과. **두 곳에서 온다.**
 *
 * - `found` — Jev 가 **잰** 것. 하위 질문 id → 그런가. 확률은 접어서 준다
 * - `spans` — 코드가 **찾은** 것. 규칙 id → 본문에서 떼어 온 글자
 * - `picks` — LLM 이 **집어 온** 것. 목록으로 담을 수 없는 항목(출처·근거)만
 *
 * Jev 는 "이 글이 어떤가" 는 재지만 "이 표현이 있는가" 는 못 센다 (docs/jev.md 8절).
 * 코드는 **정해진 표현**만 찾을 수 있다. 남는 것 — 기관명·실명처럼 목록이 없는 것 —
 * 만 LLM 이 집어 오고, **집어 온 것은 본문과 글자 대조해 거른다.**
 *
 * **셋 다 사람에게 하는 말을 쓰지 않는다.** 화면의 문장은 전부 ChatKHU 가 미리 쓴
 * 문구이고, 여기 담기는 것은 본문에서 떼어 온 글자와 **고른 이유의 id** 뿐이다.
 */
export interface ExplainResult {
  itemId: string
  found: Record<string, boolean>
  /** **원문 그대로다.** 화면에 인용한다 */
  spans: Record<string, string[]>
  /** 떼어 온 문장과 **왜 떼어 왔는지.** 하위 질문으로 나뉘지 않는 항목만 */
  picks?: ExplainPick[]
}

/**
 * 떼어 온 문장 하나.
 *
 * `why` 는 **미리 정해 둔 이유의 id** 다 (apps/proxy/src/pinpoint.ts 의 REASONS).
 * 화면에 뜨는 문장은 packages/content 의 `explain.*.reasons` 가 들고 있다 —
 * **모델은 그 문장을 쓰지 않고 고르기만 한다.**
 */
export interface ExplainPick {
  /** **원문 그대로다.** 화면에 인용한다 */
  text: string
  why: string
}

export type Message = JudgeArticleMessage | JudgeHeadlineMessage | ExplainMessage

// ── 팝업이 콘텐츠 스크립트에 보내는 것 ──────────────────────────────────────
//
// **background 를 거치지 않는다.** `tabs.sendMessage` 는 그 탭의 콘텐츠 스크립트에만 간다.
//
// 탭별 판정을 background 나 storage 에 쌓아 두고 팝업이 그것을 읽는 쪽이 더 쉽지만,
// **탭마다의 "어느 기사를 보는 중인가" 는 그 자체가 열람 기록이다.**
// 콘텐츠 스크립트가 들고 있다가 물어볼 때 건네면 아무 데도 남지 않는다
// (docs/security/secure-coding.md 6절).
export interface TabStateMessage {
  kind: 'get-tab-state'
}

/**
 * 심층 분석을 **콘텐츠 스크립트에** 시킨다.
 *
 * **팝업은 본문을 받지 않는다** (secure-coding.md 6절, tests/popup.test.ts).
 * 그래서 팝업이 본문을 들고 중계 서버로 보낼 수 없다. 본문을 들고 있는 것은
 * 콘텐츠 스크립트뿐이라, 팝업은 "이 항목을 설명해 달라" 고만 하고
 * 콘텐츠 스크립트가 background 를 거쳐 물어본 뒤 **답만** 돌려준다.
 */
export interface ExplainRequestMessage {
  kind: 'explain-item'
  itemId: string
  /** 팝업이 그리고 있는 그 항목의 판정. 콘텐츠 스크립트가 그대로 넘긴다 */
  level: ExplainLevel
}

/** 콘텐츠 스크립트가 지금 그리고 있는 상태. 팝업은 이것을 그대로 그린다. */
export interface TabState {
  level: DisplayLevel
  verdict?: ArticleVerdict
}

/**
 * 화면에 뜨는 단계.
 *
 * `PENDING` 은 **판단 결과가 아니라 화면 상태**다 — 요청을 보내 놓고 기다리는 중이다.
 * 그래서 `@genuearly/shared` 의 `BadgeLevel` 에는 없고 여기서만 더한다.
 */
export type DisplayLevel = BadgeLevel | 'PENDING'

/** 판단 결과. `@genuearly/shared` 의 `Verdict` 를 그대로 쓴다. */
export type ArticleVerdict = Verdict
