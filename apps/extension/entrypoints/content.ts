// 기사 페이지에 끼어들어 배지를 그리는 부분이다.
//
// 배지는 Shadow DOM 안에 넣는다. 그래야 기사 페이지의 CSS 가 우리 배지를
// 망가뜨리지 않고, 우리 CSS 도 기사 화면을 망가뜨리지 않는다.
//
// **판단 호출은 여기서 하지 않는다.** background 로 보낸다 (lib/protocol.ts 참고).
import '../assets/content.css'
import { ARTICLE_EXCLUDE_MATCHES, ARTICLE_MATCHES, TEST_FIXTURE_MATCHES } from '../match-patterns'
import content from '../../../packages/content/ui.ko.json'
import { findEvidence } from '@genuearly/shared'
import { packPicks, readExplain, unpackPicks, writeExplain } from '../lib/cache'
import { extractArticle } from '../lib/extract'
import { TOAST_MS, createToast } from '../lib/toast'
import { createIcon } from '../lib/icon'
import { LEVEL_ICON, LEVEL_INK, LEVEL_INK_DARK } from '../lib/item-view'
import type {
  ArticleVerdict,
  DisplayLevel,
  ExplainRequestMessage,
  MakeReportAnswer,
  MakeReportMessage,
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
  //
  // 개발 빌드에서는 수동 테스트 자료도 받는다. `import.meta.env.DEV` 는 빌드 때
  // 상수로 접히므로 **배포본 번들에는 이 주소들이 남지 않는다.**
  matches: [...ARTICLE_MATCHES, ...(import.meta.env.DEV ? TEST_FIXTURE_MATCHES : [])],

// **댓글 화면에서는 아예 돌지 않는다.** 주소에 `article` 이 들어 있지만 본문이 없어
  // 지금까지 ⚪ 배지가 떴다 — 판단해 보고 실패한 것처럼 보이지만 기사 페이지가 아니다.
  // `isArticleUrl` 도 같은 목록을 보고 뺀다 (match-patterns.ts).
  excludeMatches: [...ARTICLE_EXCLUDE_MATCHES],

  // 'ui' 로 두면 위에서 import 한 CSS 가 페이지가 아니라 Shadow DOM 안으로 들어간다.
  cssInjectionMode: 'ui',

  async main(ctx) {
    const article = extractArticle()
    const badge = createBadge()
    const toast = createToast()
    const ui = await createShadowRootUi(ctx, {
      name: 'genuearly-badge',
      position: 'inline',
      anchor: 'body',

      // WXT 기본값은 'open' 이다. 'open' 이면 기사 페이지의 스크립트가
      // host.shadowRoot 로 우리 배지를 읽고 바꿀 수 있다.
      // docs/security/secure-coding.md 4절이 'closed' 를 기본으로 정하고 있다.
      mode: 'closed',

      onMount: (container) => { container.append(badge.el, toast.el) },
    })
    ui.mount()

    // **팝업은 background 가 아니라 여기에 묻는다** (lib/protocol.ts 의 TabStateMessage).
    // 탭별 판정을 어딘가에 쌓아 두면 그것이 곧 열람 기록이 된다.
    //
    // **보낸 곳을 확인한다.** 이 핸들러는 판정 전체를 돌려준다
    // (AGENT.md 전역 규칙, docs/security/secure-coding.md 5절).
    browser.runtime.onMessage.addListener(
      (raw: TabStateMessage | ExplainRequestMessage | MakeReportMessage, sender) => {
      if (sender.id !== browser.runtime.id) return
      // 주소를 함께 보낸다 — 팝업은 자기 힘으로 지금 기사가 무엇인지 알 수 없다.
      if (raw?.kind === 'get-tab-state') {
        return Promise.resolve({ ...badge.state(), url: location.href } satisfies TabState)
      }

      // **리포트도 본문이 여기서만 나간다.** 팝업은 판정만 넘기고 부탁한다.
      // 만드는 일은 background 가 하고, 진행은 storage.session 으로 전해진다 —
      // 스무 초가 걸려서 메시지로 기다리면 팝업이 닫히는 순간 날아간다.
      if (raw?.kind === 'make-report') {
        if (!article) return Promise.resolve({ ok: false, reason: 'not_article' } satisfies MakeReportAnswer)
        // **날짜가 없으면 만들지 않는다.** 날짜 없이 기록을 맞추면 다른 날 기록에
        // "뒷받침됨" 이 뜬다 (실측 21%, apps/proxy/src/records.ts).
        if (!article.date) return Promise.resolve({ ok: false, reason: 'no_date' } satisfies MakeReportAnswer)
        const ask: Message = {
          kind: 'build-report',
          url: location.href,
          headline: article.headline,
          date: article.date,
          body: article.body,
          rows: raw.rows,
        }
        void browser.runtime.sendMessage(ask).catch((e) => {
          console.warn('[GenuEarly] 리포트를 만들지 못했다', e)
        })
        return Promise.resolve({ ok: true } satisfies MakeReportAnswer)
      }

      // **본문은 여기서만 나간다.** 팝업은 본문을 받지 않는다 (secure-coding.md 6절).
      // 팝업이 "이 항목을 설명해 달라" 고만 하고, 본문을 들고 있는 우리가 물어본 뒤
      // **답만** 돌려준다. 기사를 못 읽었으면 물어볼 것도 없다.
      if (raw?.kind === 'explain-item') {
        if (!article) return Promise.resolve(null)
        const itemId = raw.itemId

        // **코드가 찾는 것은 여기서 끝난다.** 바깥에 묻지 않는다 — 글자가 거기 있는지는
        // 문자열 찾기지 판단이 아니다 (docs/jev.md 3절 "피해야 할 것").
        const spans: Record<string, string[]> = {}
        for (const e of findEvidence(itemId, { headline: article.headline, body: article.body })) {
          spans[e.id] = e.spans.map((x) => x.text)
        }

        const body = article.body
        const ask: Message = {
          kind: 'judge-explain',
          url: location.href,
          body,
          itemId,
          // 판정은 **이미 나와 있다.** 바깥에 다시 묻는 것이 아니라 적어 보낼 뿐이다.
          level: raw.level,
          // 코드가 빈손이면 LLM 에 넘긴다. 찾았으면 부르지 않는다 (lib/judge.ts).
          noEvidence: Object.values(spans).every((v) => v.length === 0),
        }

        return (async () => {
          // **받아 둔 답이 있으면 그것을 쓴다.** 생성 모델은 같은 글에도 매번 다르게
          // 답한다. 눌렀다 접었다 할 때마다 짚는 문장이 바뀌면 어느 쪽을 믿어야 할지
          // 알 수 없다. 캐시가 곧 **재현성**이다 (lib/cache.ts).
          const hit = await readExplain(location.href, itemId, raw.level)
          if (hit) {
            const picks = await unpackPicks(body, hit.p)
            return { itemId, found: hit.f, spans, ...(picks.length ? { picks } : {}) }
          }

          const res = await browser.runtime.sendMessage(ask).catch((e) => {
            // Jev 쪽이 실패해도 **코드가 찾은 것은 보여 준다.**
            console.warn('[GenuEarly] 심층 분석을 받지 못했다', e)
            return null
          })
          const out = res as
            | { found?: Record<string, boolean>; picks?: { text: string; why: string }[] }
            | null
          if (!out) return Object.keys(spans).length === 0 ? null : { itemId, found: {}, spans }

          // **집어 온 글자를 여기서 또 대조한다.** 중계 서버와 background 에 이어 셋째다.
          // 본문을 들고 있는 것은 우리뿐이라, 마지막으로 거를 수 있는 자리이기도 하다.
          const picks = (out.picks ?? []).filter((x) => body.includes(x.text))
          const found = out.found ?? {}
          // 받은 답만 적어 둔다. 못 받은 것을 적어 두면 6시간 동안 빈 채로 보인다.
          await writeExplain(location.href, itemId, {
            lv: raw.level,
            f: found,
            p: await packPicks(body, picks),
          })
          return { itemId, found, spans, ...(picks.length ? { picks } : {}) }
        })()
      }
      return
      },
    )

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
      // **판단이 나왔을 때만 알린다.** ⚪ 는 결과이긴 하지만, "결과를 보려면 누르세요"
      // 하고 불러 놓고 "판단하지 못했습니다" 를 보여 주는 것은 헛걸음을 시키는 일이다.
      if (verdict && verdict.level !== 'UNDETERMINED') toast.show(TOAST_MS)
    } catch (e) {
      // service worker 가 죽었거나 확장이 다시 로드됐다. ⚪ 는 실패가 아니라 결과다.
      console.warn('[GenuEarly] 판단을 받지 못했다', e)
      badge.render('UNDETERMINED')
      toast.hide()
    }
  },
})
