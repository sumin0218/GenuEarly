import { defineConfig } from 'wxt'

// WXT 설정. https://wxt.dev/api/config.html
//
// manifest.json 은 이 파일에서 생성된다. 손으로 쓴 manifest.json 파일은 없다.
// 빌드 결과는 .output/chrome-mv3/manifest.json 에서 확인할 수 있다.
//
// 권한 표의 원본은 docs/security/secure-coding.md 2절이다.
// 여기를 고치면 그 표도 같은 PR에서 고친다.
export default defineConfig({
  manifest: {
    name: 'GenuEarly',
    description: '기사를 읽는 순간과 공유하려는 순간에 주의가 필요한 신호를 알려 줍니다.',
    default_locale: undefined,

    // 권한은 최소로. 늘리는 PR은 "이 권한 없이는 안 되는 이유"를 본문에 적는다.
    // TODO(GE-21): 기능이 붙으면서 필요해지는 권한을 여기서 확정한다.
    //   - contextMenus : 선택 텍스트 검사(GE-24)
    //   - notifications: 공유 직전 알림(GE-25) — 페이지 내 알림으로 충분하면 쓰지 않는다
    permissions: ['storage'],

    // 와일드카드 도메인(<all_urls>, *://*/*)을 쓰지 않는다. 호스트를 명시한다.
    // TODO(GE-21): 언론사 도메인을 어디까지 받을지 확정한다. 좁게 시작해서 늘린다.
    host_permissions: ['https://news.naver.com/*', 'https://v.daum.net/*'],
  },
})
