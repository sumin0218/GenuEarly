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
 * **네이버는 호스트를 세지 않고 `article` 이 든 주소로 받는다.**
 * 기사 본문이 사는 곳이 계속 늘어난다 — `n.news`(일반), `m.sports`(스포츠),
 * `m.entertain`(연예)이 다 다르고, 같은 호스트 안에서도 `/article/`,
 * `/mnews/article/`, `/mnews/ranking/article/`, `/mnews/hotissue/article/` 로 갈린다.
 * 하나씩 적으면 **빠뜨린 경로에서 배지가 아예 뜨지 않고**, 빠뜨렸다는 것조차 모른다 (GE-42).
 *
 * **같은 기사가 여러 경로로 열린다.** 섹션 한 페이지(news.naver.com/section/100)의
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
 * **표시는 떴는데 눌러 들어가면 아무것도 없는** 상태가 된다.
 *
 * 처음에는 경로를 하나씩 적었다(GE-42). 거기에 스포츠·연예 호스트까지 더하니 여덟 줄이
 * 되었고, **그래도 빠뜨린 것이 있는지 알 길이 없었다.** 그래서 네이버만은 호스트를 세지 않고
 * `article` 이 든 주소로 받는다.
 *
 * 대신 **설치 경고가 넓어진다.** 경고는 경로가 아니라 도메인으로 뜨므로
 * "naver.com 사이트의 데이터" 가 된다 (docs/security/secure-coding.md 2절).
 * `blog.naver.com/…/article/…` 처럼 기사가 아닌 곳에도 스크립트가 들어가지만,
 * 본문을 못 읽으면 배지 대신 "기사 페이지가 아닙니다" 만 뜬다.
 *
 * **네이버가 아닌 곳은 와일드카드가 덮지 않는다.** 아래에 그대로 적는다.
 */
export const ARTICLE_MATCHES = [
  'https://*.naver.com/*article*',
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
 * 제목은 있고 본문이 없다. 주소에 `article` 이 들어 있어 위 목록에 걸리는데,
 * 본문을 못 읽으니 **지금까지 늘 ⚪ 가 떴다** — 판단해 보고 실패한 것처럼 보이지만
 * 애초에 기사 페이지가 아니다.
 *
 * 호스트를 `n.news` 로 좁히지 않는다. 스포츠·연예에도 댓글 화면이 있고,
 * 위 목록이 그 호스트들을 와일드카드로 받기 때문이다.
 *
 * match pattern 에는 "빼기" 가 없다. 그래서 따로 둔다 —
 * `content_scripts` 의 `excludeMatches` 와 `isArticleUrl` 이 **같이** 쓴다.
 */
export const ARTICLE_EXCLUDE_MATCHES = [
  'https://*.naver.com/*/comment/*',
] as const

/**
 * 목록·섹션 페이지. 제목 옆 표시(기능 ②)가 뜨는 곳이다.
 *
 * ## 왜 인사이트·위키트리는 통째로 받는가
 *
 * ②는 **기사 본문을 읽는 기능이 아니다.** 목록에서 `a[href]` 를 훑어 그 주소가
 * `isArticleUrl` 에 걸리는지만 본다 (`collectTitles`). **선택자를 쓰지 않으므로**
 * 목록 페이지의 모양이 어떻게 생겼는지 미리 알 필요가 없다 — 기사 링크가 `<a>` 로
 * 걸려 있기만 하면 된다. 두 사이트 다 그렇다 (2026-10-29 확인).
 *
 * 그래서 **분류 페이지를 하나씩 적지 않는다.** 인사이트는 `/politics/`, `/economy/`
 * 등 열 개가 넘고 위키트리는 `/districts/…` 가 따로 있는데, 하나씩 적으면
 * 사이트가 분류를 늘릴 때 **조용히 빠진다** — 네이버 기사 경로에서 겪은 것과 같은 일이다
 * (`ARTICLE_MATCHES` 머리말의 GE-42).
 *
 * 대신 기사 본문 페이지는 뺀다 (`PORTAL_LIST_EXCLUDE_MATCHES`). 거기서는 ①이 배지를
 * 띄우고 있고, ②까지 돌면 관련 기사 링크에 표시가 붙어 **읽는 중에 끼어든다.**
 *
 * 설치 경고는 넓어지지 않는다. 경고는 경로가 아니라 도메인으로 뜨고, 두 도메인은
 * `ARTICLE_MATCHES` 때문에 이미 들어가 있다 (docs/security/secure-coding.md 2절).
 *
 * **다음은 아직 받지 않는다.** `v.daum.net` 은 기사 주소만 알고 목록 쪽을 확인하지
 * 못했다 (requirements.md 4-5절).
 */
export const PORTAL_LIST_MATCHES = [
  'https://news.naver.com/section/*',
  'https://www.insight.co.kr/*',
  'https://www.wikitree.co.kr/*',
  'https://m.wikitree.co.kr/*',
] as const

/**
 * 위 목록이 잡지만 **기사 본문 페이지**라서 ②가 들어가면 안 되는 곳.
 *
 * 기사에서는 ①이 배지를 띄운다. ②까지 돌면 본문 아래 관련 기사 링크마다 표시가
 * 붙어 **읽는 중에 끼어든다.** 목록은 훑는 자리고 기사는 읽는 자리다.
 */
export const PORTAL_LIST_EXCLUDE_MATCHES = [
  'https://www.insight.co.kr/news/*',
  'https://www.wikitree.co.kr/articles/*',
  'https://m.wikitree.co.kr/articles/*',
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
 * 우리가 쓰는 모양(`https://호스트/경로*`)만 다룬다. `<all_urls>` 는 쓰지 않는다.
 *
 * 호스트 와일드카드는 **맨 앞의 `*.` 하나만** 받는다. MV3 가 허용하는 모양이 그것뿐이고
 * (`*.naver.com` 은 naver.com 자신과 하위 도메인), 가운데 `*` 를 허용하면
 * `*.com` 같은 것이 조용히 통과한다 (secure-coding.md 2절).
 */
export function matchPatternToRegExp(pattern: string): RegExp {
  const m = /^(https?):\/\/([^/]+)(\/.*)$/.exec(pattern)
  if (!m?.[1] || !m[2] || !m[3]) throw new Error(`지원하지 않는 match pattern: ${pattern}`)
  const [, scheme, host, path] = m as unknown as [string, string, string, string]
  const escape = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')

  const wild = host.startsWith('*.')
  const bare = wild ? host.slice(2) : host
  if (bare.includes('*')) throw new Error(`지원하지 않는 호스트 와일드카드: ${pattern}`)
  const hostRe = wild ? `(?:[^/]+\\.)?${escape(bare)}` : escape(bare)

  // 경로의 `*` 만 와일드카드다. 나머지는 글자 그대로.
  const pathRe = escape(path).split('*').join('.*')
  return new RegExp(`^${scheme}://${hostRe}${pathRe}$`)
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
  // **빼는 쪽을 먼저 본다.** 댓글 화면은 주소에 `article` 이 들어 있지만 기사가 아니다.
  if (ARTICLE_EXCLUDE_RES.some((re) => re.test(bare))) return false
  return ARTICLE_RES.some((re) => re.test(bare))
}
