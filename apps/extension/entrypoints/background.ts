// service worker. 확장 프로그램의 "뒤에서 도는 부분"이다.
//
// MV3 의 service worker 는 수시로 종료된다. 켜져 있다고 가정하지 않는다.
// 전역 변수에 캐시나 진행 상태를 두지 말고 chrome.storage 에 쓴다.
//
// **여기는 배선만 둔다.** 판단 흐름은 lib/judge.ts 에 있다 — 테스트에서 부를 수 있게.
import { sweepExpired } from '../lib/cache'
import { judgeArticle } from '../lib/judge'
import type { ArticleVerdict, Message } from '../lib/protocol'

export default defineBackground(() => {
  // **만료된 캐시를 비운다.** 남겨 두면 그 자체가 열람 기록이 된다
  // (docs/security/secure-coding.md 7절). service worker 가 깨어날 때마다 한 번.
  void sweepExpired().then((n) => { if (n) console.info('[GenuEarly] 만료 캐시', n, '건 비움') })

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
