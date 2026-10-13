// manifest 규칙이 살아 있는지 본다.
//
// 권한 표의 원본은 docs/security/secure-coding.md 2절이고, 이 테스트는 그중
// "절대 쓰지 않기로 한 것"을 기계가 읽는 형태로 옮긴 것이다.
// 권한을 늘리는 PR이 오면 여기서 먼저 걸린다.
import { describe, expect, it } from 'vitest'
import config from '../wxt.config'

const manifest = (config.manifest ?? {}) as Record<string, any>
const permissions: string[] = manifest.permissions ?? []
const hostPermissions: string[] = manifest.host_permissions ?? []

describe('manifest 권한', () => {
  it('쓰지 않기로 한 권한이 없다', () => {
    // docs/security/secure-coding.md 2절의 "쓰지 않는다" 목록
    const 금지 = ['tabs', 'webRequest', 'declarativeNetRequest', 'cookies', 'history', 'bookmarks']
    expect(permissions.filter((p) => 금지.includes(p))).toEqual([])
  })

  it('<all_urls> 를 쓰지 않는다', () => {
    const 전체 = JSON.stringify(manifest)
    expect(전체).not.toContain('<all_urls>')
  })

  it('host_permissions 에 와일드카드 도메인이 없다', () => {
    // */*  나  *://*/*  처럼 호스트가 비어 있는 패턴을 막는다.
    // https://news.naver.com/* 같은 경로 와일드카드는 허용한다.
    for (const host of hostPermissions) {
      expect(host, `와일드카드 호스트: ${host}`).not.toMatch(/^\*:\/\/(\*\/|\*$)/)
      expect(host, `호스트가 비었음: ${host}`).toMatch(/^https:\/\/[a-z0-9.-]+\//i)
    }
  })

  it('host_permissions 와 content_scripts 대상이 어긋나지 않는다', () => {
    const matches: string[] = (manifest.content_scripts ?? []).flatMap((cs: any) => cs.matches ?? [])
    for (const m of matches) {
      expect(hostPermissions, `content_scripts 대상인데 host_permissions 에 없음: ${m}`).toContain(m)
    }
  })
})
