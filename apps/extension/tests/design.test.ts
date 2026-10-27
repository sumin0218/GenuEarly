// 디자인 규칙 중 **숫자로 검사할 수 있는 것**.
//
// 보기 좋은가는 여기서 못 본다. 여기서 보는 것은 **읽히는가**다 —
// 근거와 결정은 docs/design.md 에 있다.
import { describe, expect, it } from 'vitest'
import { GLYPH, LEVEL_ICON, LEVEL_INK, LEVEL_INK_DARK } from '../lib/item-view'
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
    const used = new Set<string>(LEVELS.map((l) => LEVEL_ICON[l] as string))
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
