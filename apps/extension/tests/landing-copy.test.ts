// 랜딩 페이지가 **제품이 쓰는 말을 그대로 쓰는가.**
//
// 실제로 어긋났다. 제품은 🟢 를 "눈에 띄는 신호 없음" 이라고 말하는데 랜딩에는
// **"안심"** 이라고 적혀 있었다. 둘은 다른 말이다 —
//
//   "눈에 띄는 신호 없음"  글에서 걸리는 것이 없었다
//   "안심"                 믿어도 된다
//
// 글만 보고 판단하는 제품이 두 번째를 말하면 **하지 않기로 한 일을 하는 것**이다
// (docs/product.md 2절 "진위를 단정한다 → 하지 않는다"). 잘 쓰인 거짓 기사는
// 신호가 없어서 🟢 로 나온다 — 그래서 더더욱 "안심" 이라고 적으면 안 된다.
//
// 랜딩은 테스트가 없는 정적 파일이라 이 검사를 여기 둔다. 문구의 원본은
// packages/content 하나다.
import { readFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import content from '../../../packages/content/ui.ko.json'

const 후보 = ['landing/index.html', '../../landing/index.html']
const 경로 = 후보.map((p) => resolve(process.cwd(), p)).find((p) => existsSync(p))
const html = 경로 ? readFileSync(경로, 'utf8') : ''

describe('랜딩이 제품과 같은 말을 쓴다', () => {
  it('랜딩 파일을 찾는다', () => {
    expect(경로, 'landing/index.html 을 찾지 못했다').toBeTruthy()
  })

  it.each(['SAFE', 'CHECK', 'CAUTION', 'UNDETERMINED'] as const)(
    '%s 단계를 제품과 같은 이름으로 적는다',
    (level) => {
      const 이름 = (content.badge as Record<string, { name: string }>)[level]?.name
      expect(이름, `${level} 문구가 없다`).toBeTruthy()
      expect(html, `랜딩에 "${이름}" 이 없다 — 제품이 쓰는 말을 그대로 써야 한다`).toContain(이름)
    },
  )

  it('**제품이 쓰지 않는 단정하는 말을 쓰지 않는다**', () => {
    // "안심" 은 한때 랜딩에만 있던 말이다. 되살아나면 여기서 막는다.
    for (const 금지 of ['안심', '가짜 뉴스', '허위', '거짓입니다', '사실입니다', '검증된']) {
      expect(html, `랜딩에 "${금지}" 가 있다`).not.toContain(금지)
    }
  })

  it('🟢 가 "사실이라는 뜻이 아니다" 를 말한다', () => {
    // 신호가 없다는 것과 사실이라는 것은 다르다. 랜딩이 그 선을 그어야 한다.
    expect(html).toContain('사실이라는 뜻이 아닙니다')
  })
})
