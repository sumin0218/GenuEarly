// ② 포털 목록에 끼어들어 제목 옆에 동그라미를 그린다 (docs/requirements.md 4절).
//
// **목록 전체를 한 번에 치지 않는다.** 화면에 보이는 제목부터 판단한다. 서른 개를 한꺼번에
// 보내면 중계 서버의 IP 당 한도(분당 60)를 한 사람이 혼자 쓴다.
//
// **판단 호출은 여기서 하지 않는다.** background 로 보낸다 (lib/protocol.ts).
import { PORTAL_LIST_EXCLUDE_MATCHES, PORTAL_LIST_MATCHES, TEST_FIXTURE_MATCHES } from '../match-patterns'
import content from '../../../packages/content/ui.ko.json'
import {
  LEGEND_CLASS,
  MARK_CLASS,
  collectTitles,
  createLegend,
  createMark,
  legendCollapsed,
  setLegendCollapsed,
} from '../lib/portal'
import type { DisplayLevel, HeadlineVerdict, JudgeHeadlineMessage } from '../lib/protocol'

/**
 * 동시에 보내는 요청 수.
 *
 * ②는 제목 하나에 요청 하나다. 중계 서버가 IP 당 분당 60, 전체 분당 110 에서 막는다
 * (apps/proxy/src/ratelimit.ts). 4 면 응답이 1초라도 분당 240 이 아니라 **화면에 보이는
 * 만큼만** 나간다 — 아래의 `IntersectionObserver` 가 보이지 않는 제목을 붙잡고 있기 때문이다.
 *
 * **측정으로 정한 값이 아니다** (requirements.md 4-1절 TODO).
 */
const MAX_CONCURRENT = 4

/** 목록이 다시 그려진 뒤 다시 훑기까지 기다리는 시간(ms). 스크롤 중 연속 변경을 한 번으로 모은다. */
const RESCAN_DEBOUNCE_MS = 300

/** 화면에 들어오기 **전에** 미리 판단을 시작하는 여유. 스크롤하면 이미 채워져 있게 한다. */
const PREFETCH_MARGIN = '200px'

/** 일을 `limit` 개씩만 돌린다. */
function runner(limit: number) {
  const waiting: (() => Promise<void>)[] = []
  let running = 0

  function pump(): void {
    while (running < limit && waiting.length > 0) {
      const job = waiting.shift()
      if (!job) return
      running++
      void job().finally(() => {
        running--
        pump()
      })
    }
  }

  return (job: () => Promise<void>) => {
    waiting.push(job)
    pump()
  }
}

/**
 * 표시 하나에 붙는 설명. **범례와 같은 말을 쓴다.**
 *
 * 전에는 배지 문구(`content.badge[level].name`)를 그대로 썼다. 그래서 아이콘에
 * 마우스를 올리면 "판단하지 못함", "주의할 신호 있음" 이 떴다. **그것은 기사 전체에
 * 대한 말이다** — 여기 표시는 제목만 보고 낸 것이라 같은 말을 쓰면 안 된다.
 * 범례를 따로 받아 둔 이유가 바로 그것인데(ChatKHU 15차) 정작 아이콘이 그 말을
 * 쓰지 않고 있었다.
 *
 * 이제 둘이 같은 말을 한다 — 범례에서 "끌어당기는 표현이 뚜렷합니다" 를 읽은 사람이
 * 아이콘에 마우스를 올리면 같은 문장을 본다.
 */
const 표시설명 = (level: DisplayLevel): string =>
  content.portal.legend.levels[level] ?? content.badge[level].name

export default defineContentScript({
  // 개발 빌드에서는 수동 테스트 자료의 목록 페이지도 받는다 (match-patterns.ts).
  matches: [...PORTAL_LIST_MATCHES, ...(import.meta.env.DEV ? TEST_FIXTURE_MATCHES : [])],
  // 기사 본문 페이지에서는 ①이 배지를 띄운다. ②까지 돌면 관련 기사 링크마다
  // 표시가 붙어 읽는 중에 끼어든다 (match-patterns.ts).
  excludeMatches: [...PORTAL_LIST_EXCLUDE_MATCHES],

  main(ctx) {
    // **기사 페이지에서는 돌지 않는다.** 테스트 자료는 목록과 기사가 같은 곳에 산다
    // (`file://`·localhost). 기사에서는 ①이 배지를 띄우는데 ②까지 돌면 "다음 →"
    // 링크에 표시가 붙어 읽는 중에 끼어든다 — 인사이트·위키트리에서 기사 본문을
    // 뺀 것과 같은 이유다. 주소가 아니라 모양으로 가른다 (lib/extract.ts 와 같은 잣대).
    if (import.meta.env.DEV && document.querySelector('article#article h1#headline')) return

    const enqueue = runner(MAX_CONCURRENT)

    // **한 번 다룬 제목은 다시 다루지 않는다.** 목록이 다시 그려질 때마다 훑어도
    // 여기서 걸러지므로 **같은 기사를 두 번 판단하지 않는다.**
    //
    // WeakSet 이라 포털이 그 요소를 버리면 우리 기록도 같이 사라진다. 우리가 "어떤 기사를
    // 봤는가" 의 목록을 들고 있지 않는다는 뜻이기도 하다.
    const handled = new WeakSet<HTMLAnchorElement>()

    const observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        observer.unobserve(e.target)
        const start = (e.target as HTMLElement & { geStart?: () => void }).geStart
        start?.()
      }
    }, { rootMargin: PREFETCH_MARGIN })

    function attach(url: string, headline: string, anchor: HTMLAnchorElement): void {
      const mark = createMark(document)
      mark.render('PENDING', 'headline', 표시설명('PENDING'))
      // 제목 **앞**에 넣는다. 뒤에 넣으면 제목이 두 줄로 접힐 때 홀로 다음 줄로 넘어간다.
      anchor.prepend(mark.host)

      // 화면에 들어왔을 때 실행할 일을 요소에 달아 둔다.
      const target = anchor as HTMLAnchorElement & { geStart?: () => void }
      target.geStart = () => {
        enqueue(async () => {
          const msg: JudgeHeadlineMessage = { kind: 'judge-headline', url, headline }
          try {
            const got = (await browser.runtime.sendMessage(msg)) as HeadlineVerdict | undefined
            if (!got) return mark.render('UNDETERMINED', 'headline', 표시설명('UNDETERMINED'))
            mark.render(got.level, got.basis, 표시설명(got.level))
          } catch {
            // service worker 가 죽었거나 확장이 다시 로드됐다. ⚪ 는 실패가 아니라 결과다.
            mark.render('UNDETERMINED', 'headline', 표시설명('UNDETERMINED'))
          }
        })
      }
      observer.observe(anchor)
    }

    function scan(): void {
      for (const t of collectTitles(document)) {
        if (handled.has(t.anchor)) continue
        handled.add(t.anchor)
        attach(t.url, t.headline, t.anchor)
      }
      // **훑을 때마다 본다.** 범례는 표시가 하나라도 붙은 뒤에 뜨는데, 포털이 목록을
      // 나중에 그리면 첫 표시도 나중에 생긴다. 처음 한 번만 보면 그 경우 아이콘은
      // 붙고 범례는 끝내 안 뜬다 — 닫은 적 없는 사용자가 "제목만 본 결과" 라는
      // 안내를 못 본다 (승원 리뷰 #39). 이미 띄웠으면 안에서 바로 돌아간다.
      void maybeShowLegend()
    }

    // --- 포털은 목록을 다시 그린다 ------------------------------------------
    //
    // **무한 루프가 돌지 않는다.** 우리가 동그라미를 넣으면 MutationObserver 가 다시 울리지만,
    // 다시 훑어도 `handled` 때문에 새로 넣을 것이 없어 거기서 멈춘다 (requirements.md 4-5절).
    // 아래의 `isOurs` 는 그 한 바퀴조차 돌지 않게 하는 덤이다.
    const OURS = `.${MARK_CLASS}, .${LEGEND_CLASS}`
    const isOurs = (n: Node): boolean => {
      const el = n.nodeType === Node.ELEMENT_NODE ? (n as Element) : n.parentElement
      if (el?.closest(OURS)) return true
      const cl = (n as Element).classList
      return Boolean(cl?.contains(MARK_CLASS) || cl?.contains(LEGEND_CLASS))
    }

    let scheduled: ReturnType<typeof setTimeout> | undefined
    const mo = new MutationObserver((records) => {
      const ours = records.every((r) => isOurs(r.target) && [...r.addedNodes].every(isOurs))
      if (ours) return
      if (scheduled) return
      scheduled = setTimeout(() => {
        scheduled = undefined
        scan()
      }, RESCAN_DEBOUNCE_MS)
    })
    mo.observe(document.body, { childList: true, subtree: true })

    // --- 범례 ---------------------------------------------------------------
    //
    // **아이콘만으로는 뜻이 전해지지 않는다.** 제목 옆 동그라미를 처음 본 사람은
    // 그것이 무엇을 말하는지 알 길이 없다 — 특히 이 표시가 **제목만** 본 것이라는
    // 점은 짐작할 수 없다. 오른쪽 아래에 한 번 설명하고, 닫으면 다시 띄우지 않는다.
    //
    // **표시가 하나라도 붙은 뒤에 띄운다.** 기사 목록이 아닌 페이지(설정, 검색 결과)
    // 에서도 이 스크립트가 돌 수 있는데, 거기서 설명할 표시가 없으면 상자만 뜬다.
    // **늘 띄운다. 없애지 않는다.** 지난번에 접어 뒀으면 접힌 채로 뜬다 —
    // 제목 줄은 남아 있어 언제든 펼 수 있다. 전에는 닫으면 영영 못 봤는데,
    // 제목 옆 아이콘은 영원히 뜨므로 설명으로 돌아올 길이 있어야 한다.
    let legend: { host: HTMLElement } | undefined
    async function maybeShowLegend(): Promise<void> {
      if (legend) return
      if (document.querySelector(`.${MARK_CLASS}`) === null) return
      const 접힘 = await legendCollapsed()
      if (legend) return // 기다리는 사이에 다른 호출이 띄웠다
      legend = createLegend(
        document,
        content.portal.legend,
        (collapsed) => void setLegendCollapsed(collapsed),
        접힘,
      )
      document.body.append(legend.host)
    }

    ctx.onInvalidated(() => {
      mo.disconnect()
      observer.disconnect()
      if (scheduled) clearTimeout(scheduled)
      for (const el of document.querySelectorAll(`.${MARK_CLASS}`)) el.remove()
      for (const el of document.querySelectorAll(`.${LEGEND_CLASS}`)) el.remove()
    })

    scan()
  },
})
