// 확장 프로그램이 끼어드는 페이지 목록. **여기가 원본이다.**
//
// wxt.config.ts 의 host_permissions 와 entrypoints/*.ts 의 matches 가
// 이 상수를 함께 쓴다. 두 곳에 따로 적으면 반드시 어긋난다.
//
// MV3 에서 content_scripts 의 matches 는 그 자체로 해당 사이트 접근 권한이고
// 설치할 때 경고 문구에도 뜬다. host_permissions 만 줄여도 소용없다.
// 권한 표의 원본은 docs/security/secure-coding.md 2절이다.

/**
 * 기사 본문 페이지. 배지(기능 ①)가 뜨는 곳이다.
 *
 * 네이버 기사 본문은 news.naver.com 이 아니라 n.news.naver.com/article/… 에 있다.
 * news.naver.com 에는 목록·섹션 페이지만 있다.
 *
 * **같은 기사가 네 경로로 열린다.** 섹션 한 페이지(news.naver.com/section/100)의
 * 기사 링크를 세어 본 값이다 (2026-10-27).
 *
 * | 경로 | 그 페이지에서 |
 * |---|---|
 * | `/mnews/article/…` | 184 |
 * | `/mnews/ranking/article/…` | **170** |
 * | `/mnews/article/comment/…` | 50 — 댓글 화면. 아래에서 뺀다 |
 * | `/mnews/hotissue/article/…` | 16 |
 *
 * **기사 링크의 절반 가까이가 랭킹 경로다.** 받지 않으면 사용자가 목록에서 제목을
 * 눌러 들어간 기사에 배지가 뜨지 않는다 — 그런데 ②는 동그라미를 달아 두었으므로
 * **표시는 떴는데 눌러 들어가면 아무것도 없는** 상태가 된다. 확장이 죽은 것처럼 보인다.
 *
 * 호스트가 전부 `n.news.naver.com` 이라 **설치 경고는 늘지 않는다.** 경고에는
 * 경로가 아니라 도메인만 나온다 (GE-42).
 */
export const ARTICLE_MATCHES = [
  'https://n.news.naver.com/article/*',
  'https://n.news.naver.com/mnews/article/*',
  'https://n.news.naver.com/mnews/ranking/article/*',
  'https://n.news.naver.com/mnews/hotissue/article/*',
  'https://v.daum.net/v/*',

  // **언론사 자체 도메인.** 포털을 거치지 않고 링크를 받아 바로 들어오는 길이
  // 더 흔하다. 두 곳 다 우리가 보는 신호(자극적 제목, 감정적 표현, 공유 유도,
  // 확인하기 어려운 주장)가 자주 나타나는 곳이라 평가 세트의 반대 샘플로도 쓴다 (GE-41).
  //
  // **매체 이름으로 점수를 깎지 않는다.** 우리는 매체가 아니라 글을 본다
  // (docs/product.md 2절). 사이트를 늘리는 것은 "어디서 읽든 같은 기준으로 본다" 는
  // 쪽이지 "이 언론사는 의심한다" 가 아니다.
  //
  // 인사이트는 호스트가 하나다 — `m.insight.co.kr` 은 `www` 로 넘긴다 (301 확인).
  // 위키트리는 둘이고, 모바일 쪽 `canonical` 이 `www` 를 가리킨다.
  // `lib/cache.ts` 의 `normalizeUrl` 이 둘을 한 키로 접는다.
  'https://www.insight.co.kr/news/*',
  'https://www.wikitree.co.kr/articles/*',
  'https://m.wikitree.co.kr/articles/*',
] as const

/**
 * 위 목록이 잡지만 **기사 본문이 없는** 페이지.
 *
 * `/mnews/article/comment/056/0012281659` 은 같은 기사의 **댓글 화면**이다.
 * 제목은 있고 본문이 없다. 그런데 `/mnews/article/*` 의 `*` 가 경로 나머지를 전부
 * 덮어서 **지금까지 여기에도 배지가 떴다** — 본문을 못 읽으니 늘 ⚪ 였다.
 * 판단을 해 보고 실패한 것처럼 보이지만 애초에 기사 페이지가 아니다.
 *
 * match pattern 에는 "빼기" 가 없다. 그래서 따로 둔다 —
 * `content_scripts` 의 `excludeMatches` 와 `isArticleUrl` 이 **같이** 쓴다.
 */
export const ARTICLE_EXCLUDE_MATCHES = [
  'https://n.news.naver.com/mnews/article/comment/*',
] as const

/**
 * 포털 목록·섹션 페이지. 제목 옆 동그라미(기능 ②)가 뜨는 곳이다.
 *
 * **네이버만 받는다.** 다음·인사이트·위키트리 목록은 제목 링크 모양을 확인하지 못했고,
 * 확인하지 못한 사이트의 권한을 미리 받아 두지 않는다 (requirements.md 4-5절 TODO).
 */
export const PORTAL_LIST_MATCHES = [
  'https://news.naver.com/section/*',
] as const

/** manifest 의 host_permissions 에 들어가는 값. */
export const HOST_PERMISSIONS = [...ARTICLE_MATCHES, ...PORTAL_LIST_MATCHES]

/**
 * match pattern 을 정규식으로. **목록에서 "이것은 기사 링크인가" 를 가릴 때 쓴다.**
 *
 * 링크 판별용 정규식을 따로 적지 않는 이유: 따로 적으면 반드시 어긋나고,
 * 어긋나면 **①이 판단하지 못하는 기사에 ②가 동그라미를 단다.** 목록에 표시가 떴는데
 * 눌러 들어가면 아무것도 없는 상태가 된다. 한 곳에서 끌어내면 그 일이 생기지 않는다.
 *
 * 우리가 쓰는 모양(`https://호스트/경로*`)만 다룬다. 호스트 와일드카드(`*.example.com`)와
 * `<all_urls>` 는 쓰지 않기로 했으므로 지원하지 않는다 (secure-coding.md 2절).
 */
export function matchPatternToRegExp(pattern: string): RegExp {
  const m = /^(https?):\/\/([^/]+)(\/.*)$/.exec(pattern)
  if (!m?.[1] || !m[2] || !m[3]) throw new Error(`지원하지 않는 match pattern: ${pattern}`)
  const [, scheme, host, path] = m as unknown as [string, string, string, string]
  if (host.includes('*')) throw new Error(`호스트 와일드카드는 쓰지 않는다: ${pattern}`)
  const escape = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  // 경로의 `*` 만 와일드카드다. 나머지는 글자 그대로.
  const pathRe = escape(path).split('*').join('.*')
  return new RegExp(`^${scheme}://${escape(host)}${pathRe}$`)
}

const ARTICLE_RES = ARTICLE_MATCHES.map(matchPatternToRegExp)
const ARTICLE_EXCLUDE_RES = ARTICLE_EXCLUDE_MATCHES.map(matchPatternToRegExp)

/**
 * 이 주소가 **①이 배지를 띄울 수 있는 기사**인가.
 *
 * 쿼리와 해시는 떼고 본다. 포털 목록의 링크에는 `?sid=100` 같은 것이 늘 붙어 있는데,
 * match pattern 의 `*` 는 그것까지 덮지만 **경로 끝을 못 박은 패턴이 생기면 조용히 어긋난다.**
 */
export function isArticleUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  // javascript: 같은 스킴을 여기서 먼저 떨어뜨린다 (secure-coding.md 4절).
  if (url.protocol !== 'https:') return false
  const bare = `${url.origin}${url.pathname}`
  // **빼는 쪽을 먼저 본다.** 댓글 화면은 `/mnews/article/*` 에 걸리지만 기사가 아니다.
  if (ARTICLE_EXCLUDE_RES.some((re) => re.test(bare))) return false
  return ARTICLE_RES.some((re) => re.test(bare))
}
