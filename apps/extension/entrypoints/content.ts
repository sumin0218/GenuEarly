// 기사 페이지에 끼어들어 배지를 그리는 부분이다.
//
// 배지는 Shadow DOM 안에 넣는다. 그래야 기사 페이지의 CSS 가 우리 배지를
// 망가뜨리지 않고, 우리 CSS 도 기사 화면을 망가뜨리지 않는다.
//
// **판단 호출은 여기서 하지 않는다.** background 로 보낸다 (lib/protocol.ts 참고).
import '../assets/content.css'
import { ARTICLE_MATCHES } from '../match-patterns'
import { extractArticle } from '../lib/extract'
import type { ArticleVerdict, BadgeLevel, Message } from '../lib/protocol'

// TODO(GE-16): 사용자에게 보이는 말은 packages/content 에서 ChatKHU 로 만든다.
//   지금은 흐름을 확인하려고 임시로 둔다.
const TEXT: Record<BadgeLevel, { mark: string; label: string }> = {
  PENDING: { mark: '⋯', label: '살펴보는 중' },
  SAFE: { mark: '🟢', label: '눈에 띄는 신호 없음' },
  CHECK: { mark: '🟡', label: '확인해 볼 점이 있음' },
  CAUTION: { mark: '🔴', label: '주의가 필요한 신호' },
  UNDETERMINED: { mark: '⚪', label: '판단하지 못함' },
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
    mark.textContent = TEXT[level].mark
    label.textContent = TEXT[level].label
    detail.replaceChildren()
    for (const it of verdict?.items ?? []) {
      const row = document.createElement('div')
      row.className = 'ge-badge__row'
      row.dataset.level = it.level
      row.textContent = `${TEXT[it.level].mark} ${it.id}`
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
    if (!article) {
      // 기사 구조를 못 읽었다. 배지를 띄우지 않는다 — 틀린 자리에 뜨는 것보다 낫다.
      console.warn('[GenuEarly] 기사 구조를 읽지 못했다')
      return
    }

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
