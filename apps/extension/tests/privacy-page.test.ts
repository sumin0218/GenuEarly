// 처리방침이 **코드와 다른 말을 하지 않는가.**
//
// 이 페이지는 웹스토어에 제출하는 문서다. 보관 기간이나 권한을 코드에서 고치고
// 페이지를 그대로 두면, **공개한 약속과 실제 동작이 어긋난다.** 스토어 정책 위반이고,
// 무엇보다 사용자에게 거짓을 말하는 것이 된다.
//
// 그래서 숫자와 권한은 원본에서 읽어 와 맞춘다. 문장 전체를 검사하지는 않는다 —
// 그러면 글을 다듬을 때마다 깨져서, 검사를 끄게 된다.
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ARCHIVE_MAX } from '../lib/archive'

const 후보 = ['landing/privacy.html', '../../landing/privacy.html']
const 경로 = 후보.map((p) => resolve(process.cwd(), p)).find((p) => existsSync(p))
const html = 경로 ? readFileSync(경로, 'utf8') : ''

const manifest = ['apps/extension/wxt.config.ts', '../../apps/extension/wxt.config.ts']
  .map((p) => resolve(process.cwd(), p))
  .find((p) => existsSync(p))
const config = manifest ? readFileSync(manifest, 'utf8') : ''

describe('처리방침이 코드와 같은 말을 한다', () => {
  it('페이지를 찾는다', () => {
    expect(경로, 'landing/privacy.html 을 찾지 못했다').toBeTruthy()
  })

  it('보관함 상한을 코드와 같은 수로 적는다', () => {
    expect(html, `보관함 상한이 ${ARCHIVE_MAX} 건인데 페이지에 그 수가 없다`)
      .toContain(`${ARCHIVE_MAX}건`)
  })

  it('받는 권한을 빠짐없이 적는다', () => {
    // 권한이 늘면 페이지에도 적어야 한다. 적지 않고 늘리는 것을 여기서 막는다.
    const 권한 = [...config.matchAll(/'(storage|contextMenus|tabs|scripting|cookies|history|downloads|webRequest)'/g)]
      .map((m) => m[1])
    expect(권한.length, 'wxt.config.ts 에서 권한 목록을 읽지 못했다').toBeGreaterThan(0)
    for (const p of new Set(권한)) {
      expect(html, `권한 "${p}" 가 처리방침에 적혀 있지 않다`).toContain(p)
    }
  })

  it('**모든 사이트 권한을 받지 않는다고 적은 것이 사실인가**', () => {
    // 페이지가 그렇게 적어 두었다. 설정이 바뀌면 거짓말이 된다.
    expect(html).toContain('&lt;all_urls&gt;')
    // **따옴표 안에 든 것만 본다.** 설정 파일의 주석이 "<all_urls> 를 쓰지 않는다" 고
    // 적어 두어서, 글자만 찾으면 그 주석에 걸린다.
    for (const 금지 of ['<all_urls>', '*://*/*']) {
      for (const q of ["'", '"', '`']) {
        expect(config, `설정에 ${금지} 가 값으로 들어 있다`).not.toContain(`${q}${금지}${q}`)
      }
    }
  })

  it('중계 서버 주소를 적는다', () => {
    expect(html).toContain('genuearly-proxy')
  })

  it('**단정하는 말을 쓰지 않는다**', () => {
    for (const 금지 of ['안심', '가짜 뉴스', '허위', '거짓입니다', '사실입니다', '검증된']) {
      expect(html, `처리방침에 "${금지}" 가 있다`).not.toContain(금지)
    }
  })
})
