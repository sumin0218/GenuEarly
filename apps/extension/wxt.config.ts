import { defineConfig } from 'wxt'
import { HOST_PERMISSIONS } from './match-patterns'

// WXT 설정. https://wxt.dev/api/config.html
//
// manifest.json 은 이 파일에서 생성된다. 손으로 쓴 manifest.json 파일은 없다.
// 빌드 결과는 .output/chrome-mv3/manifest.json 에서 확인할 수 있다.
// 권한 검사는 그 "빌드된" manifest 를 읽는다 (tests/manifest.test.ts).
//
// 권한 표의 원본은 docs/security/secure-coding.md 2절이다.
// 여기를 고치면 그 표도 같은 PR에서 고친다.
export default defineConfig({
  manifest: {
    name: 'GenuEarly',
    description: '기사를 읽는 순간과 공유하려는 순간에 주의가 필요한 신호를 알려 줍니다.',

    // 팝업 꼬리말의 홈페이지 링크와 chrome://extensions 의 "웹사이트" 가 이것을 쓴다.
    // **주소를 두 곳에 적지 않는다** — 팝업은 manifest 에서 읽는다.
    // 랜딩 페이지(GE-40)가 생기면 그 주소로 바꾼다.
    homepage_url: 'https://github.com/sumin0218/GenuEarly',

    // 권한은 최소로. 늘리는 PR은 "이 권한 없이는 안 되는 이유"를 본문에 적는다.
    //
    // `contextMenus` 는 ③ 선택 텍스트 검사가 쓴다 (GE-24). **이것으로 끝이다** —
    // 더 늘릴 계획이 없다. 늘리는 PR 은 "이 권한 없이는 안 되는 이유" 를 본문에 적는다.
    //
    // **호스트 권한은 늘지 않는다.** 오른쪽 클릭 메뉴의 `info.selectionText` 는
    // background 로 바로 오고, 결과는 우리 팝업에 띄운다. 임의의 사이트에 아무것도 넣지 않는다.
    //
    // 한때 필요하다고 보았다가 **설계를 바꿔 없앤 것들** (requirements.md 2-1절, 5-1절):
    //   - scripting, activeTab : ③ 결과를 선택한 글 근처에 띄우려면 임의의 사이트에
    //     UI 를 주입해야 했다. **확장 팝업으로 옮겨 주입 자체를 없앴다**
    //   - notifications        : OS 알림 대신 **아이콘 배지**(권한 없음)를 쓴다
    //
    // 팝업·아이콘 배지는 권한이 아니라 `action` 키다. 설치 경고에 뜨지 않는다.
    // 셋은 tests/manifest.test.ts 의 금지 목록에 들어가 있다 — 다시 넣으려면 결정을 먼저 뒤집어야 한다.
    permissions: ['storage', 'contextMenus'],

    // 와일드카드 도메인(<all_urls>, *://*/*)을 쓰지 않는다. 호스트를 명시한다.
    // 목록은 match-patterns.ts 가 원본이다. content_scripts 와 같은 값을 쓴다.
    host_permissions: [...HOST_PERMISSIONS],
  },
})
