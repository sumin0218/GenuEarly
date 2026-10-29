// 아이콘을 누르면 열리는 팝업. **권한이 필요 없다** — `action` 키로 연다
// (docs/requirements.md 2-1절).
//
// 여기가 "왜 이 배지인가" 를 보여 주는 자리다. 기사 위 배지에도 같은 내용이 있지만,
// 배지는 사용자가 닫을 수 있고 기사가 아닌 탭에서는 아예 없다.
//
// **점수 숫자를 쓰지 않는다.** 정밀해 보이는 숫자는 단정으로 읽힌다 (docs/product.md 6절).
import './style.css'
import content from '../../../../packages/content/ui.ko.json'
import schema from '@genuearly/shared/judgment-items.json'
import { ITEM_CAUTION_AT } from '@genuearly/shared'
import { createIcon } from '../../lib/icon'
import { LEVEL_ICON, LEVEL_INK, LEVEL_INK_DARK, UI_ICON, toRows } from '../../lib/item-view'
import {
  SELECTION_KEY,
  clearSelection,
  peekSelection,
  type SelectionOutcome,
  type SelectionRecord,
} from '../../lib/selection'
import { normalizeUrl } from '../../lib/cache'
import { REPORT_KEY, type Report } from '../../lib/report'
import type {
  DisplayLevel,
  ExplainLevel,
  ExplainRequestMessage,
  MakeReportAnswer,
  MakeReportMessage,
  ReportRow,
  ExplainResult,
  TabState,
  TabStateMessage,
} from '../../lib/protocol'

/**
 * 지금 탭의 상태를 **그 탭의 콘텐츠 스크립트에** 묻는다.
 *
 * 기사 페이지가 아니면 콘텐츠 스크립트가 없어서 `sendMessage` 가 거절된다.
 * 그것이 정상 경로다 — 우리는 판단한 적이 없으니 ⚪ 다.
 *
 * `tabs.query` 로 받는 `tab.id` 는 `tabs` 권한이 필요 없다. 권한이 필요한 것은
 * `url`·`title`·`favIconUrl` 이고 **우리는 그 셋을 읽지 않는다**
 * (apps/extension/tests/manifest.test.ts 의 금지 권한 목록).
 */
async function readTabState(): Promise<TabState> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    if (tab?.id === undefined) return { level: 'UNDETERMINED' }
    const msg: TabStateMessage = { kind: 'get-tab-state' }
    const state = (await browser.tabs.sendMessage(tab.id, msg)) as TabState | undefined
    return state ?? { level: 'UNDETERMINED' }
  } catch {
    // 기사 페이지가 아니거나, 콘텐츠 스크립트가 아직 안 붙었다.
    return { level: 'UNDETERMINED' }
  }
}

/** 지금 활성 탭의 id. ③ 결과가 **그 탭의 것인지** 가리는 데 쓴다. */
async function activeTabId(): Promise<number | undefined> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    return tab?.id
  } catch {
    return undefined
  }
}

/** ③ 의 결과 하나를 그린다. 거절이면 거절 화면으로. */
function drawSelection(outcome: SelectionOutcome): void {
  if (!outcome.ok) return renderTooLong(outcome.limit)
  render({ level: outcome.verdict.level, verdict: outcome.verdict }, document, 'selection')
}

/**
 * 팝업이 열릴 때 **무엇을 보여 줄지 고른다.**
 *
 * ③ 의 결과가 있으면 그것이 먼저다 — 방금 오른쪽 클릭으로 검사했고 팝업은 그것을 보려고 열렸다.
 *
 * **팝업이 판단보다 먼저 열린다.** background 는 제스처를 잃지 않으려고 메뉴 클릭 즉시
 * 팝업을 열고 그 다음에 판단한다. 그래서 여기서 보는 것은 대개 `pending` 이고,
 * 결과는 `storage.session` 변경으로 **나중에** 온다.
 */
async function run(): Promise<void> {
  // **빈 화면으로 열리는 쪽이 가장 나쁘다.** 어디서 터지든 적어도 머리말은 그린다
  // (background.ts 의 ③ 처리도 같은 이유로 ⚪ 를 돌려준다).
  try {
    await draw()
  } catch (e) {
    console.warn('[GenuEarly] 팝업을 그리지 못했다', e)
    render({ level: 'UNDETERMINED' }, document, 'page')
  }
}

async function draw(): Promise<void> {
  const tabId = await activeTabId()

  // **먼저 듣기 시작한다.** 저장소 쓰기가 이 읽기보다 늦을 수 있다
  // (background 가 openPopup 을 먼저 부르기 때문이다).
  browser.storage.session.onChanged?.addListener((changes) => {
    const rec = changes[SELECTION_KEY]?.newValue as SelectionRecord | undefined
    if (rec?.state !== 'done' || !rec.outcome) return
    if (rec.tabId !== undefined && tabId !== undefined && rec.tabId !== tabId) return
    void clearSelection()
    drawSelection(rec.outcome)
  })

  const rec = await peekSelection(tabId)
  if (rec?.state === 'done' && rec.outcome) {
    await clearSelection()
    return drawSelection(rec.outcome)
  }
  if (rec?.state === 'pending') {
    // 판단이 돌고 있다. 결과는 위의 리스너가 받는다.
    return render({ level: 'PENDING' }, document, 'selection')
  }
  render(await readTabState(), document, 'page')
}

/**
 * 팝업 틀에 들어가는 **사용자에게 보이는 말.** 전부 ChatKHU 가 쓴다
 * (tools/content-gen/prompt.md 4차). 코딩 도구는 한국어를 지어내지 않는다.
 *
 * **전부 선택이다.** 아직 받지 못한 문구가 있으면 그 자리를 **그리지 않는다** —
 * 영어나 임시 한국어로 채우면 그것이 그대로 배포본에 들어간다.
 */
export interface AppCopy {
  homepage?: string
  details?: { open?: string; close?: string }
  /** 무엇을 보고 낸 판단인가 */
  basis?: { page?: string; headline?: string; selection?: string }
  /** 얼마나 봤는가. **정확도가 아니다** */
  coverage?: { sentences?: string; capped?: string }
  criteria?: string
  /** 신호는 보이는데 **확신이 모자라** 🟡 에 머문 경우 */
  lowConfidence?: string
  disclaimer?: string
  /**
   * **판정은 걸렸는데 어디인지 짚지 못한 경우.**
   *
   * 판정을 내리는 물음과 "그래서 어디가 그런가" 를 따지는 물음은 **서로 다른 물음**이라,
   * 판정이 주의인데 쪼갠 물음은 하나도 걸리지 않을 수 있다. 그때 "신호가 보이지
   * 않습니다" 라고 적으면 **바로 윗줄과 정면으로 어긋난다** — 실제로 그렇게 떴다.
   */
  unpinned?: string
}

/** 문구가 아니라 **사실**. 생성하지 않고 읽어 온다. */
export interface ChromeFacts {
  /** 확장 프로그램 버전. manifest 에서 읽는다 */
  version?: string
  homepageUrl?: string
  /** 질문 세트 버전과 모델 */
  schemaVersion?: string
  model?: string
  /** 브랜드 줄의 아이콘. 확장 안의 파일이라 `runtime.getURL` 로 받는다 */
  iconUrl?: string
  basis?: 'page' | 'headline' | 'selection'
  /** 문장 단위 항목이 몇 문장 중 몇 문장을 봤는가 */
  sentences?: { total: number; judged: number }
  /** 글이 길어 앞부분만 봤는가 */
  capped?: boolean
  /** 점수가 아니라 확신도 때문에 🟡 이 되었는가 */
  lowConfidence?: boolean
}

/** `{a}` 자리에 값을 끼운다. 값이 없는 자리표시자가 남으면 **그 줄을 버린다.** */
function fill(template: string, values: Record<string, string | undefined>): string | null {
  let out = template
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) continue
    out = out.split(`{${k}}`).join(v)
  }
  return /{[a-z]+}/i.test(out) ? null : out
}

/**
 * 제품 정보와 판단 근거를 그린다.
 *
 * **버전은 문구가 없어도 보인다** — 이름과 숫자는 생성할 말이 아니다.
 * 나머지는 해당 문구가 있을 때만 보인다.
 */
export function drawChrome(app: AppCopy | undefined, facts: ChromeFacts, root: Document = document): void {
  const version = root.getElementById('version')
  if (version) version.textContent = facts.version ? `v${facts.version}` : ''
  const icon = root.getElementById('brand-icon') as HTMLImageElement | null
  // 주소를 못 받으면 **빈 이미지를 두지 않는다.** 깨진 그림이 뜬다.
  if (icon) {
    if (facts.iconUrl) {
      icon.src = facts.iconUrl
      icon.hidden = false
    } else {
      // 주소를 못 받았다. **빈 그림을 두지 않는다** — 깨진 그림이 뜬다.
      icon.remove()
    }
  }

  const details = root.getElementById('details')
  const foot = root.getElementById('foot')
  const toggle = root.getElementById('details-toggle')
  const homepage = root.getElementById('homepage') as HTMLAnchorElement | null
  if (!details || !foot || !toggle || !homepage) return

  // --- 자세히 안의 줄들 ---------------------------------------------------
  const lines: string[] = []
  // **맨 앞이다.** 자세히를 여는 첫 질문이 "왜 이 판정인가" 다.
  if (app?.lowConfidence && facts.lowConfidence) lines.push(app.lowConfidence)
  const basis = facts.basis && app?.basis?.[facts.basis]
  if (basis) lines.push(basis)
  if (app?.coverage?.sentences && facts.sentences) {
    const line = fill(app.coverage.sentences, {
      total: String(facts.sentences.total),
      judged: String(facts.sentences.judged),
    })
    if (line) lines.push(line)
  }
  if (app?.coverage?.capped && facts.capped) lines.push(app.coverage.capped)
  if (app?.criteria) {
    const line = fill(app.criteria, { version: facts.schemaVersion, model: facts.model })
    if (line) lines.push(line)
  }
  // **마지막에 놓는다.** 이 제품이 참·거짓을 말하지 않는다는 것을 사용자에게
  // 직접 말하는 유일한 자리다 (GE-45).
  if (app?.disclaimer) lines.push(app.disclaimer)

  details.replaceChildren()
  for (const text of lines) {
    const li = root.createElement('li')
    li.className = 'ge-popup__detail'
    li.textContent = text
    details.append(li)
  }

  // --- 꼬리말 -------------------------------------------------------------
  const canToggle = lines.length > 0 && Boolean(app?.details?.open && app.details.close)
  const canLink = Boolean(app?.homepage && facts.homepageUrl)

  toggle.hidden = !canToggle
  homepage.hidden = !canLink
  foot.hidden = !canToggle && !canLink
  // 열 수 없으면 펼쳐진 채로 남지 않게 한다.
  if (!canToggle) details.hidden = true

  if (canLink) {
    homepage.textContent = app?.homepage ?? ''
    homepage.href = facts.homepageUrl ?? ''
  }
  if (canToggle) {
    const open = app?.details?.open ?? ''
    const close = app?.details?.close ?? ''
    const paint = () => {
      toggle.textContent = details.hidden ? open : close
      toggle.setAttribute('aria-expanded', String(!details.hidden))
    }
    details.hidden = true
    paint()
    toggle.onclick = () => {
      details.hidden = !details.hidden
      paint()
    }
  }
}

/**
 * 지금 들어 있는 틀 문구. **아직 4차를 돌리지 않았으면 `undefined` 다** —
 * 그러면 버전 줄만 보이고 자세히·홈페이지는 그려지지 않는다.
 */
const APP: AppCopy | undefined = (content as { app?: AppCopy }).app

/** 문장 단위 항목이 몇 문장 중 몇 문장을 봤는가. 쓰는 항목이 하나뿐이라 첫 것을 쓴다. */
function sentencesOf(verdict: TabState['verdict']): ChromeFacts['sentences'] {
  return verdict?.items?.find((it) => it.sentences)?.sentences
}

/** manifest 와 질문 세트에서 사실을 읽어 온다. 테스트에서는 부르지 않는다. */
function readFacts(): ChromeFacts {
  try {
    const m = browser.runtime.getManifest() as { version?: string; homepage_url?: string }
    return {
      version: m.version,
      homepageUrl: m.homepage_url,
      iconUrl: browser.runtime.getURL('/icon/16.png'),
      schemaVersion: schema.version,
      model: schema.model,
    }
  } catch {
    // 팝업 문서 밖(테스트)에서 불린 경우. 사실이 없으면 그리지 않을 뿐이다.
    return { schemaVersion: schema.version, model: schema.model }
  }
}

/** 받은 줄을 그린다. 한 줄도 없으면 자리를 비운다 — 빈 상자를 남기지 않는다. */
function drawWhy(host: HTMLElement, lines: ExplainLine[], root: Document): void {
  host.replaceChildren()
  for (const line of lines) {
    const li = root.createElement('li')
    li.className = 'ge-popup__why-line'
    li.textContent = line.text
    // **본문에서 떼어 온 글자.** 우리가 쓴 말과 섞이지 않게 따로 그린다.
    for (const q of line.quotes ?? []) {
      const quote = root.createElement('q')
      quote.className = 'ge-popup__why-quote'
      quote.textContent = q
      li.append(quote)
    }
    host.append(li)
  }
  host.hidden = lines.length === 0
}

/** 설명 문구 묶음. 질문 세트와 짝이 맞는지는 tests/content.test.ts 가 본다. */
interface ExplainCopy {
  title: string
  none: string
  /**
   * 떼어 온 문장마다 붙는 "왜" 한 문장. **이유 id → 문장.**
   *
   * LLM 이 집어 오는 항목만 가진다. 짝은 apps/proxy/src/pinpoint.ts 의 REASONS 다 —
   * **모델은 이 문장을 쓰지 않고 그중 하나를 고르기만 한다.**
   */
  reasons?: Record<string, string>
  /** 없을 수 있다 — LLM 이 본문에서 집어 오는 항목은 짝 문구를 두지 않는다 */
  parts?: Record<string, { present: string; absent: string }>
}
const EXPLAIN = (content as unknown as { explain?: Record<string, ExplainCopy> }).explain ?? {}

/**
 * 그 항목에 **설명할 말이 있는가.** 문구가 없으면 버튼 자체를 그리지 않는다.
 *
 * 쪼갠 질문(`parts`)이 있거나, 본문에서 대목을 집어 오는 항목(`reasons`)이면 된다.
 */
const canExplain = (itemId: string): boolean =>
  Boolean(EXPLAIN[itemId]?.parts ?? EXPLAIN[itemId]?.reasons)

/**
 * 심층 분석을 **콘텐츠 스크립트에** 시킨다.
 *
 * **팝업은 본문을 받지 않는다** (secure-coding.md 6절). 본문을 들고 있는 것은
 * 콘텐츠 스크립트뿐이라, 우리는 항목 id 만 보내고 답만 받는다.
 */
async function askExplain(itemId: string, level: ExplainLevel): Promise<ExplainResult | null> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    if (tab?.id === undefined) return null
    const msg: ExplainRequestMessage = { kind: 'explain-item', itemId, level }
    return ((await browser.tabs.sendMessage(tab.id, msg)) as ExplainResult | null) ?? null
  } catch {
    return null
  }
}

/**
 * 받은 답을 줄로 바꾼다.
 *
 * **모름은 빠져 있다** — `judgeExplain` 이 확률이 모름 구간 안인 질문을 넣지 않는다.
 * 그래서 다섯 줄이 다 나오지 않을 수 있다. 억지로 채우지 않는다.
 */
/** 화면에 놓을 한 줄. `quote` 는 **본문에서 떼어 온 글자**다 — 우리가 쓴 말이 아니다. */
export interface ExplainLine {
  text: string
  quotes?: string[]
}

/**
 * 받은 답을 줄로 바꾼다.
 *
 * 두 곳에서 온다 — Jev 가 **잰** 것(`found`)과 코드가 **찾은** 것(`spans`).
 * 찾은 것에는 본문에서 떼어 온 글자를 함께 붙인다. **어디인지**를 말하는 유일한 방법이다.
 *
 * **모름은 빠져 있다** — `judgeExplain` 이 확률이 모름 구간 안인 질문을 넣지 않는다.
 * 억지로 채우지 않는다.
 */
export function explainLines(
  itemId: string,
  result: ExplainResult | null,
  level?: DisplayLevel,
): ExplainLine[] {
  const copy = EXPLAIN[itemId]
  if (!copy || !result) return []
  const parts = copy.parts ?? {}

  /**
   * 아무것도 못 짚었을 때 할 말.
   *
   * **판정이 걸린 항목에 "신호가 보이지 않습니다" 라고 적지 않는다.** 바로 윗줄이
   * "주의할 표현을 씁니다" 인데 그 밑에 없다고 적으면 서로 어긋나고, 사용자는
   * 둘 중 어느 쪽도 믿지 못하게 된다. 못 짚은 쪽은 **우리**라고 말한다.
   */
  const 없다 = (): ExplainLine => ({
    text:
      (level === 'CAUTION' || level === 'CHECK') && APP?.unpinned ? APP.unpinned : copy.none,
  })

  const ids = [...Object.keys(result.found), ...Object.keys(result.spans ?? {})]
  const 본것 = [...new Set(ids)].filter((id) => parts[id])

  const 있다 = (id: string): boolean =>
    (result.spans?.[id]?.length ?? 0) > 0 || result.found[id] === true

  const lines: ExplainLine[] = []

  // ① Jev 가 **잰** 것과 코드가 **찾은** 것. 본 것이 전부 아니오면 아래 ③ 에서 한 줄로 말한다.
  if (본것.some((id) => 있다(id))) {
    for (const id of 본것) {
      const pair = parts[id]
      if (!pair) continue
      const yes = 있다(id)
      const quotes = yes ? result.spans?.[id] : undefined
      lines.push({ text: yes ? pair.present : pair.absent, ...(quotes?.length ? { quotes } : {}) })
    }
  }

  // ② LLM 이 본문에서 집어 온 문장. **한 줄에 "왜" 하나와 인용 하나씩.**
  // 넷을 늘어놓으면 본문 복사처럼 보인다 — 중계 서버가 둘로 끊어 준다.
  //
  // "왜" 는 두 곳에서 온다. 전용 문구(`reasons`)가 있으면 그것을 쓰고, 없으면
  // **코드가 찾던 것과 같은 하위 항목**이라 이미 있는 문구를 그대로 쓴다
  // (감정적 표현·공유 유도가 그렇다 — 코드가 빈손일 때만 LLM 이 대신 찾는다).
  const 이유문구 = (why: string): string | undefined => copy.reasons?.[why] ?? parts[why]?.present
  const picks = (result.picks ?? []).filter((x) => 이유문구(x.why))
  if (picks.length > 0) {
    // **같은 이유는 한 줄로 모은다.** 똑같은 말을 두 번 적으면 두 가지를 짚은 것처럼
    // 보인다. 이유가 하나면 줄도 하나고, 그 밑에 떼어 온 문장이 나란히 붙는다.
    const 묶음 = new Map<string, string[]>()
    for (const x of picks) 묶음.set(x.why, [...(묶음.get(x.why) ?? []), x.text])
    for (const [why, quotes] of 묶음) lines.push({ text: 이유문구(why)!, quotes })
  }

  // ③ 아무 줄도 없으면 **한 줄로** 말한다. 여러 줄을 "없습니다" 로 늘어놓는 것보다 낫다.
  // 눌렀는데 빈 화면이 뜨는 것이 가장 나쁘다 — 그때도 할 말이 있다.
  if (lines.length === 0) lines.push(없다())
  return lines
}

/** 머리말 아이콘의 변 길이(px). 제목(18px)보다 조금 작다. */
const HEAD_ICON = 20
/** 항목 줄 아이콘의 변 길이(px). */
const ROW_ICON = 14

/**
 * 단계 아이콘을 자리에 그린다.
 *
 * **색을 CSS 변수로 준다.** 요소에 색을 직접 칠하면 밝은 화면·어두운 화면 두 벌을
 * 스크립트가 들고 있어야 한다. 팝업에는 미디어 쿼리가 있으니 값만 넘기고 고르는 일은
 * CSS 에 맡긴다 — 다만 단계별 색표의 원본은 lib/item-view.ts 하나다.
 *
 * `tone: 'quiet'` 는 색을 주지 않는다. 걸리지 않은 항목 줄이 그렇다 —
 * 일곱 줄을 전부 색칠하면 어느 줄을 보라는 것인지 알 수 없다.
 */
function paintMark(
  el: HTMLElement,
  level: DisplayLevel,
  size: number,
  tone: 'level' | 'quiet' = 'level',
): void {
  const root = el.ownerDocument
  if (tone === 'level') {
    el.style.setProperty('--ge-level-light', LEVEL_INK[level])
    el.style.setProperty('--ge-level-dark', LEVEL_INK_DARK[level])
  } else {
    el.style.removeProperty('--ge-level-light')
    el.style.removeProperty('--ge-level-dark')
  }
  el.replaceChildren(createIcon(root, LEVEL_ICON[level], { size }))
}

/** 고른 글이 너무 길어 묻지 않은 경우. **판정이 아니라 거절이다.** */
function renderTooLong(limit: number, root: Document = document): void {
  const mark = root.getElementById('mark')
  const name = root.getElementById('name')
  const desc = root.getElementById('desc')
  const items = root.getElementById('items')
  if (!mark || !name || !desc || !items) return

  root.body.dataset.level = 'UNDETERMINED'
  root.body.dataset.kind = 'selection'
  paintMark(mark, 'UNDETERMINED', HEAD_ICON)
  name.textContent = content.selection.tooLong.title
  desc.textContent = content.selection.tooLong.description.replace('{limit}', String(limit))
  items.replaceChildren()
  drawFrame({ level: 'UNDETERMINED' }, root, 'selection')
}

/** `innerHTML` 을 쓰지 않는다 (docs/security/secure-coding.md 4절). */
function render(state: TabState, root: Document = document, kind: 'page' | 'selection' = 'page'): void {
  const mark = root.getElementById('mark')
  const name = root.getElementById('name')
  const desc = root.getElementById('desc')
  const items = root.getElementById('items')
  if (!mark || !name || !desc || !items) return

  // **판단한 적이 없는 것과 판단했지만 ⚪ 인 것은 다르다.**
  // 기사 페이지가 아닌 곳에서 아이콘을 누르면 우리는 아무것도 하지 않았다.
  // 여기에 "판단하지 못함" 을 띄우면 해 보고 실패한 것으로 읽힌다 (requirements.md 5-1절).
  // 살펴보는 중(PENDING)은 판단을 시작한 것이므로 여기에 들지 않는다.
  const notJudged = kind === 'page' && !state.verdict && state.level === 'UNDETERMINED'
  const copy = notJudged
    ? { name: content.notArticle.title, description: content.notArticle.description }
    : content.badge[state.level]
  root.body.dataset.level = state.level
  // **무엇에 대한 판단인지 밝힌다.** 밝히지 않으면 사용자는 ③ 의 결과를
  // 지금 보고 있는 페이지에 대한 판단으로 읽는다 (requirements.md 5절).
  root.body.dataset.kind = kind
  const scope = root.getElementById('scope')
  if (scope) {
    scope.hidden = kind !== 'selection'
    scope.textContent = kind === 'selection' ? content.selection.title : ''
  }
  paintMark(mark, state.level, HEAD_ICON)
  name.textContent = copy.name
  desc.textContent = copy.description

  // **항목보다 먼저 그린다.** 아래에 항목이 없어 일찍 돌아가는 길이 셋 있는데
  // (판단한 적 없음 / 살펴보는 중 / 항목이 비었음), 끝에서 그리면 그 셋에서
  // 틀이 통째로 안 그려진다. 기사가 아닌 페이지에서 로고가 깨져 보이던 원인이다.
  drawFrame(state, root, kind)
  drawWrongButton(root)

  items.replaceChildren()
  const rows = toRows(state.verdict)
  drawReport(rows, kind, root, state.url)
  if (rows.length === 0) {
    // 판단한 적이 없으면 머리말이 이미 할 말을 했다. 밑에 또 붙이면 말이 겹친다.
    if (notJudged) return
    // 아직 돌고 있다. "정보가 충분하지 않다" 는 **끝난 뒤에** 할 말이다.
    if (state.level === 'PENDING') return
    // 판단은 했는데 항목이 하나도 안 남았다 — 본문을 못 읽었거나 중계가 전부 실패했다.
    const li = root.createElement('li')
    li.className = 'ge-popup__note'
    li.textContent = content.undetermined.description
    items.append(li)
    return
  }
  for (const r of rows) {
    const li = root.createElement('li')
    li.className = 'ge-popup__item'
    li.dataset.level = r.level

    // **걸린 줄에만 색이 들어간다** (docs/design.md). 나머지는 흐린 회색이라
    // 주의·확인 줄이 목록 안에서 먼저 보인다.
    const loud = r.level === 'CAUTION' || r.level === 'CHECK'
    const icon = root.createElement('span')
    icon.className = 'ge-popup__item-mark'
    paintMark(icon, r.level, ROW_ICON, loud ? 'level' : 'quiet')

    const body = root.createElement('span')
    body.className = 'ge-popup__item-text'
    body.textContent = r.text

    // **걸린 항목에만, 설명할 말이 있을 때만 펼침을 단다.**
    // 🟢·⚪ 에 달면 일곱 줄이 전부 눌리는 것처럼 보인다.
    const 펼칠수있다 = kind === 'page' && loud && canExplain(r.id)
    if (!펼칠수있다) {
      const head = root.createElement('span')
      head.className = 'ge-popup__item-name'
      head.textContent = r.name
      li.append(icon, head, body)
      items.append(li)
      continue
    }

    const why = root.createElement('ul')
    why.className = 'ge-popup__why'
    why.hidden = true

    const head = root.createElement('button')
    head.className = 'ge-popup__item-name ge-popup__item-open'
    head.type = 'button'
    head.setAttribute('aria-expanded', 'false')
    head.append(root.createTextNode(r.name), createIcon(root, UI_ICON.expand, { size: 12 }))

    let asked = false
    head.onclick = () => {
      why.hidden = !why.hidden
      head.setAttribute('aria-expanded', String(!why.hidden))
      if (why.hidden || asked) return
      asked = true
      // **누를 때만 나간다.** 기사를 여는 것만으로는 한 건도 나가지 않는다.
      drawWhy(why, [{ text: content.badge.PENDING.name }], root)
      void askExplain(r.id, r.level as ExplainLevel).then((res) =>
        drawWhy(why, explainLines(r.id, res, r.level), root),
      )
    }

    li.append(icon, head, body, why)
    items.append(li)
  }
}

/**
 * 판정 아래의 **제품 정보와 판단 근거**를 그린다.
 *
 */
function drawFrame(state: TabState, root: Document, kind: 'page' | 'selection'): void {
  drawChrome(
    APP,
    {
      ...readFacts(),
      // **판단한 적이 없으면 근거를 말하지 않는다.** 기사 페이지가 아닌 곳에서도
      // "제목과 본문을 살펴본 결과입니다" 가 뜨면 **하지 않은 일을 했다고 말하는 것**이다.
      basis: state.verdict ? kind : undefined,
      sentences: sentencesOf(state.verdict),
      // **덜 본 것을 말한다.** 문장 상한에 걸려 뒤쪽이 빠졌으면 그렇게 적는다 —
      // 조용히 덜 보면 화면은 다 본 것처럼 보인다 (lib/judge.ts 의 MAX_SENTENCES).
      capped: state.verdict?.capped === true,
      lowConfidence: isLowConfidence(state),
    },
    root,
  )
}

/**
 * 🟡 이 **점수 때문이 아니라 확신 때문**인가.
 *
 * `decideBadge` 는 주의 신호를 셀 때 **확신도 높은 것만** 센다. 그래서 점수가
 * 주의 쪽인 항목이 있어도 모델이 확신하지 못했으면 🔴 이 되지 못하고 🟡 에 머문다.
 * 화면은 지금까지 그 둘을 같은 말로 보여 줬다 (PR #20 리뷰).
 */
/** 제보 자리. **아직 아무것도 보내지 않는다** (GE-26). */
function drawWrongButton(root: Document): void {
  const btn = root.getElementById('report-wrong')
  if (!btn) return
  btn.textContent = content.report.wrong
  btn.onclick = () => {
    btn.textContent = content.report.wrongSoon
  }
}

function isLowConfidence(state: TabState): boolean {
  if (state.level !== 'CHECK') return false
  return (state.verdict?.items ?? []).some(
    (it) => it.score !== null && it.score >= ITEM_CAUTION_AT && !it.isConfident,
  )
}

// ── 공개 기록 리포트 ──────────────────────────────────────────────────────
//
// **팝업은 본문을 모른다.** 콘텐츠 스크립트에 부탁하고, 만드는 일은 background 가
// 한다. 스무 초가 걸려서 답을 기다리지 않는다 — 진행은 storage.session 으로 온다.
// 팝업을 닫았다 열어도 이어서 보인다 (lib/report.ts).

const R = content.report

/**
 * 들고 있는 리포트가 **지금 보고 있는 기사의 것인가.**
 *
 * 리포트는 하나만 둔다 (lib/report.ts — 쌓이면 그것이 곧 열람 기록이다). 그래서
 * **주소를 견주지 않으면 남의 리포트를 열어 준다.** 실제로 그랬다: A 기사에서 만든
 * 리포트가 남은 채 B 기사에서 누르면 버튼이 "열기" 로 떠 있고, 눌렀더니 A 가 열렸다.
 *
 * `normalizeUrl` 로 견준다 — 같은 기사가 `/article/` 과 `/mnews/article/` 두 길로
 * 열리고 뒤에 `?iid=` 가 붙는다. 글자 그대로 대면 같은 기사도 남이 된다.
 */
function sameArticle(r: Report | null, here: string | undefined): boolean {
  if (!r || !here) return false
  try {
    return normalizeUrl(r.url) === normalizeUrl(here)
  } catch {
    return false
  }
}

/** 아직 만드는 중인가. 끝난 것(`done`)과 엎어진 것(`failed`)만 아니다. */
const 만드는중 = (r: Report | null): boolean =>
  r?.stage === 'claims' || r?.stage === 'records' || r?.stage === 'brief'

/**
 * 조사가 **멈춘 것으로 치는** 시간.
 *
 * 리포트 한 건은 스무 초쯤 걸린다. 그런데 MV3 의 service worker 는 **일하는 중에도
 * 꺼진다** — 그러면 `storage.session` 에 `records` 인 채로 남고, 브라우저를 닫기
 * 전까지 그대로다. 그 상태를 "도는 중" 으로 읽으면 **단추가 영영 잠긴다.**
 *
 * 3분은 가장 느린 경우(주장 셋 × 검색 5초 + 글 30초)의 몇 배다.
 */
const STALE_AFTER_MS = 3 * 60 * 1000

/** 지금도 돌고 있다고 믿어도 되는가. */
const 도는중 = (r: Report | null): boolean => 만드는중(r) && Date.now() - (r?.at ?? 0) < STALE_AFTER_MS

/**
 * 쓸 수 있는 리포트만 남긴다. **멈춘 것은 없는 것으로 본다** —
 * 그래야 단추가 "만들기" 로 돌아가 다시 시작할 수 있다.
 */
const 살아있는 = (r: Report | null): Report | null => (만드는중(r) && !도는중(r) ? null : r)

/** 지금 상태에 맞는 버튼 글과 눌러도 되는지. */
function reportFace(r: Report | null): { label: string; busy: boolean; note?: string } {
  if (!r) return { label: R.button, busy: false }
  switch (r.stage) {
    case 'claims':
      return { label: R.progress.claims, busy: true }
    case 'records': {
      const done = r.claims.filter((c) => !c.pending).length
      return { label: `${R.progress.records} ${done}/${r.claims.length}`, busy: true }
    }
    case 'brief':
      return { label: R.progress.brief, busy: true }
    case 'done':
      return { label: R.open, busy: false }
    case 'failed':
      return { label: R.button, busy: false, note: r.reason === 'no_claims' ? R.noClaims : R.failed }
  }
}

/** 리포트 자리를 그린다. **걸린 항목이 있을 때만 보인다.** */
function drawReport(
  rows: readonly ReportRow[],
  kind: 'page' | 'selection',
  root: Document,
  here?: string,
): void {
  const box = root.getElementById('report-box')
  const btn = root.getElementById('report-run') as HTMLButtonElement | null
  const note = root.getElementById('report-note')
  if (!box || !btn || !note) return

  // **기사라면 늘 보인다.** 신호가 없어도 주변 기록은 있다 — 리포트의 주된 일은
  // 흠을 보충하는 것이 아니라 **한 기사가 전하지 못하는 것을 옆에 놓는 것**이다.
  //
  // ③ 선택 글에는 보이지 않는다. 기사 주소도 날짜도 없어 기록을 찾을 수가 없다.
  // 판단한 적이 없는 페이지(기사가 아닌 곳)에도 보이지 않는다.
  box.hidden = kind !== 'page' || rows.length === 0
  if (box.hidden) return

  // **다른 기사의 리포트는 없는 것으로 본다.** 그래야 버튼이 "만들기" 로 돌아간다.
  const mine = (r: Report | null) => (sameArticle(r, here) ? r : null)

  const paint = (raw: Report | null) => {
    const r = 살아있는(raw)
    const face = reportFace(mine(r))

    // **남의 조사가 돌고 있으면 기다린다.**
    //
    // 리포트 칸은 하나뿐이다 (lib/report.ts — 쌓이면 그것이 곧 열람 기록이다).
    // A 기사를 조사하는 중에 B 기사에서 또 누르면 둘이 같은 칸에 번갈아 쓰면서
    // 진행도 결과도 뒤섞인다. **남의 것을 "없는 것으로 보는" 처리가 열어 둔 길**이다 —
    // 그 전에는 `reportFace` 가 busy 를 돌려줘서 막혀 있었다.
    const 남이도는중 = mine(r) === null && 도는중(r)

    btn.textContent = face.label
    btn.disabled = face.busy || 남이도는중
    // **왜 눌리지 않는지 말한다.** 말없이 막힌 단추는 고장으로 읽힌다.
    const 한줄 = 남이도는중 ? R.waiting : face.note
    note.hidden = !한줄
    note.textContent = 한줄 ?? ''
  }

  void (async () => {
    try {
      const got = (await browser.storage.session.get(REPORT_KEY)) as Record<string, Report | undefined>
      paint(got[REPORT_KEY] ?? null)
    } catch {
      paint(null)
    }
  })()

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'session' || !changes[REPORT_KEY]) return
    paint((changes[REPORT_KEY].newValue as Report | undefined) ?? null)
  })

  btn.onclick = () => {
    void (async () => {
      // **이 기사의** 리포트가 다 돼 있으면 연다. 남의 것이면 새로 만든다.
      try {
        const got = (await browser.storage.session.get(REPORT_KEY)) as Record<string, Report | undefined>
        const have = 살아있는(got[REPORT_KEY] ?? null)
        if (mine(have)?.stage === 'done') {
          await browser.tabs.create({ url: browser.runtime.getURL('/report.html') })
          return
        }
        // **돌고 있는 것이 있으면 시작하지 않는다.** 그리는 쪽에서 이미 막지만,
        // 팝업을 연 뒤에 시작된 조사도 있다 — 누르는 순간 다시 본다.
        if (도는중(have)) {
          paint(have)
          return
        }
      } catch {
        /* 못 읽었으면 새로 만든다 */
      }

      btn.disabled = true
      btn.textContent = R.progress.claims
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
      if (tab?.id === undefined) return
      const msg: MakeReportMessage = { kind: 'make-report', rows: [...rows] }
      const answer = (await browser.tabs.sendMessage(tab.id, msg).catch(() => null)) as MakeReportAnswer | null
      if (!answer?.ok) {
        btn.disabled = false
        btn.textContent = R.button
        note.hidden = false
        // **왜 못 만드는지 말한다.** 셋을 가른다.
        //
        // 답이 **아예 없으면** 그 탭이 옛 코드를 들고 있는 것이다 — 확장을 새로 넣거나
        // 고쳐도 **이미 열려 있던 탭의 콘텐츠 스크립트는 바뀌지 않는다.** 크롬은
        // 페이지를 다시 불러올 때만 새로 넣는다. 그때 "다시 눌러 보세요" 는 **틀린 안내**다 —
        // 몇 번을 눌러도 안 된다. 실제로 이 자리에서 세 번 헤맸다.
        note.textContent = !answer
          ? R.reload
          : answer.reason === 'no_date'
            ? R.noDate
            : R.failed
      }
    })()
  }
}

export { render, renderTooLong, readTabState, drawSelection, run, readFacts, reportFace, sameArticle }

// 테스트에서 이 파일을 불러도 팝업이 멋대로 열리지 않게 한다.
// 팝업 문서에서만 실제로 그린다.
if (typeof document !== 'undefined' && document.getElementById('items')) {
  void run()
}
