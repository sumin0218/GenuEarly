// service worker. 확장 프로그램의 "뒤에서 도는 부분"이다.
//
// MV3 의 service worker 는 수시로 종료된다. 켜져 있다고 가정하지 않는다.
// 전역 변수에 캐시나 진행 상태를 두지 말고 chrome.storage 에 쓴다.
//
// **여기는 배선만 둔다.** 판단 흐름은 lib/judge.ts 에 있다 — 테스트에서 부를 수 있게.
import content from '../../../packages/content/ui.ko.json'
import { sweepExpired } from '../lib/cache'
import { buildReport, clearReport } from '../lib/report'
import { clearArchive, removeArchived, sweepArchive } from '../lib/archive'
import { callProxy, judgeArticle, judgeExplain, judgeHeadline, setIconBadge } from '../lib/judge'
import { judgeSelection, putSelectionPending, putSelectionResult } from '../lib/selection'
import type { ArticleVerdict, HeadlineVerdict, Message } from '../lib/protocol'

/** 오른쪽 클릭 메뉴의 id. 문자열을 두 곳에 적지 않는다. */
const MENU_ID = 'genuearly-check-selection'

export default defineBackground(() => {
  // **만료된 캐시를 비운다.** 남겨 두면 그 자체가 열람 기록이 된다
  // (docs/security/secure-coding.md 7절). service worker 가 깨어날 때마다 한 번.
  void sweepExpired().then((n) => { if (n) console.info('[GenuEarly] 만료 캐시', n, '건 비움') })

  // 보관한 리포트도 같은 이유로 쓸어낸다. 사용자가 지우지 않아도 서른 날이 지나면
  // 사라진다 — 상한과 함께, 아카이브가 영구 열람 기록이 되지 않게 하는 둘째 장치다.
  void sweepArchive().then((n) => { if (n) console.info('[GenuEarly] 만료 리포트', n, '건 비움') })

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

    // **팝업을 먼저 연다. 기다린 다음이 아니다.**
    // `openPopup()` 은 사용자 제스처를 요구할 수 있는데, 판단을 기다린 뒤(문장 수만큼,
    // 1초 남짓) 부르면 그 사이에 제스처가 끝나 **거의 항상 실패한다.** 메뉴 클릭 직후에
    // 불러야 제스처 안에서 열린다. 팝업은 "살펴보는 중" 을 띄우고 결과를 기다린다.
    //
    // **아이콘 배지를 쓰지 않는다.** 아이콘 배지는 "지금 탭의 상태 하나" 인데 ③ 가 올리는 것은
    // 페이지가 아니라 **고른 글**의 판정이다. 메신저에서 고른 글이 🔴 이면 그 페이지 전체가
    // 주의 대상처럼 보이고, 기사 페이지에서 고르면 ①이 낸 기사 배지를 덮는다
    // (requirements.md 2-1절, ②가 목록 제목을 탭 상태로 올리지 않는 것과 같은 이유).
    // 순서가 중요하다. `openPopup()` 이 **이 틱 안에서** 불려야 한다 —
    // `await` 를 하나라도 먼저 두면 제스처가 끝난 뒤가 된다.
    // 팝업이 저장소를 읽기 전에 아래 쓰기가 끝나지만, 늦더라도 팝업이
    // `storage.session` 변경을 듣고 있어서 받는다 (entrypoints/popup/main.ts).
    try {
      void browser.action.openPopup()
    } catch {
      console.info('[GenuEarly] 팝업을 자동으로 열지 못했다. 아이콘을 눌러 주세요')
    }
    void putSelectionPending(tab?.id)

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
      // 팝업이 이미 열려 있으면 이 쓰기를 듣고 바로 그린다.
      // 못 열렸으면 사용자가 아이콘을 누를 때 읽는다 (2분 안에).
      await putSelectionResult(result, tab?.id)
    })()
  })

  // --- 탭이 다른 페이지로 가면 아이콘 배지를 지운다 -------------------------
  //
  // `setBadgeText({ tabId })` 로 둔 값은 **탭이 닫힐 때만** 지워진다. 같은 탭에서 다른 곳으로
  // 가도 남아서, 🔴 기사를 보다가 포털 목록으로 넘어가면 **그 목록이 주의 대상인 것처럼 보인다**
  // (requirements.md 2-1절). 기사 페이지면 콘텐츠 스크립트가 곧 다시 채운다.
  //
  // **`tabs` 권한이 필요 없다.** 권한을 요구하는 것은 `Tab.url`·`title`·`favIconUrl` 이고
  // 우리는 `changeInfo.status` 하나만 본다 (tests/manifest.test.ts 의 금지 권한 목록).
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status !== 'loading') return
    void browser.action.setBadgeText({ tabId, text: '' })
  })

  browser.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    const msg = raw as Message
    // **보낸 곳을 확인한다.** 우리 콘텐츠 스크립트가 아니면 받지 않는다.
    if (!sender.tab || sender.id !== browser.runtime.id) return false

    // ② 목록의 제목 하나. **아이콘 배지를 건드리지 않는다** — 목록 페이지에는 기사가
    // 서른 개 있고, 그중 하나의 판정을 탭 전체의 상태로 올리면 그 페이지가 주의 대상처럼
    // 보인다 (requirements.md 2-1절).
    if (msg?.kind === 'judge-headline') {
      judgeHeadline(msg)
        .then(sendResponse)
        .catch((e) => {
          console.warn('[GenuEarly] 제목 판단 실패', e)
          sendResponse({ level: 'UNDETERMINED', basis: 'headline' } satisfies HeadlineVerdict)
        })
      return true
    }

    // 심층 분석. **아이콘 배지도 판정도 건드리지 않는다** — 판정은 이미 났고
    // 이것은 그 이유를 묻는 것뿐이다 (GE-44).
    if (msg?.kind === 'judge-explain') {
      judgeExplain(msg)
        .then(sendResponse)
        .catch((e) => {
          console.warn('[GenuEarly] 심층 분석 실패', e)
          sendResponse(null)
        })
      return true
    }

    // 심층 분석 리포트. **답을 기다리지 않는다** — 스무 초가 걸려서 메시지로 돌려주면
    // 그 사이에 팝업이 닫히거나 service worker 가 꺼진다. 진행은 storage.session 에 적고
    // 팝업과 리포트 탭이 그것을 읽는다 (lib/report.ts).
    if (msg?.kind === 'build-report') {
      void clearReport()
        .then(() =>
          buildReport(
            { url: msg.url, headline: msg.headline, date: msg.date, body: msg.body },
            msg.rows,
          ),
        )
        .catch((e) => console.warn('[GenuEarly] 리포트 만들기 실패', e))
      sendResponse({ started: true })
      return true
    }

    // 보관함 고치기. **쓰는 자리를 여기 하나로 모은다** — 리포트 탭이 직접 쓰면
    // 리포트가 막 보관되는 순간과 겹쳐 지운 항목이 되살아난다 (lib/archive.ts).
    if (msg?.kind === 'archive-write') {
      const 일 = msg.what === 'clear' ? clearArchive() : removeArchived(msg.url ?? '')
      일.then(() => sendResponse({ ok: true })).catch((e) => {
        console.warn('[GenuEarly] 보관함 고치기 실패', e)
        sendResponse({ ok: false })
      })
      return true
    }

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
