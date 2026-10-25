// manifest 규칙이 살아 있는지 본다.
//
// **빌드된 manifest 를 읽는다.** wxt.config.ts 만 읽으면 안 된다.
// content_scripts 는 entrypoints/*.ts 에서 만들어져 config 객체에 없기 때문에,
// config 만 검사하면 matches 를 '<all_urls>' 로 바꿔도 통과해 버린다.
// MV3 에서 content_scripts 의 matches 는 그 자체로 사이트 접근 권한이다.
//
// 권한 표의 원본은 docs/security/secure-coding.md 2절이고, 이 테스트는 그중
// "절대 쓰지 않기로 한 것"을 기계가 읽는 형태로 옮긴 것이다.
import { readFileSync, existsSync } from 'node:fs'
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

/** 호스트가 비어 있는 패턴. https://news.naver.com/* 같은 경로 와일드카드는 허용한다. */
const 와일드카드_호스트 = /^(\*|https?|\*:\/\/\*)(:\/\/)?(\*\/|\*$|\/\*)/

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
    it(`${이름} 에 와일드카드 호스트가 없다`, () => {
      for (const p of 목록) {
        expect(p, `${이름} 의 와일드카드 호스트: ${p}`).not.toMatch(와일드카드_호스트)
        expect(p, `${이름} 의 호스트가 비었음: ${p}`).toMatch(/^https:\/\/[a-z0-9.-]+\//i)
      }
    })
  }

  it('content_scripts 가 붙는 곳은 host_permissions 에도 있다', () => {
    for (const m of contentScriptMatches) {
      expect(hostPermissions, `content_scripts 대상인데 host_permissions 에 없음: ${m}`).toContain(m)
    }
  })
})
