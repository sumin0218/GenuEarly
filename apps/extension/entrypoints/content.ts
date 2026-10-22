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
import type { ArticleVerdict, BadgeLevel, Message } from '../lib/protocol'

// **사용자에게 보이는 말은 여기서 쓰지 않는다.** packages/content 가 원본이고
// 그 글은 ChatKHU 가 썼다 (GE-16, docs/product.md 6절).
// 여기 두는 것은 **글이 아닌 것** — 표시용 기호뿐이다.
const MARK: Record<BadgeLevel, string> = {
  PENDING: '⋯', SAFE: '🟢', CHECK: '🟡', CAUTION: '🔴', UNDETERMINED: '⚪',
}

/** 배지 DOM 을 만든다. `innerHTML` 을 쓰지 않는다 (docs/security/secure-coding.md 4절). */
function createBadge() {
  const el = document.createElement('div')
  el.className = 'ge-badge'

  const mark = document.createElement('span')
  mark.className = 'ge-badge__mark'
  const label = document.createElement('span')
  label.className = 'ge-badge__label'
  const detail = document.createElement('div')
  detail.className = 'ge-badge__detail'
  detail.hidden = true

  el.append(mark, label, detail)
  el.addEventListener('click', () => { detail.hidden = !detail.hidden })

  function render(level: BadgeLevel, verdict?: ArticleVerdict): void {
    el.dataset.level = level
    mark.textContent = MARK[level]
    label.textContent = content.badge[level].name
    detail.replaceChildren()

    // **일곱 항목을 전부 보여 준다.** 무엇을 검사했는지 알 수 있어야 하고,
    // 그래야 ⚪ 항목도 맥락 속에서 읽힌다. **걸린 것이 위로 온다.**
    const ORDER: Record<string, number> = { CAUTION: 0, CHECK: 1, UNDETERMINED: 2, SAFE: 3, PENDING: 4 }
    const rows = (verdict?.items ?? [])
      .flatMap((it) => {
        const c = content.items[it.id as keyof typeof content.items] as
          | { name: string; safe: string; signal: string; undetermined: string }
          | undefined
        if (!c || it.level === 'PENDING') return []
        const text = it.level === 'UNDETERMINED' ? c.undetermined : it.level === 'SAFE' ? c.safe : c.signal
        return [{ mark: MARK[it.level], level: it.level, name: c.name, text }]
      })
      .sort((a, b) => (ORDER[a.level] ?? 9) - (ORDER[b.level] ?? 9))

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
      const head = document.createElement('span')
      head.className = 'ge-badge__row-name'
      head.textContent = `${r.mark} ${r.name}`
      const body = document.createElement('span')
      body.className = 'ge-badge__row-text'
      body.textContent = r.text
      row.append(head, body)
      detail.append(row)
    }
  }

  render('PENDING')
  return { el, render }
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
