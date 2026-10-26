// service worker. 확장 프로그램의 "뒤에서 도는 부분"이다.
//
// MV3 의 service worker 는 수시로 종료된다. 켜져 있다고 가정하지 않는다.
// 전역 변수에 캐시나 진행 상태를 두지 말고 chrome.storage 에 쓴다.
//
// **여기는 배선만 둔다.** 판단 흐름은 lib/judge.ts 에 있다 — 테스트에서 부를 수 있게.
import content from '../../../packages/content/ui.ko.json'
import { sweepExpired } from '../lib/cache'
import { callProxy, judgeArticle, setIconBadge } from '../lib/judge'
import { judgeSelection, putSelectionResult } from '../lib/selection'
import type { ArticleVerdict, Message } from '../lib/protocol'

/** 오른쪽 클릭 메뉴의 id. 문자열을 두 곳에 적지 않는다. */
const MENU_ID = 'genuearly-check-selection'

export default defineBackground(() => {
  // **만료된 캐시를 비운다.** 남겨 두면 그 자체가 열람 기록이 된다
  // (docs/security/secure-coding.md 7절). service worker 가 깨어날 때마다 한 번.
  void sweepExpired().then((n) => { if (n) console.info('[GenuEarly] 만료 캐시', n, '건 비움') })

  // --- ③ 선택 텍스트 검사 --------------------------------------------------
  //
  // **메뉴는 글을 선택했을 때만 뜬다** (`contexts: ['selection']`, requirements.md 5절).
  // 메뉴를 만드는 일은 설치·갱신 때 한 번이면 된다. service worker 가 깨어날 때마다
  // 다시 만들면 같은 id 로 중복 생성되어 에러가 난다.
  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
      id: MENU_ID,
      title: content.selection.menu,
      contexts: ['selection'],
    })
  })

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== MENU_ID) return
    const text = info.selectionText ?? ''
    if (!text.trim()) return

    setIconBadge(tab?.id, 'PENDING')
    void (async () => {
      const outcome = await judgeSelection(text, callProxy).catch((e) => {
        console.warn('[GenuEarly] 선택 글 판단 실패', e)
        return null
      })
      // 판단이 통째로 실패해도 ⚪ 를 돌려준다. 팝업이 빈 화면으로 열리는 쪽이 더 나쁘다.
      const result = outcome ?? {
        ok: true,
        verdict: {
          level: 'UNDETERMINED', score: null, cautionSignals: 0, items: [], reason: 'not_enough_items',
        } satisfies ArticleVerdict,
      } as const
      await putSelectionResult(result)
      setIconBadge(tab?.id, result.ok ? result.verdict.level : 'UNDETERMINED')

      // **팝업을 열어 준다.** Chrome 127+ 에만 있고 사용자 제스처를 요구할 수 있다.
      // 안 되면 배지만 바뀌고 사용자가 아이콘을 누르면 된다 — 그래도 권한은 늘지 않는다
      // (requirements.md 5-1절의 물러서는 길).
      try {
        await browser.action.openPopup()
      } catch {
        console.info('[GenuEarly] 팝업을 자동으로 열지 못했다. 아이콘을 눌러 주세요')
      }
    })()
  })

  browser.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    const msg = raw as Message
    // **보낸 곳을 확인한다.** 우리 콘텐츠 스크립트가 아니면 받지 않는다.
    if (!sender.tab || sender.id !== browser.runtime.id) return false
    if (msg?.kind !== 'judge-article') return false

    judgeArticle(msg, sender.tab.id)
      .then(sendResponse)
      .catch((e) => {
        console.warn('[GenuEarly] 판단 실패', e)
        sendResponse({ level: 'UNDETERMINED', score: null, cautionSignals: 0, items: [], reason: 'not_enough_items' } satisfies ArticleVerdict)
      })
    return true   // 비동기로 답한다
  })
})
