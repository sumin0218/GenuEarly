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
      'm.entertain.naver.com',
      'm.sports.naver.com',
      'm.wikitree.co.kr',
      'n.news.naver.com',
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

  it('네이버의 기사 경로 넷을 다 받는다', () => {
    // 섹션 한 페이지에서 실제로 센 값: 랭킹 170, hotissue 16 (2026-10-27).
    for (const 경로 of ['/article/', '/mnews/article/', '/mnews/ranking/article/', '/mnews/hotissue/article/']) {
      expect(
        contentScriptMatches.some((m) => m.startsWith(`https://n.news.naver.com${경로}`)),
        `${경로} 를 받지 않는다 — 목록에서 눌러 들어간 기사에 배지가 안 뜬다`,
      ).toBe(true)
    }
  })

  it('댓글 화면을 빼 둔다 — 본문이 없는 곳에서 돌지 않는다', () => {
    const excludes: string[] = (manifest.content_scripts ?? []).flatMap(
      (cs: any) => cs.exclude_matches ?? [],
    )
    expect(excludes).toContain('https://n.news.naver.com/mnews/article/comment/*')
  })

  it('content_scripts 가 붙는 곳은 host_permissions 에도 있다', () => {
    for (const m of contentScriptMatches) {
      expect(hostPermissions, `content_scripts 대상인데 host_permissions 에 없음: ${m}`).toContain(m)
    }
  })
})

describe('제출본에 개발용 주소가 없다', () => {
  // `PROXY_URL` 이 상수였을 때 `localhost` 가 제출본에 그대로 들어갈 뻔했다.
  // 그러면 심사위원 브라우저에서 **모든 기사가 ⚪** 가 된다.
  // 주석 하나에 기대지 않고 **빌드 결과**를 본다.
  //
  //   WXT_PROXY_URL=https://<배포주소> npm run build -w @genuearly/extension
  const dir = resolve(__dirname, '../.output/chrome-mv3')
  const bundled = () =>
    readdirSync(resolve(dir, 'background.js') ? dir : dir, { recursive: true, encoding: 'utf8' })
      .filter((f) => typeof f === 'string' && f.endsWith('.js'))
      .map((f) => readFileSync(resolve(dir, f as string), 'utf8'))

  it('WXT_PROXY_URL 을 주면 그 주소가 들어간다', () => {
    const url = process.env.WXT_PROXY_URL
    if (!url) {
      // 개발 빌드다. 여기서는 localhost 가 들어 있는 것이 정상이라 검사만 건너뛴다.
      expect(bundled().some((s) => s.includes('localhost:8787'))).toBe(true)
      return
    }
    expect(bundled().some((s) => s.includes(url)), '넣은 주소가 번들에 없다').toBe(true)
  })

  it('WXT_PROXY_URL 을 준 빌드에는 localhost 가 없다', () => {
    if (!process.env.WXT_PROXY_URL) return   // 개발 빌드는 건너뛴다
    const hit = bundled().filter((s) => s.includes('localhost'))
    expect(hit, '제출본에 개발용 주소가 남아 있다').toHaveLength(0)
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
