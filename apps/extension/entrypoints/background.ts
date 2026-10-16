// service worker. 확장 프로그램의 "뒤에서 도는 부분"이다.
//
// MV3 의 service worker 는 수시로 종료된다. 켜져 있다고 가정하지 않는다.
// 전역 변수에 캐시나 진행 상태를 두지 말고 chrome.storage 에 쓴다.
// 자세한 규칙은 apps/extension/AGENT.md 를 본다.
export default defineBackground(() => {
  console.log('GenuEarly background 시작', { id: browser.runtime.id })
})
