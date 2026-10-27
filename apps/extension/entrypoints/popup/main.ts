// 아이콘을 누르면 열리는 팝업. **권한이 필요 없다** — `action` 키로 연다
// (docs/requirements.md 2-1절).
//
// 여기가 "왜 이 배지인가" 를 보여 주는 자리다. 기사 위 배지에도 같은 내용이 있지만,
// 배지는 사용자가 닫을 수 있고 기사가 아닌 탭에서는 아예 없다.
//
// **점수 숫자를 쓰지 않는다.** 정밀해 보이는 숫자는 단정으로 읽힌다 (docs/product.md 6절).
import './style.css'
import content from '../../../../packages/content/ui.ko.json'
import { MARK, toRows } from '../../lib/item-view'
import type { TabState, TabStateMessage } from '../../lib/protocol'

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

/** `innerHTML` 을 쓰지 않는다 (docs/security/secure-coding.md 4절). */
function render(state: TabState, root: Document = document): void {
  const mark = root.getElementById('mark')
  const name = root.getElementById('name')
  const desc = root.getElementById('desc')
  const items = root.getElementById('items')
  if (!mark || !name || !desc || !items) return

  const copy = content.badge[state.level]
  root.body.dataset.level = state.level
  mark.textContent = MARK[state.level]
  name.textContent = copy.name
  desc.textContent = copy.description

  items.replaceChildren()
  const rows = toRows(state.verdict)
  if (rows.length === 0) {
    // 판단한 항목이 하나도 없다 — 기사 페이지가 아니거나, 본문을 못 읽었거나, 중계가 전부 실패했다.
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

    const head = root.createElement('span')
    head.className = 'ge-popup__item-name'
    head.textContent = `${r.mark} ${r.name}`

    const body = root.createElement('span')
    body.className = 'ge-popup__item-text'
    body.textContent = r.text

    li.append(head, body)
    items.append(li)
  }
}

export { render, readTabState }

// 테스트에서 이 파일을 불러도 팝업이 멋대로 열리지 않게 한다.
// 팝업 문서에서만 실제로 그린다.
if (typeof document !== 'undefined' && document.getElementById('items')) {
  void readTabState().then((s) => { render(s) })
}
