// @vitest-environment happy-dom
//
// ② 콘텐츠 스크립트가 **언제** 범례를 띄우는가.
//
// 범례 자체는 tests/portal.test.ts 가 본다. 여기서 보는 것은 타이밍 하나다 —
// **포털이 목록을 나중에 그려도 범례가 뜨는가.** 처음 한 번만 보면, 시작할 때
// 기사 링크가 없는 페이지에서는 아이콘만 붙고 범례는 끝내 안 뜬다 (승원 리뷰 #39).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import content from '../../../packages/content/ui.ko.json'
import { LEGEND_CLASS, MARK_CLASS } from '../lib/portal'

/** 목록이 다시 그려진 뒤 다시 훑기까지 기다리는 시간. portal.content.ts 와 같아야 한다. */
const RESCAN_DEBOUNCE_MS = 300

const 기사 = (n: number) => `https://news.naver.com/mnews/article/001/000${n}`

function 링크를놓는다(...urls: string[]): void {
  for (const u of urls) {
    const a = document.createElement('a')
    a.href = u
    a.textContent = '여덟 글자가 넘는 기사 제목입니다'
    document.body.append(a)
  }
}

/** 저장소와 판단을 흉내 낸다. 판단은 늘 SAFE 로 돌려준다. */
function stub(접어뒀나 = false): void {
  const local = new Map<string, unknown>()
  if (접어뒀나) local.set('portalLegendCollapsed', true)
  vi.stubGlobal('browser', {
    storage: {
      local: {
        get: (k: string) => Promise.resolve({ [k]: local.get(k) }),
        set: (o: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(o)) local.set(k, v)
          return Promise.resolve()
        },
      },
    },
    runtime: { sendMessage: () => Promise.resolve({ level: 'SAFE', basis: 'headline' }) },
  })
  // 화면에 들어왔는지는 보지 않는다 — 넣자마자 들어온 것으로 친다.
  class 바로보임 {
    constructor(private cb: (e: { isIntersecting: boolean; target: Element }[]) => void) {}
    observe(el: Element): void { this.cb([{ isIntersecting: true, target: el }]) }
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('IntersectionObserver', 바로보임)
  vi.stubGlobal('defineContentScript', (def: unknown) => def)
}

/** 콘텐츠 스크립트를 띄운다. */
async function 띄운다(): Promise<void> {
  vi.resetModules()
  const mod = (await import('../entrypoints/portal.content')) as {
    default: { main: (ctx: { onInvalidated: (f: () => void) => void }) => void }
  }
  mod.default.main({ onInvalidated: () => {} })
}

const 쉰다 = (ms: number) => new Promise((r) => setTimeout(r, ms))
const 표시 = () => document.querySelectorAll(`.${MARK_CLASS}`).length
const 범례 = () => document.querySelector(`.${LEGEND_CLASS}`)

beforeEach(() => {
  document.body.replaceChildren()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('범례가 뜨는 때', () => {
  it('처음부터 기사 링크가 있으면 뜬다', async () => {
    stub()
    링크를놓는다(기사(1), 기사(2))
    await 띄운다()
    await 쉰다(20)

    expect(표시()).toBeGreaterThan(0)
    expect(범례(), '표시가 붙었으면 그 뜻도 알려야 한다').not.toBeNull()
  })

  it('**목록이 나중에 그려져도 뜬다** — 포털은 목록을 다시 그린다', async () => {
    stub()
    await 띄운다() // 빈 문서로 시작한다
    await 쉰다(20)
    expect(표시(), '아직 기사가 없으니 표시도 없다').toBe(0)
    expect(범례(), '설명할 표시가 없는데 상자만 뜨면 안 된다').toBeNull()

    링크를놓는다(기사(3)) // 포털이 목록을 그린다
    await 쉰다(RESCAN_DEBOUNCE_MS + 150)

    expect(표시(), '다시 훑어 표시가 붙어야 한다').toBeGreaterThan(0)
    expect(범례(), '아이콘만 붙고 범례가 안 뜨던 자리다 (리뷰 #39)').not.toBeNull()
  })

  it('**접어 둔 사람에게도 상자는 뜬다** — 접힌 채로다. 없애지 않는다', async () => {
    stub(true)
    await 띄운다()
    링크를놓는다(기사(4))
    await 쉰다(RESCAN_DEBOUNCE_MS + 150)

    expect(표시()).toBeGreaterThan(0)
    const box = 범례()
    expect(box, '닫아 버리면 설명으로 돌아올 길이 없다').not.toBeNull()
  })

  it('여러 번 다시 그려도 범례는 하나다', async () => {
    stub()
    링크를놓는다(기사(5))
    await 띄운다()
    await 쉰다(20)

    링크를놓는다(기사(6))
    await 쉰다(RESCAN_DEBOUNCE_MS + 150)
    링크를놓는다(기사(7))
    await 쉰다(RESCAN_DEBOUNCE_MS + 150)

    expect(document.querySelectorAll(`.${LEGEND_CLASS}`)).toHaveLength(1)
  })
})

describe('표시에 붙는 설명', () => {
  // 전에는 배지 문구를 그대로 썼다. 아이콘에 마우스를 올리면 "판단하지 못함",
  // "주의할 신호 있음" 이 떴는데 **그것은 기사 전체에 대한 말이다.** 여기 표시는
  // 제목만 보고 낸 것이라 같은 말을 쓰면 안 된다 — 범례를 따로 받아 둔 이유다.
  const 배지이름 = Object.values(content.badge).map((b) => b.name)

  it('**배지 문구를 쓰지 않는다** — 기사 전체에 대한 말이다', async () => {
    stub()
    링크를놓는다(기사(8))
    await 띄운다()
    await 쉰다(30)

    const 설명 = [...document.querySelectorAll(`.${MARK_CLASS}`)].map(
      (el) => el.getAttribute('aria-label') ?? '',
    )
    expect(설명.length, '표시가 안 붙었다').toBeGreaterThan(0)
    for (const 한줄 of 설명) {
      expect(배지이름, `"${한줄}" 은 배지 문구다`).not.toContain(한줄)
    }
  })

  it('범례와 같은 말을 한다 — 둘이 다르면 범례가 범례가 아니다', async () => {
    stub()
    링크를놓는다(기사(9))
    await 띄운다()
    await 쉰다(30)

    const 범례문구 = Object.values(content.portal.legend.levels)
    for (const el of document.querySelectorAll(`.${MARK_CLASS}`)) {
      expect(범례문구, '표시 설명이 범례에 없는 말이다').toContain(el.getAttribute('aria-label'))
    }
  })
})
