// manifest 규칙이 살아 있는지 본다.
//
// **빌드된 manifest 를 읽는다.** wxt.config.ts 만 읽으면 안 된다.
// content_scripts 는 entrypoints/*.ts 에서 만들어져 config 객체에 없기 때문에,
// config 만 검사하면 matches 를 '<all_urls>' 로 바꿔도 통과해 버린다.
// MV3 에서 content_scripts 의 matches 는 그 자체로 사이트 접근 권한이다.
//
// 권한 표의 원본은 docs/security/secure-coding.md 2절이고, 이 테스트는 그중
// "절대 쓰지 않기로 한 것"을 기계가 읽는 형태로 옮긴 것이다.
import { readFileSync, existsSync, readdirSync } from 'node:fs'

declare const process: { env: Record<string, string | undefined> }
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isArticleUrl } from '../match-patterns'

const MANIFEST_PATH = resolve(__dirname, '../.output/chrome-mv3/manifest.json')

if (!existsSync(MANIFEST_PATH)) {
  throw new Error(
    `빌드된 manifest 가 없다: ${MANIFEST_PATH}\n` +
      `이 테스트는 빌드 결과를 검사한다. "npm test" 를 쓰면 빌드가 먼저 돈다.`,
  )
}

const manifest: Record<string, any> = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))

const permissions: string[] = manifest.permissions ?? []
const optionalPermissions: string[] = manifest.optional_permissions ?? []
const hostPermissions: string[] = manifest.host_permissions ?? []
const optionalHostPermissions: string[] = manifest.optional_host_permissions ?? []
const contentScriptMatches: string[] = (manifest.content_scripts ?? []).flatMap(
  (cs: any) => cs.matches ?? [],
)

/** docs/security/secure-coding.md 2절의 "쓰지 않는다" 목록 */
// 원본은 docs/security/secure-coding.md 2절 권한 표다. 표를 고치면 여기도 같은 PR 에서 고친다.
//
// notifications·scripting·activeTab 은 한때 "필요" 였다가 빠졌다.
// ③ 선택 텍스트 결과를 **확장 팝업**으로 옮겨 임의의 사이트에 UI 를 주입할 일이 없어졌고,
// OS 알림 대신 아이콘 배지를 쓰기로 했다. 셋 다 권한이 필요 없는 수단으로 바뀐 것이지
// 기능을 줄인 것이 아니다 (requirements.md 2-1절, 5-1절).
// **다시 넣으려면 그 결정을 먼저 뒤집어야 한다. 이 목록이 그것을 막는다.**
const 금지_권한 = [
  'tabs', 'webRequest', 'declarativeNetRequest', 'cookies', 'history', 'bookmarks',
  'notifications', 'scripting', 'activeTab',
]

/**
 * 받아도 되는 호스트 모양.
 *
 * - 경로의 `*` 는 얼마든지 — 어차피 경고에 뜨지 않는다
 * - 맨 앞의 `*.` 하나는 받는다 — `*.naver.com` (naver.com 과 하위 도메인)
 * - **라벨이 둘 이상이어야 한다.** 호스트가 `*.com` 이거나 아예 `*` 인 것을 막는 자리다
 */
const 받는_호스트 = /^https:\/\/(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+\//i

describe('빌드된 manifest', () => {
  it('manifest_version 이 3 이다', () => {
    expect(manifest.manifest_version).toBe(3)
  })

  it('content_scripts 가 실제로 들어 있다 (검사가 헛돌지 않는지 확인)', () => {
    // 이 테스트가 깨지면 아래 matches 검사들이 아무것도 안 보고 있다는 뜻이다.
    expect(contentScriptMatches.length).toBeGreaterThan(0)
  })
})

describe('권한', () => {
  it('쓰지 않기로 한 권한이 없다', () => {
    expect(permissions.filter((p) => 금지_권한.includes(p))).toEqual([])
  })

  it('optional_permissions 에도 쓰지 않기로 한 권한이 없다', () => {
    expect(optionalPermissions.filter((p) => 금지_권한.includes(p))).toEqual([])
  })

  it('manifest 어디에도 <all_urls> 가 없다', () => {
    expect(JSON.stringify(manifest)).not.toContain('<all_urls>')
  })
})

describe('대상 사이트', () => {
  const 호스트를_담은_목록: Array<[string, string[]]> = [
    ['host_permissions', hostPermissions],
    ['optional_host_permissions', optionalHostPermissions],
    ['content_scripts.matches', contentScriptMatches],
  ]

  for (const [이름, 목록] of 호스트를_담은_목록) {
    it(`${이름} 의 호스트가 너무 넓지 않다`, () => {
      for (const p of 목록) {
        expect(p, `${이름} 의 호스트가 너무 넓음: ${p}`).toMatch(받는_호스트)
      }
    })
  }

  // 설치 경고에 나오는 것은 **경로가 아니라 도메인**이다. 경로를 늘리는 것은
  // 사용자가 보는 문구를 바꾸지 않는다 — 랭킹·hotissue 경로를 받기로 한 근거다 (GE-42).
  it('도메인 목록이 권한 표와 같다 — 늘리려면 여기를 먼저 고친다', () => {
    const 도메인 = new Set(
      [...hostPermissions, ...contentScriptMatches].map((m) => new URL(m.replace('*', '')).host),
    )
    expect([...도메인].sort(), '설치 경고 문구가 길어진다. 권한 표도 같이 고쳤는가').toEqual([
      // **네이버는 호스트를 세지 않는다.** 기사가 사는 호스트가 계속 늘어나고,
      // 하나씩 적으면 빠뜨린 줄도 모른다 (GE-42). 대신 경고가 "naver.com 사이트" 로
      // 넓어진다 — 경고에 나오는 것은 경로가 아니라 도메인이다.
      '.naver.com',
      'm.wikitree.co.kr',
      'news.naver.com',
      'v.daum.net',
      'www.insight.co.kr',
      'www.wikitree.co.kr',
    ])
  })

  it('인사이트는 호스트가 하나다 — 모바일이 www 로 넘어간다', () => {
    // m.insight.co.kr 은 301 로 www 에 넘긴다 (2026-10-27 확인).
    // 받아 둘 이유가 없다. 설치 경고만 길어진다.
    expect(hostPermissions.some((m) => m.includes('m.insight.co.kr'))).toBe(false)
  })

  it('네이버의 기사 주소를 호스트·경로 가리지 않고 받는다', () => {
    // 섹션 한 페이지에서 실제로 센 값: 랭킹 170, hotissue 16 (2026-10-27).
    // **패턴 글자를 세지 않고 실제 주소로 본다** — 와일드카드라 문자열 비교가 통하지 않고,
    // 통하더라도 "그 패턴이 있는가" 가 아니라 "그 주소가 걸리는가" 가 지키려던 것이다.
    for (const url of [
      'https://n.news.naver.com/article/366/0001200528',
      'https://n.news.naver.com/mnews/article/366/0001200528',
      'https://n.news.naver.com/mnews/ranking/article/422/0000919981',
      'https://n.news.naver.com/mnews/hotissue/article/001/0001',
      'https://m.sports.naver.com/kbaseball/article/076/0004459867',
      'https://m.entertain.naver.com/home/article/076/0004459769',
    ]) {
      expect(isArticleUrl(url), `${url} 를 받지 않는다 — 배지가 안 뜬다`).toBe(true)
    }
  })

  it('댓글 화면을 빼 둔다 — 본문이 없는 곳에서 돌지 않는다', () => {
    const excludes: string[] = (manifest.content_scripts ?? []).flatMap(
      (cs: any) => cs.exclude_matches ?? [],
    )
    expect(excludes).toContain('https://*.naver.com/*/comment/*')
    // 호스트를 좁히지 않는 이유 — 스포츠·연예에도 댓글 화면이 있다.
    for (const url of [
      'https://n.news.naver.com/mnews/article/comment/056/0012281659',
      'https://m.sports.naver.com/kbaseball/article/comment/076/0004459867',
    ]) {
      expect(isArticleUrl(url), `${url} 는 기사가 아니다`).toBe(false)
    }
  })

  it('content_scripts 가 붙는 곳은 host_permissions 에도 있다', () => {
    for (const m of contentScriptMatches) {
      expect(hostPermissions, `content_scripts 대상인데 host_permissions 에 없음: ${m}`).toContain(m)
    }
  })
})

describe('제출본에 개발용 주소가 없다', () => {
  // **이 검사가 건너뛴 탓에 `localhost` 가 박힌 빌드가 그대로 나갔다.**
  // 전에는 테스트를 돌릴 때 `WXT_PROXY_URL` 이 환경에 없으면 통째로 넘어갔는데,
  // 검사를 돌리는 시점과 빌드를 만드는 시점은 **다르다.** 그래서 환경변수를 보지 않고
  // **빌드 결과만** 본다.
  //
  // 그 빌드에서는 background 가 localhost 로 요청을 보내 `Failed to fetch` 가 났고,
  // 화면에는 "판단하지 못함" 으로만 보였다. 조용한 고장이라 찾는 데 오래 걸렸다.
  const dir = resolve(__dirname, '../.output/chrome-mv3')
  const bundled = () =>
    readdirSync(dir, { recursive: true, encoding: 'utf8' })
      .filter((f) => typeof f === 'string' && f.endsWith('.js'))
      .map((f) => readFileSync(resolve(dir, f as string), 'utf8'))

  it('빌드에 개발용 주소가 남아 있지 않다', () => {
    const hit = bundled().filter((s) => s.includes('localhost'))
    expect(hit, '빌드에 개발용 주소가 남아 있다 — 모든 기사가 ⚪ 가 된다').toHaveLength(0)
  })

  it('중계 주소가 들어 있다', () => {
    // 기본값이 배포 주소라 환경변수를 빠뜨려도 올바른 빌드가 나온다.
    const want = process.env.WXT_PROXY_URL ?? 'https://genuearly-proxy'
    expect(bundled().some((s) => s.includes(want)), `중계 주소가 번들에 없다: ${want}`).toBe(true)
  })
})

describe('아이콘 배지와 팝업', () => {
  // **`action` 키가 없으면 `chrome.action` 자체가 없다.**
  // judge.ts 가 setBadgeText 를 부르지만 실제 브라우저에서는 전부 실패한다.
  // 테스트가 `browser.action` 을 모킹해서 **한동안 아무도 못 봤다** — 모의는
  // 키가 선언됐는지 모른다. 그래서 빌드된 manifest 를 본다.
  it('action 키가 있다 — 없으면 아이콘 배지가 동작하지 않는다', () => {
    expect(manifest.action, 'action 키가 없다. 아이콘 배지와 팝업이 둘 다 죽는다').toBeTruthy()
  })

  it('팝업이 붙어 있다', () => {
    expect(manifest.action?.default_popup).toBeTruthy()
  })

  it('팝업 파일이 실제로 나왔다', () => {
    const popup = manifest.action?.default_popup as string
    expect(existsSync(resolve(__dirname, '../.output/chrome-mv3', popup))).toBe(true)
  })

  it('권한 목록이 딱 이 둘이다 — 늘리려면 이 줄을 먼저 고쳐야 한다', () => {
    // action 키는 권한이 아니다. 팝업을 붙여도 설치 경고에 뜨지 않는다 (requirements.md 2-1절).
    //
    // contextMenus 는 ③ 선택 글 검사 때문에 받는다. 이것도 설치 경고가 없고,
    // **호스트 권한을 늘리지 않는다** — `info.selectionText` 가 background 로 바로 오므로
    // 글을 읽으려고 임의의 사이트에 콘텐츠 스크립트를 넣을 일이 없다 (requirements.md 5-1절).
    //
    // 목록을 고정해 둔다. 권한이 하나 느는 일은 **조용히 일어나면 안 된다.**
    expect(permissions).toEqual(['storage', 'contextMenus'])
  })
})

describe('② 포털 목록 (GE-23)', () => {
  // **등록되지 않은 콘텐츠 스크립트는 빌드되기만 하고 돌지 않는다.**
  // WXT 는 entrypoints/portal.ts 를 "unlisted script" 로 보고 조용히 manifest 밖에 둔다.
  // 파일 이름을 portal.content.ts 로 바꿔야 등록된다 — 그 사실을 아무도 알려 주지 않는다.
  // `action` 키가 없던 것과 같은 함정이라 빌드 결과를 본다.
  const portal = (manifest.content_scripts ?? []).find((cs: any) =>
    (cs.matches ?? []).some((m: string) => m.includes('news.naver.com/section')))

  it('목록 페이지에 콘텐츠 스크립트가 등록돼 있다', () => {
    expect(portal, '포털 목록 콘텐츠 스크립트가 manifest 에 없다. 파일 이름이 *.content.ts 인가').toBeTruthy()
  })

  it('등록된 파일이 실제로 나왔다', () => {
    const js: string[] = portal?.js ?? []
    expect(js.length).toBeGreaterThan(0)
    for (const f of js) {
      expect(existsSync(resolve(__dirname, '../.output/chrome-mv3', f)), `${f} 가 없다`).toBe(true)
    }
  })

  it('목록 페이지는 기사 페이지와 다른 스크립트가 맡는다', () => {
    // 목록에 기사용 배지 스크립트가 붙으면 목록 전체에 배지가 하나 뜬다.
    const article = (manifest.content_scripts ?? []).find((cs: any) =>
      (cs.matches ?? []).some((m: string) => m.includes('n.news.naver.com')))
    expect(article?.js?.[0]).not.toBe(portal?.js?.[0])
  })

  it('목록 페이지 권한이 섹션 경로로 좁혀져 있다', () => {
    // news.naver.com 전체를 받으면 포털 첫 화면·댓글·마이뉴스까지 들어간다.
    const list = hostPermissions.filter((h) => h.includes('news.naver.com/'))
    expect(list.some((h) => h === 'https://news.naver.com/*')).toBe(false)
    expect(hostPermissions).toContain('https://news.naver.com/section/*')
  })
})
