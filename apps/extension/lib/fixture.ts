// 수동 테스트 자료(eval/fixtures/manual-news)를 알아보는 곳. **여기가 원본이다.**
//
// 자료로 ①②와 리포트를 확인하려면 `file://` 와 `localhost` 를 받아야 한다. 그런데
// 그 둘은 **사용자의 모든 로컬 파일과 모든 로컬 서버**다. 배포본에 들어가면 안 되고,
// 들어가더라도 아무 페이지에나 끼어들면 안 된다.
//
// ## 두 개의 가림막
//
//   1. **빌드**  — 개발 빌드에만 대상 주소를 넣는다 (`TEST_FIXTURES_ON`)
//   2. **페이지** — 그 안에서도 우리 자료일 때만 움직인다 (`isFixturePage`)
//
// 둘째가 없으면 개발 빌드에서 **개발자 자신의 앱**(localhost)에 표시가 붙고 판정
// 요청이 나간다. 리뷰에서 그렇게 돌고 있는 것이 발견됐다.

/**
 * 이 빌드가 테스트 자료를 받는가.
 *
 * **`import.meta.env.DEV` 를 쓰지 않는다.** Vite 는 production 이 아닌 **모든** 모드에서
 * `DEV` 를 참으로 둔다. wxt.config.ts 는 `mode === 'development'` 로 host_permissions 를
 * 가리므로, `DEV` 를 쓰면 `--mode staging` 같은 빌드에서 **둘이 어긋난다** —
 * host_permissions 에는 없는데 content_scripts 의 matches 에는 들어간다. MV3 에서
 * **matches 자체가 호스트 권한**이라 그대로 새는 것이다 (리뷰에서 실측으로 확인).
 *
 * 그래서 양쪽 다 'development' 라는 같은 글자를 본다. wxt.config.ts 의 짝이다 —
 * **한쪽을 고치면 다른 쪽도 고친다.**
 */
export const TEST_FIXTURES_ON = import.meta.env.MODE === 'development'

/**
 * 이 페이지가 우리 테스트 자료인가.
 *
 * **제목의 표식을 본다.** `build.cjs` 가 모든 페이지의 `<title>` 앞에 붙인다.
 * 주소로 가릴 수 없다 — `file://` 는 호스트가 비고 localhost 는 포트가 매번 다르며,
 * 그 둘에는 개발자의 다른 페이지도 산다.
 */
export function isFixturePage(doc: Document = document): boolean {
  return doc.title.startsWith('[테스트용]')
}

/**
 * 그중에서도 **기사** 페이지인가. 목록 페이지(index·분류)와 가른다.
 *
 * 기사에는 ①이 배지를 띄우고, 목록에는 ②가 표시를 단다. 한 페이지에서 둘 다 돌면
 * 기사 본문 아래 관련 링크에 표시가 붙어 읽는 중에 끼어든다.
 */
export function isFixtureArticle(doc: Document = document): boolean {
  return doc.querySelector('article#article h1#headline') !== null
}
