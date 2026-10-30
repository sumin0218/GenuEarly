// @vitest-environment happy-dom
//
// 리포트 화면의 **보관함 서랍.**
//
// 서랍은 닫힌 채로 시작해야 하고, 닫혔을 때는 탭 순서에도 없어야 하며, 막·Esc·✕
// 셋 다로 닫혀야 한다. 키보드로 연 사람에게 **포커스를 되돌려 준다** — 닫은 뒤
// 문서 맨 위로 튕기면 읽던 자리를 잃는다.
//
// `report/main.ts` 는 **불러오는 순간 도는 모듈**이라 (팝업과 달리 실행 가드가 없다)
// 전역과 DOM 을 먼저 세우고 `import()` 로 불러온다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import content from '../../../packages/content/ui.ko.json'
import type { Report } from '../lib/report'

const A = content.report.archive

const 리포트 = (over: Partial<Report> = {}): Report => ({
  url: 'https://n.news.naver.com/article/001/0001',
  headline: '머리글',
  date: '2026-10-28',
  at: Date.now(),
  stage: 'done',
  rows: [],
  claims: [],
  ...over,
})

/** index.html 과 **같은 id 여야 한다.** 다르면 이 검사는 아무것도 지키지 않는다. */
function mount(): void {
  document.body.replaceChildren()
  const bar = document.createElement('header')
  for (const [tag, cls] of [['img', 'ge-report__logo'], ['span', 'ge-report__kind']] as const) {
    const e = document.createElement(tag)
    e.className = cls
    bar.append(e)
  }
  const wrong = document.createElement('button')
  wrong.id = 'report-wrong'
  const toggle = document.createElement('button')
  toggle.id = 'archive-toggle'
  toggle.setAttribute('aria-expanded', 'false')
  bar.append(wrong, toggle)

  const body = document.createElement('main')
  body.id = 'body'

  // 머리말과 본문은 `.ge-report` 안, **서랍과 막은 그 바깥.** index.html 과 같다 —
  // 다르면 `뒤쪽잠금` 이 잠글 것을 못 찾고, 검사는 통과해도 아무것도 지키지 않는다.
  const wrap = document.createElement('div')
  wrap.className = 'ge-report'
  wrap.append(bar, body)

  const scrim = document.createElement('div')
  scrim.id = 'archive-scrim'
  scrim.hidden = true
  const drawer = document.createElement('aside')
  drawer.id = 'archive'
  drawer.hidden = true
  document.body.append(wrap, scrim, drawer)
}

/**
 * 보관함 고치기는 **background 로 간다** (lib/archive.ts 의 줄 세우기).
 * 리포트 탭은 부탁만 하므로, 검사는 **무엇을 부탁했는지**를 본다.
 */
const 보낸부탁: unknown[] = []

/** 저장소를 메모리로 흉내 낸다. `local` 에 보관함, `session` 에 지금 리포트. */
function stub(archived: Report[], current: Report | null): void {
  보낸부탁.length = 0
  const local = new Map<string, unknown>()
  if (archived.length > 0) local.set('archive', { v: 1, items: archived })
  const area = (m: Map<string, unknown>) => ({
    get: (k: string | null) => Promise.resolve(k === null ? Object.fromEntries(m) : { [k]: m.get(k) }),
    set: (o: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(o)) m.set(k, v)
      return Promise.resolve()
    },
    remove: (keys: string | string[]) => {
      for (const k of [keys].flat()) m.delete(k)
      return Promise.resolve()
    },
  })
  const session = new Map<string, unknown>()
  if (current) session.set('report', current)
  vi.stubGlobal('browser', {
    storage: { local: area(local), session: area(session), onChanged: { addListener: () => {} } },
    runtime: {
      getURL: (x: string) => x,
      sendMessage: (m: unknown) => {
        보낸부탁.push(m)
        return Promise.resolve({ ok: true })
      },
    },
  })
}

const toggle = () => document.getElementById('archive-toggle') as HTMLButtonElement
const drawer = () => document.getElementById('archive') as HTMLElement
const scrim = () => document.getElementById('archive-scrim') as HTMLElement
const settle = () => new Promise((r) => setTimeout(r, 0))

async function load(archived: Report[] = [리포트()], current: Report | null = null): Promise<void> {
  mount()
  stub(archived, current)
  vi.resetModules()
  await import('../entrypoints/report/main')
  await settle()
}

describe('보관함 서랍', () => {
  beforeEach(() => {
    document.body.replaceChildren()
  })

  it('닫힌 채로 시작한다 — 막도 함께 숨어 있다', async () => {
    await load()
    expect(drawer().hidden, '열고 들어가면 리포트를 가린다').toBe(true)
    expect(scrim().hidden).toBe(true)
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
  })

  it('여는 단추에 이름이 붙는다 — 막대 셋뿐이라 글자가 없다', async () => {
    await load()
    expect(toggle().getAttribute('aria-label')).toBe(A.title)
  })

  it('닫기 단추의 이름은 "취소" 와 달라야 한다 — 같은 화면에 둘 다 있다', async () => {
    await load()
    toggle().click()
    await settle()
    const close = drawer().querySelector('.ge-archive__close')
    expect(close?.getAttribute('aria-label')).toBe(A.close)
    expect(A.close, '서랍을 닫는 것은 동작을 되돌리는 것이 아니다').not.toBe(A.cancel)
  })

  it('누르면 열리고 목록이 들어 있다', async () => {
    await load([리포트({ headline: '이태원 참사 외국인 유족' })])
    toggle().click()
    await settle()

    expect(drawer().hidden).toBe(false)
    expect(scrim().hidden).toBe(false)
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    expect(drawer().textContent).toContain('이태원 참사 외국인 유족')
    expect(drawer().textContent).toContain(A.title)
  })

  it('보관된 것이 없으면 그렇게 말한다', async () => {
    await load([])
    toggle().click()
    await settle()
    expect(drawer().textContent).toContain(A.empty)
  })

  it('보관 방식을 늘 알린다 — 어디로도 안 가고 사라진다는 것', async () => {
    await load()
    toggle().click()
    await settle()
    expect(drawer().textContent).toContain(A.note)
  })

  it.each([
    ['막을 누르면', () => scrim().click()],
    ['Esc 를 누르면', () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))],
    ['✕ 를 누르면', () => drawer().querySelector<HTMLButtonElement>('.ge-archive__close')?.click()],
  ])('%s 닫힌다', async (_이름, 닫기) => {
    await load()
    toggle().click()
    await settle()
    expect(drawer().hidden).toBe(false)

    닫기()
    expect(drawer().hidden).toBe(true)
    expect(scrim().hidden).toBe(true)
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
  })

  it('열면 포커스가 서랍 안으로 들어간다 — 그린 뒤에 옮긴다', async () => {
    await load([리포트()])
    toggle().click()
    await settle()
    expect(drawer().contains(document.activeElement), '빈 서랍에 포커스를 두면 안 읽힌다').toBe(true)
    expect((document.activeElement as HTMLElement).tagName).toBe('BUTTON')
  })

  it('닫으면 포커스가 여는 단추로 돌아온다', async () => {
    await load()
    toggle().click()
    await settle()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(document.activeElement, '맨 위로 튕기면 읽던 자리를 잃는다').toBe(toggle())
  })

  it('한 번 더 누르면 닫힌다', async () => {
    await load()
    toggle().click()
    await settle()
    toggle().click()
    expect(drawer().hidden).toBe(true)
  })

  it('목록에서 리포트를 고르면 서랍이 닫힌다 — 고른 것을 가리지 않는다', async () => {
    await load([리포트({ headline: '고를 것' })])
    toggle().click()
    await settle()

    drawer().querySelector<HTMLButtonElement>('.ge-archive__open')?.click()
    await settle()
    expect(drawer().hidden).toBe(true)
    expect(document.getElementById('body')?.textContent).toContain('고를 것')
  })

  it('보관본을 열면 **그때의 모습**이라고 말한다', async () => {
    await load([리포트()])
    toggle().click()
    await settle()
    drawer().querySelector<HTMLButtonElement>('.ge-archive__open')?.click()
    await settle()
    expect(document.getElementById('body')?.textContent).toContain(A.restored)
  })

  it('서랍이 열리면 뒤쪽은 만질 수 없다 — 막에 가린 것에 탭이 닿으면 안 된다', async () => {
    await load()
    const back = document.querySelector('.ge-report') as HTMLElement
    expect(back.inert).toBe(false)

    toggle().click()
    await settle()
    expect(back.inert, '막은 눈과 마우스만 막는다. 탭은 그대로 지나간다').toBe(true)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(back.inert, '잠긴 채로는 여는 단추가 포커스를 못 받는다').toBe(false)
    expect(document.activeElement).toBe(toggle())
  })

  it('지우기는 두 번 묻는다 — 한 번에 지워지면 되돌릴 길이 없다', async () => {
    await load([리포트()])
    toggle().click()
    await settle()

    const all = [...drawer().querySelectorAll('button')].find((b) => b.textContent === A.removeAll)
    expect(all, '"모두 삭제" 가 있어야 한다').toBeTruthy()
    all?.click()
    expect(all?.textContent, '누르자마자 지우지 않는다').toBe(A.confirmAll)
    expect(drawer().textContent).toContain(A.cancel)
  })

  it('**겹쳐 눌러도** 확인을 건너뛰지 않는다', async () => {
    await load([리포트({ headline: '남아야 할 것' })])
    toggle().click()
    await settle()

    const all = [...drawer().querySelectorAll('button')].find((b) => b.textContent === A.removeAll)
    all?.click() // 확인으로 바뀐다
    all?.click() // 겹쳐 누르기의 두 번째 — 바뀐 손잡이에 그대로 닿는다
    await settle()

    expect(보낸부탁, '확인 화면을 보지도 못하고 전부 지워지면 안 된다').toEqual([])
  })

  it('한 건 지우기는 background 에 부탁한다 — 탭이 직접 쓰지 않는다', async () => {
    await load([리포트()])
    toggle().click()
    await settle()

    drawer().querySelector<HTMLButtonElement>('.ge-archive__del')?.click()
    await settle()
    expect(보낸부탁).toEqual([
      { kind: 'archive-write', what: 'remove', url: 'https://n.news.naver.com/article/001/0001' },
    ])
  })
})
