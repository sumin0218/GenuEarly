// 기사 페이지에 끼어들어 배지를 그리는 부분이다.
//
// 배지는 Shadow DOM 안에 넣는다. 그래야 기사 페이지의 CSS 가 우리 배지를
// 망가뜨리지 않고, 우리 CSS 도 기사 화면을 망가뜨리지 않는다.
//
// **판단 호출은 여기서 하지 않는다.** background 로 보낸다 (lib/protocol.ts 참고).
import '../assets/content.css'
import { ARTICLE_MATCHES } from '../match-patterns'
import content from '../../../packages/content/ui.ko.json'
import { extractArticle } from '../lib/extract'
import { createIcon } from '../lib/icon'
import { LEVEL_ICON, LEVEL_INK, LEVEL_INK_DARK, toRows } from '../lib/item-view'
import type { ArticleVerdict, DisplayLevel, Message, TabState, TabStateMessage } from '../lib/protocol'

/** 접힌 줄의 아이콘 크기(px). 글자(14px)와 같은 줄에 선다. */
const HEAD_ICON = 16
/** 펼친 항목 줄의 아이콘 크기(px). */
const ROW_ICON = 14

/**
 * 단계 아이콘을 자리에 그린다. 팝업의 같은 이름 함수와 규칙이 같다
 * (entrypoints/popup/main.ts) — **색표의 원본은 lib/item-view.ts 하나다.**
 *
 * 밝은 쪽·어두운 쪽 값을 둘 다 넣고 어느 쪽을 쓸지는 CSS 가 고른다.
 * `tone: 'quiet'` 는 색을 주지 않는다 — 걸리지 않은 항목 줄이 그렇다.
 */
function paintMark(el: HTMLElement, level: DisplayLevel, size: number, tone: 'level' | 'quiet' = 'level'): void {
  if (tone === 'level') {
    el.style.setProperty('--ge-level-light', LEVEL_INK[level])
    el.style.setProperty('--ge-level-dark', LEVEL_INK_DARK[level])
  } else {
    el.style.removeProperty('--ge-level-light')
    el.style.removeProperty('--ge-level-dark')
  }
  el.replaceChildren(createIcon(document, LEVEL_ICON[level], { size }))
}

/** 배지 DOM 을 만든다. `innerHTML` 을 쓰지 않는다 (docs/security/secure-coding.md 4절). */
function createBadge() {
  const el = document.createElement('div')
  el.className = 'ge-badge'

  const head = document.createElement('div')
  head.className = 'ge-badge__head'
  const mark = document.createElement('span')
  mark.className = 'ge-badge__mark'
  const label = document.createElement('span')
  label.className = 'ge-badge__label'
  head.append(mark, label)

  const detail = document.createElement('div')
  detail.className = 'ge-badge__detail'
  detail.hidden = true

  el.append(head, detail)

  // **키보드로도 펼칠 수 있어야 한다.** 눌러서 펼치는 것이 배지의 유일한 기능인데
  // `div` 에 클릭만 달아 두면 마우스 없이는 "왜 이 판정인가" 에 닿을 길이 없다.
  el.setAttribute('role', 'button')
  el.tabIndex = 0
  function toggle(): void {
    detail.hidden = !detail.hidden
    el.setAttribute('aria-expanded', String(!detail.hidden))
  }
  el.setAttribute('aria-expanded', 'false')
  el.addEventListener('click', toggle)
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    // 스페이스로 페이지가 스크롤되지 않게 한다.
    e.preventDefault()
    toggle()
  })

  let state: TabState = { level: 'PENDING' }

  function render(level: DisplayLevel, verdict?: ArticleVerdict): void {
    state = { level, verdict }
    el.dataset.level = level
    paintMark(mark, level, HEAD_ICON)
    label.textContent = content.badge[level].name
    detail.replaceChildren()

    // 일곱 항목을 전부 보여 준다. 규칙은 lib/item-view 가 원본이다 — 팝업도 같은 것을 쓴다.
    const rows = toRows(verdict)

    if (rows.length === 0) {
      // 판단을 하나도 못 했다 — 기사 구조를 못 읽었거나 중계가 전부 실패했다.
      const note = document.createElement('div')
      note.className = 'ge-badge__note'
      note.textContent = content.undetermined.description
      detail.append(note)
      return
    }
    for (const r of rows) {
      const row = document.createElement('div')
      row.className = 'ge-badge__row'
      row.dataset.level = r.level

      // **걸린 줄에만 색이 들어간다** (docs/design.md). 팝업과 같은 규칙이다.
      const loud = r.level === 'CAUTION' || r.level === 'CHECK'
      const icon = document.createElement('span')
      icon.className = 'ge-badge__row-mark'
      paintMark(icon, r.level, ROW_ICON, loud ? 'level' : 'quiet')

      const name = document.createElement('span')
      name.className = 'ge-badge__row-name'
      name.textContent = r.name
      const body = document.createElement('span')
      body.className = 'ge-badge__row-text'
      body.textContent = r.text

      row.append(icon, name, body)
      detail.append(row)
    }
  }

  render('PENDING')
  return { el, render, state: () => state }
}

export default defineContentScript({
  // 대상 페이지의 원본은 match-patterns.ts 다. host_permissions 와 같은 값을 쓴다.
  matches: [...ARTICLE_MATCHES],

  // 'ui' 로 두면 위에서 import 한 CSS 가 페이지가 아니라 Shadow DOM 안으로 들어간다.
  cssInjectionMode: 'ui',

  async main(ctx) {
    const article = extractArticle()
    const badge = createBadge()
    const ui = await createShadowRootUi(ctx, {
      name: 'genuearly-badge',
      position: 'inline',
      anchor: 'body',

      // WXT 기본값은 'open' 이다. 'open' 이면 기사 페이지의 스크립트가
      // host.shadowRoot 로 우리 배지를 읽고 바꿀 수 있다.
      // docs/security/secure-coding.md 4절이 'closed' 를 기본으로 정하고 있다.
      mode: 'closed',

      onMount: (container) => { container.append(badge.el) },
    })
    ui.mount()

    // **팝업은 background 가 아니라 여기에 묻는다** (lib/protocol.ts 의 TabStateMessage).
    // 탭별 판정을 어딘가에 쌓아 두면 그것이 곧 열람 기록이 된다.
    //
    // **보낸 곳을 확인한다.** 이 핸들러는 판정 전체를 돌려준다
    // (AGENT.md 전역 규칙, docs/security/secure-coding.md 5절).
    browser.runtime.onMessage.addListener((msg: TabStateMessage, sender) => {
      if (sender.id !== browser.runtime.id || msg?.kind !== 'get-tab-state') return
      return Promise.resolve(badge.state())
    })

    if (!article) {
      // **기사 구조를 못 읽었다. 그래도 ⚪ 를 띄운다** (docs/requirements.md 2절).
      // 배지를 아예 안 띄우면 사용자는 확장이 죽은 것인지 판단을 못 한 것인지 알 수 없다.
      // ⚪ 는 실패가 아니라 결과다.
      console.warn('[GenuEarly] 기사 구조를 읽지 못했다')
      badge.render('UNDETERMINED')
      return
    }

    const msg: Message = {
      kind: 'judge-article',
      url: location.href,
      headline: article.headline,
      body: article.body,
      sentences: article.sentences,
    }

    try {
      const verdict = (await browser.runtime.sendMessage(msg)) as ArticleVerdict | undefined
      badge.render(verdict?.level ?? 'UNDETERMINED', verdict)
    } catch (e) {
      // service worker 가 죽었거나 확장이 다시 로드됐다. ⚪ 는 실패가 아니라 결과다.
      console.warn('[GenuEarly] 판단을 받지 못했다', e)
      badge.render('UNDETERMINED')
    }
  },
})
