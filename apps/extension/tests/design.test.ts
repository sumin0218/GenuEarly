// 디자인 규칙 중 **숫자로 검사할 수 있는 것**.
//
// 보기 좋은가는 여기서 못 본다. 여기서 보는 것은 **읽히는가**다 —
// 근거와 결정은 docs/design.md 에 있다.
import { describe, expect, it } from 'vitest'
import { GLYPH, LEVEL_ICON, LEVEL_INK, LEVEL_INK_DARK, UI_ICON } from '../lib/item-view'
import { ICON_DATA } from '../lib/icon-data'
import type { DisplayLevel } from '../lib/protocol'

const LEVELS = ['PENDING', 'SAFE', 'CHECK', 'CAUTION', 'UNDETERMINED'] as const

/** WCAG 상대 휘도. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * (ch[0] as number) + 0.7152 * (ch[1] as number) + 0.0722 * (ch[2] as number)
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

describe('단계 색이 읽힌다', () => {
  // 전에 쓰던 값은 그렇지 않았다. #f29900 은 흰 바탕에서 2.25:1 로 **그래픽 기준 3:1 에도**
  // 못 미쳤다. 목록 동그라미는 이 색이 곧 아이콘 색이라 흐린 화면에서 보이지 않았다.
  it.each(LEVELS)('%s 는 흰 바탕에서 4.5:1 이상이다', (level) => {
    expect(contrast(LEVEL_INK[level], '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })

  it.each(LEVELS)('%s 는 어두운 바탕(#111)에서 4.5:1 이상이다', (level) => {
    expect(contrast(LEVEL_INK_DARK[level], '#111111')).toBeGreaterThanOrEqual(4.5)
  })

  it('아이콘 배지 바탕 위의 흰 글자도 읽힌다', () => {
    // setBadgeBackgroundColor 는 LEVEL_INK 를 **바탕**으로 쓰고 글자는 흰색이다.
    // 같은 값이 양쪽을 만족해야 한다 (lib/judge.ts 의 setIconBadge).
    for (const level of LEVELS) {
      expect(contrast(LEVEL_INK[level], '#ffffff'), level).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('색을 못 봐도 구분된다', () => {
  it('단계마다 아이콘이 다르다', () => {
    expect(new Set(LEVELS.map((l) => LEVEL_ICON[l])).size).toBe(LEVELS.length)
  })

  it('단계마다 글자 기호가 다르다 — 아이콘을 못 쓰는 자리용', () => {
    expect(new Set(LEVELS.map((l) => GLYPH[l])).size).toBe(LEVELS.length)
  })

  it('모든 아이콘이 실제로 들어 있다', () => {
    for (const level of LEVELS) {
      const shape = ICON_DATA[LEVEL_ICON[level]] as { outline: unknown[] } | undefined
      expect(shape?.outline.length, `${level} 아이콘이 비어 있다`).toBeGreaterThan(0)
    }
  })
})

describe('아이콘이 제품 규칙을 넘지 않는다', () => {
  // docs/product.md 2절: 참·거짓을 말하지 않는다.
  it('신호 없음에 체크표를 쓰지 않는다', () => {
    // 체크표는 "확인했다 · 맞다 · 검증됨" 으로 읽힌다. ChatKHU 가 쓴 문구가 SAFE 를
    // 일부러 "눈에 띄는 신호 없음" 으로 쓴 것과 같은 이유다.
    // **아이콘은 문구보다 먼저 읽힌다.**
    expect(LEVEL_ICON.SAFE).not.toMatch(/check|tick|verif|shield|thumb/i)
  })

  it('글자 기호에도 사용자에게 보이는 말을 쓰지 않는다', () => {
    // 한때 아이콘 배지에 '안심' 이라고 적어 두었다.
    for (const level of LEVELS) {
      expect(GLYPH[level].length, `${level} 기호가 너무 길다`).toBeLessThanOrEqual(1)
    }
  })
})

describe('이모지를 쓰지 않는다', () => {
  // 넷이 전부 같은 동그라미라 적록색각 이상에서 구분되지 않았고,
  // 플랫폼마다 다른 그림이 나왔다 (docs/design.md 2절).
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u

  it('단계 기호에 이모지가 없다', () => {
    for (const level of LEVELS) {
      expect(EMOJI.test(GLYPH[level]), `${level}: ${GLYPH[level]}`).toBe(false)
    }
  })
})

describe('아이콘 데이터', () => {
  it('쓰는 것만 들어 있다 — 2,630개를 들고 오지 않는다', () => {
    const used = new Set<string>([
      ...LEVELS.map((l) => LEVEL_ICON[l] as string),
      ...Object.values(UI_ICON) as string[],
    ])
    for (const name of Object.keys(ICON_DATA)) {
      expect(used.has(name), `${name} 은 아무도 쓰지 않는다`).toBe(true)
    }
  })

  it('근거의 세기를 가르는 진한 벌이 있다', () => {
    // 제목만 본 판단과 본문까지 본 판단을 같은 생김새로 그리지 않는다
    // (requirements.md 4-3절). 돌아가는 표시만 예외 — 아직 근거가 없다.
    for (const level of LEVELS) {
      if (level === 'PENDING') continue
      const shape = ICON_DATA[LEVEL_ICON[level]] as { filled?: unknown[] }
      expect(shape.filled?.length, `${level} 에 진한 벌이 없다`).toBeGreaterThan(0)
    }
  })
})

/** 타입이 빠진 단계가 없는지 — 새 단계를 더하면 여기서 걸린다. */
const _exhaustive: Record<DisplayLevel, unknown> = LEVEL_ICON
void _exhaustive

// --- 토큰 규율 -------------------------------------------------------------
//
// 값을 그때그때 고르면 10px·14px·6px 이 섞여 같은 성격의 여백이 자리마다 달라진다.
// 토큰을 만들어 놓고 생값을 남기면 토큰이 아니라 장식이다.
// 쓰는 법은 LinKHU(https://github.com/kangkyunghyun/LinKHU) 에서 가져왔다 (docs/design.md).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const STYLESHEETS = [
  ['팝업', resolve(__dirname, '../entrypoints/popup/style.css')],
  ['기사 배지', resolve(__dirname, '../assets/content.css')],
] as const

/** 주석을 뗀다. 주석 안의 예시(#a40f16 같은)까지 검사하면 설명을 못 쓴다. */
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** 토큰을 정의하는 블록. 여기 안에서는 생값이 당연하다. */
function outsideTokenBlocks(css: string): string {
  // `:root {` 가 토큰 자리다. 콘텐츠 스크립트의 CSS 는 Shadow DOM 안이라 바깥 문서의
  // `:root` 가 닿지 않아, **그 안의 각 요소가 자기 토큰을 자기 블록에 둔다** —
  // `.ge-badge`(기사 배지)와 `.ge-toast`(다 봤다는 말풍선)가 그렇다.
  // 어두운 모드 블록도 토큰을 다시 적는 자리다.
  return strip(css)
    .replace(/@media \(prefers-color-scheme: dark\)\s*\{[\s\S]*?\n\}\n\}/g, '')
    .replace(/(:root|\.ge-badge|\.ge-toast)\s*\{[\s\S]*?\n\}/g, '')
}

describe('값을 토큰에서 고른다', () => {
  it.each(STYLESHEETS)('%s: 색을 토큰 밖에서 적지 않는다', (_name, path) => {
    const hits = [...outsideTokenBlocks(readFileSync(path, 'utf8')).matchAll(/#[0-9a-fA-F]{3,8}\b/g)]
      .map((m) => m[0])
    expect(hits, '색은 역할 이름 토큰으로만 쓴다').toEqual([])
  })

  it.each(STYLESHEETS)('%s: 여백을 토큰에서 고른다', (_name, path) => {
    const body = outsideTokenBlocks(readFileSync(path, 'utf8'))
    // 1px 은 머리카락 선과 광학 보정이라 토큰으로 두지 않는다. 2px 은 줄 간격이다.
    const 허용 = /^(0|1px|2px|auto|inherit|var\(--ge-space-\d+\))$/
    const hits: string[] = []
    for (const m of body.matchAll(/\b(gap|column-gap|row-gap|padding|margin)(-top|-bottom|-left|-right)?:\s*([^;]+);/g)) {
      for (const part of (m[3] ?? '').trim().split(/\s+/)) {
        if (!허용.test(part)) hits.push(`${m[1]}${m[2] ?? ''}: ${part}`)
      }
    }
    expect(hits, '4px 배수 토큰에서 고른다').toEqual([])
  })
})

describe('제품의 색이 판정의 색과 부딪히지 않는다', () => {
  // LinKHU 는 학교 빨강(#a40f16)을 제품 색으로 쓴다. **우리는 빨강을 쓸 수 없다** —
  // 주의 단계가 #c4242a 라 제품 색과 판정 색이 거의 같은 빨강이 된다.
  // 그러면 사용자가 둘을 가리지 못하고 모든 팝업이 경고처럼 보인다.
  const BRAND = '#162636'

  const BRAND_DARK = '#e7edf3'

  /** 색상(0~360)·채도·밝기. 무채색이면 h 는 0 이다. */
  function hsl(hex: string): { h: number; s: number; l: number } {
    const n = parseInt(hex.slice(1), 16)
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255) as [number, number, number]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2
    const d = max - min
    if (d === 0) return { h: 0, s: 0, l }
    const s = d / (1 - Math.abs(2 * l - 1))
    const raw = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    return { h: ((raw * 60) % 360 + 360) % 360, s, l }
  }

  it('제품의 색이 단계 색 중 하나와 같지 않다', () => {
    const 단계색 = [...Object.values(LEVEL_INK), ...Object.values(LEVEL_INK_DARK)]
    expect(단계색).not.toContain(BRAND)
  })

  it('제품의 색이 단계 색으로 오인되지 않는다', () => {
    // **색상각만 보면 틀린다.** #162636 은 색상으로는 파랑 쪽이지만 밝기가 15% 라
    // 사실상 검정으로 읽힌다 — 어떤 단계 색과도 헷갈리지 않는다.
    // 그래서 둘 중 하나면 된다: **거의 검정이거나(또는 거의 흰색), 색상이 멀거나.**
    const { light, dark } = { light: hsl(BRAND), dark: hsl(BRAND_DARK) }

    expect(light.l, '밝은 테마의 제품 색은 잉크처럼 어두워야 한다').toBeLessThan(0.25)
    expect(dark.l, '어두운 테마의 제품 색은 잉크처럼 밝아야 한다').toBeGreaterThan(0.75)

    // 단계 색은 그 범위 밖에 있다 — 그래서 섞이지 않는다.
    for (const [level, color] of Object.entries(LEVEL_INK)) {
      const c = hsl(color)
      expect(c.l, `${level}(${color}) 이 제품 색만큼 어둡다`).toBeGreaterThan(0.25)
    }
    for (const [level, color] of Object.entries(LEVEL_INK_DARK)) {
      const c = hsl(color)
      expect(c.l, `${level}(${color}) 이 제품 색만큼 밝다`).toBeLessThan(0.75)
    }
  })

  it('빨강을 제품 색으로 쓰지 않는다 — LinKHU 와 갈리는 자리다', () => {
    // 학교 빨강(#a40f16)을 그대로 가져오면 주의 단계(#c4242a)와 거의 같은 빨강이 된다.
    const h = hsl(BRAND)
    const 빨강계열 = h.s > 0.2 && (h.h < 25 || h.h > 335)
    expect(빨강계열, '제품 색과 판정 색을 가릴 수 없게 된다').toBe(false)
  })
})

describe('기사 위 배지는 한 줄이다', () => {
  // 읽으려고 연 기사 위에 우리 상자가 일곱 줄을 덮으면 안 된다.
  // 항목과 판단 근거는 **팝업**이 더 넓게, 기사를 가리지 않고 보여 준다.
  const badgeCss = strip(readFileSync(resolve(__dirname, '../assets/content.css'), 'utf8'))
  /** 배지에 대한 규칙은 **배지 부분만** 본다. 같은 파일·같은 Shadow DOM 에 말풍선도 산다. */
  const onlyBadge = (css: string) => css.slice(0, css.indexOf('.ge-toast'))
  /** 주석을 뗀다 — "role 을 두지 않는다" 고 적은 주석까지 걸리면 설명을 못 쓴다. */
  const badgeTs = strip(readFileSync(resolve(__dirname, '../entrypoints/content.ts'), 'utf8'))
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')

  it('펼쳐지는 상세가 없다', () => {
    for (const 클래스 of ['ge-badge__detail', 'ge-badge__row', 'ge-badge__note']) {
      expect(badgeCss, `${클래스} 가 다시 들어왔다`).not.toContain(클래스)
      expect(badgeTs, `${클래스} 가 다시 들어왔다`).not.toContain(클래스)
    }
  })

  it('항목 줄을 만들지 않는다', () => {
    expect(badgeTs, 'toRows 는 팝업이 쓴다').not.toContain('toRows')
  })

  it('누를 수 있는 것처럼 보이지 않는다', () => {
    // 누를 것이 없는데 손가락 커서를 두거나 초점을 받으면 사용자가 눌러 보고 아무 일도 없다.
    //
    // **배지만 본다.** 같은 Shadow DOM 안에 말풍선도 사는데 그쪽에는 닫기 단추가
    // 있어서 `cursor: pointer` 와 `role` 이 **있어야 맞다** (lib/toast.ts).
    // 파일 전체를 보면 그 단추 때문에 이 규칙이 깨진 것처럼 읽힌다.
    // **범위를 좁힌 검사는 범위가 비면 헛돈다.** 잘라 낸 것이 남아 있는지 먼저 본다.
    expect(onlyBadge(badgeCss).length, '배지 부분을 못 잘라 냈다').toBeGreaterThan(100)
    expect(onlyBadge(badgeCss)).not.toContain('cursor: pointer')
    expect(badgeTs).not.toContain('tabIndex')
    const 배지함수 = /function createBadge\(\)[\s\S]*?\n\}/.exec(badgeTs)?.[0] ?? ''
    expect(배지함수.length, 'createBadge 를 못 찾았다 — 못 찾으면 이 검사는 늘 통과한다').toBeGreaterThan(100)
    expect(배지함수, '배지는 누를 것이 없다').not.toContain('role')
  })

  it('판정 전체는 그대로 들고 있는다', () => {
    // 화면에 적지 않을 뿐이다. 팝업이 이 값을 물어 간다.
    expect(badgeTs).toContain('state = { level, verdict }')
  })
})
