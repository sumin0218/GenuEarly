// 아이콘을 누르면 열리는 팝업. **권한이 필요 없다** — `action` 키로 연다
// (docs/requirements.md 2-1절).
//
// 여기가 "왜 이 배지인가" 를 보여 주는 자리다. 기사 위 배지에도 같은 내용이 있지만,
// 배지는 사용자가 닫을 수 있고 기사가 아닌 탭에서는 아예 없다.
//
// **점수 숫자를 쓰지 않는다.** 정밀해 보이는 숫자는 단정으로 읽힌다 (docs/product.md 6절).
import './style.css'
import content from '../../../../packages/content/ui.ko.json'
import { createIcon } from '../../lib/icon'
import { LEVEL_ICON, LEVEL_INK, LEVEL_INK_DARK, toRows } from '../../lib/item-view'
import {
  SELECTION_KEY,
  clearSelection,
  peekSelection,
  type SelectionOutcome,
  type SelectionRecord,
} from '../../lib/selection'
import type { DisplayLevel, TabState, TabStateMessage } from '../../lib/protocol'

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

  items.replaceChildren()
  const rows = toRows(state.verdict)
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

    const head = root.createElement('span')
    head.className = 'ge-popup__item-name'
    head.textContent = r.name

    const body = root.createElement('span')
    body.className = 'ge-popup__item-text'
    body.textContent = r.text

    li.append(icon, head, body)
    items.append(li)
  }
}

export { render, renderTooLong, readTabState, drawSelection, run }

// 테스트에서 이 파일을 불러도 팝업이 멋대로 열리지 않게 한다.
// 팝업 문서에서만 실제로 그린다.
if (typeof document !== 'undefined' && document.getElementById('items')) {
  void run()
}
