// ② 포털 목록에 끼어들어 제목 옆에 동그라미를 그린다 (docs/requirements.md 4절).
//
// **목록 전체를 한 번에 치지 않는다.** 화면에 보이는 제목부터 판단한다. 서른 개를 한꺼번에
// 보내면 중계 서버의 IP 당 한도(분당 60)를 한 사람이 혼자 쓴다.
//
// **판단 호출은 여기서 하지 않는다.** background 로 보낸다 (lib/protocol.ts).
import { PORTAL_LIST_MATCHES } from '../match-patterns'
import content from '../../../packages/content/ui.ko.json'
import {
  LEGEND_CLASS,
  MARK_CLASS,
  collectTitles,
  createLegend,
  createMark,
  dismissLegend,
  legendDismissed,
} from '../lib/portal'
import type { HeadlineVerdict, JudgeHeadlineMessage } from '../lib/protocol'

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

export default defineContentScript({
  matches: [...PORTAL_LIST_MATCHES],

  main(ctx) {
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
      mark.render('PENDING', 'headline', content.badge.PENDING.name)
      // 제목 **앞**에 넣는다. 뒤에 넣으면 제목이 두 줄로 접힐 때 홀로 다음 줄로 넘어간다.
      anchor.prepend(mark.host)

      // 화면에 들어왔을 때 실행할 일을 요소에 달아 둔다.
      const target = anchor as HTMLAnchorElement & { geStart?: () => void }
      target.geStart = () => {
        enqueue(async () => {
          const msg: JudgeHeadlineMessage = { kind: 'judge-headline', url, headline }
          try {
            const got = (await browser.runtime.sendMessage(msg)) as HeadlineVerdict | undefined
            if (!got) return mark.render('UNDETERMINED', 'headline', content.badge.UNDETERMINED.name)
            mark.render(got.level, got.basis, content.badge[got.level].name)
          } catch {
            // service worker 가 죽었거나 확장이 다시 로드됐다. ⚪ 는 실패가 아니라 결과다.
            mark.render('UNDETERMINED', 'headline', content.badge.UNDETERMINED.name)
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
    let legend: { host: HTMLElement; close: () => void } | undefined
    // **한 번 닫으면 이 페이지에서 다시 묻지 않는다.** `scan()` 이 돌 때마다 부르므로
    // 저장소를 매번 읽지 않게 기억해 둔다.
    let 닫았음 = false
    async function maybeShowLegend(): Promise<void> {
      if (legend || 닫았음) return
      if (document.querySelector(`.${MARK_CLASS}`) === null) return
      if (await legendDismissed()) {
        닫았음 = true
        return
      }
      if (legend || 닫았음) return // 기다리는 사이에 다른 호출이 띄웠거나 닫았다
      legend = createLegend(document, content.portal.legend, () => {
        legend?.close()
        legend = undefined
        닫았음 = true
        void dismissLegend()
      })
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
