// 기사 페이지에 끼어들어 배지를 그리는 부분이다.
//
// 배지는 Shadow DOM 안에 넣는다. 그래야 기사 페이지의 CSS 가 우리 배지를
// 망가뜨리지 않고, 우리 CSS 도 기사 화면을 망가뜨리지 않는다.
// createShadowRootUi 가 그 Shadow DOM 을 대신 만들어 준다.
import '../assets/content.css'

export default defineContentScript({
  // TODO(GE-21): 대상 페이지를 확정한다. 지금은 뼈대 확인용이다.
  matches: ['https://news.naver.com/*', 'https://v.daum.net/*'],

  // 'ui' 로 두면 위에서 import 한 CSS 가 페이지가 아니라 Shadow DOM 안으로 들어간다.
  cssInjectionMode: 'ui',

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'genuearly-badge',
      position: 'inline',
      anchor: 'body',
      onMount(container) {
        // TODO(GE-22): 실제 판단 결과에 따라 4단계를 표시한다.
        // 지금은 빌드와 주입이 되는지 확인하는 자리 표시자다.
        const badge = document.createElement('div')
        badge.className = 'ge-badge'
        badge.textContent = '⚪ 판단 보류'
        container.append(badge)
      },
    })

    ui.mount()
  },
})
