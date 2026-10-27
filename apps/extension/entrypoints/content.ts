// 기사 페이지에 끼어들어 배지를 그리는 부분이다.
//
// 배지는 Shadow DOM 안에 넣는다. 그래야 기사 페이지의 CSS 가 우리 배지를
// 망가뜨리지 않고, 우리 CSS 도 기사 화면을 망가뜨리지 않는다.
//
// **판단 호출은 여기서 하지 않는다.** background 로 보낸다 (lib/protocol.ts 참고).
import '../assets/content.css'
import { ARTICLE_EXCLUDE_MATCHES, ARTICLE_MATCHES } from '../match-patterns'
import content from '../../../packages/content/ui.ko.json'
import { extractArticle } from '../lib/extract'
import { createIcon } from '../lib/icon'
import { LEVEL_ICON, LEVEL_INK, LEVEL_INK_DARK } from '../lib/item-view'
import type {
  ArticleVerdict,
  DisplayLevel,
  ExplainRequestMessage,
  Message,
  TabState,
  TabStateMessage,
} from '../lib/protocol'

/** 아이콘 크기(px). 글자(14px)와 같은 줄에 선다. */
const MARK_SIZE = 16

/**
 * 단계 아이콘을 그린다. 팝업의 같은 이름 함수와 규칙이 같다
 * (entrypoints/popup/main.ts) — **색표의 원본은 lib/item-view.ts 하나다.**
 *
 * 밝은 쪽·어두운 쪽 값을 둘 다 넣고 어느 쪽을 쓸지는 CSS 가 고른다.
 */
function paintMark(el: HTMLElement, level: DisplayLevel): void {
  el.style.setProperty('--ge-level-light', LEVEL_INK[level])
  el.style.setProperty('--ge-level-dark', LEVEL_INK_DARK[level])
  el.replaceChildren(createIcon(document, LEVEL_ICON[level], { size: MARK_SIZE }))
}

/**
 * 배지 DOM 을 만든다. `innerHTML` 을 쓰지 않는다 (docs/security/secure-coding.md 4절).
 *
 * **한 줄이다.** 아이콘과 단계 이름뿐이고 펼쳐지지 않는다.
 *
 * 전에는 눌러서 항목 일곱 줄을 펼칠 수 있었다. 두 가지가 잘못이었다.
 *
 *   1. **기사를 가린다.** 읽으려고 연 화면 위에 우리 상자가 일곱 줄을 덮는다.
 *      사용자가 지금 하려는 일은 기사를 읽는 것이지 우리 설명을 읽는 것이 아니다
 *   2. **팝업과 같은 것을 두 곳에서 보여 준다.** 항목 일곱 줄과 판단 근거는
 *      팝업이 더 넓게, 기사를 가리지 않고 보여 준다 (GE-45)
 *
 * 그래서 배지는 **"무엇이 보이는가" 한 줄**만 맡는다. "왜 그런가" 는 팝업이 맡는다.
 * 누를 것이 없으므로 `role="button"`·`tabindex` 도 두지 않는다 — 눌리지 않는 것을
 * 눌리는 것처럼 보이게 하지 않는다.
 */
function createBadge() {
  const el = document.createElement('div')
  el.className = 'ge-badge'

  const mark = document.createElement('span')
  mark.className = 'ge-badge__mark'
  const label = document.createElement('span')
  label.className = 'ge-badge__label'
  el.append(mark, label)

  let state: TabState = { level: 'PENDING' }

  function render(level: DisplayLevel, verdict?: ArticleVerdict): void {
    // **판정 전체는 그대로 들고 있는다.** 화면에 적지 않을 뿐이고,
    // 팝업이 이 값을 물어 간다 (아래 onMessage).
    state = { level, verdict }
    el.dataset.level = level
    paintMark(mark, level)
    label.textContent = content.badge[level].name
  }

  render('PENDING')
  return { el, render, state: () => state }
}

export default defineContentScript({
  // 대상 페이지의 원본은 match-patterns.ts 다. host_permissions 와 같은 값을 쓴다.
  matches: [...ARTICLE_MATCHES],

  // **댓글 화면에서는 아예 돌지 않는다.** `/mnews/article/*` 의 `*` 가 경로 나머지를
  // 전부 덮어서 `/mnews/article/comment/…` 까지 잡힌다. 거기에는 본문이 없어
  // 지금까지 ⚪ 배지가 떴다 — 판단해 보고 실패한 것처럼 보이지만 기사 페이지가 아니다.
  // `isArticleUrl` 도 같은 목록을 보고 뺀다 (match-patterns.ts).
  excludeMatches: [...ARTICLE_EXCLUDE_MATCHES],

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
    browser.runtime.onMessage.addListener((raw: TabStateMessage | ExplainRequestMessage, sender) => {
      if (sender.id !== browser.runtime.id) return
      if (raw?.kind === 'get-tab-state') return Promise.resolve(badge.state())

      // **본문은 여기서만 나간다.** 팝업은 본문을 받지 않는다 (secure-coding.md 6절).
      // 팝업이 "이 항목을 설명해 달라" 고만 하고, 본문을 들고 있는 우리가 물어본 뒤
      // **답만** 돌려준다. 기사를 못 읽었으면 물어볼 것도 없다.
      if (raw?.kind === 'explain-item') {
        if (!article) return Promise.resolve(null)
        const ask: Message = {
          kind: 'judge-explain',
          url: location.href,
          body: article.body,
          itemId: raw.itemId,
        }
        return browser.runtime.sendMessage(ask).catch((e) => {
          console.warn('[GenuEarly] 심층 분석을 받지 못했다', e)
          return null
        })
      }
      return
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
