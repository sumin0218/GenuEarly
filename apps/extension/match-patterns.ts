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
 * 대신 **설치 경고가 넓어진다.** 경고는 경로가 아니라 도메인으로 뜨므로
 * "naver.com 사이트의 데이터" 가 된다 (docs/security/secure-coding.md 2절).
 * `blog.naver.com/…/article/…` 처럼 기사가 아닌 곳에도 스크립트가 들어가지만,
 * 본문을 못 읽으면 배지 대신 "기사 페이지가 아닙니다" 만 뜬다.
 *
 * 다음은 경로가 하나뿐이라 그대로 둔다.
 */
export const ARTICLE_MATCHES = [
  'https://*.naver.com/*article*',
  'https://v.daum.net/v/*',
] as const

/**
 * 받지 않을 곳. **`matches` 보다 먼저 걸린다.**
 *
 * 댓글 페이지는 주소에 `article` 이 들어 있지만 본문이 없다. 들어가 봐야
 * "기사 페이지가 아닙니다" 만 뜨므로 아예 끼어들지 않는다.
 */
export const ARTICLE_EXCLUDE_MATCHES = [
  'https://*.naver.com/*/comment/*',
] as const

/**
 * 포털 목록·섹션 페이지. 제목 옆 동그라미(기능 ②)가 뜨는 곳이다.
 *
 * **네이버만 받는다.** 다음 목록은 제목 링크 모양을 확인하지 못했고,
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
const EXCLUDE_RES = ARTICLE_EXCLUDE_MATCHES.map(matchPatternToRegExp)

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
  if (EXCLUDE_RES.some((re) => re.test(bare))) return false
  return ARTICLE_RES.some((re) => re.test(bare))
}
