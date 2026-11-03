// @vitest-environment happy-dom
//
// ④ 공유 직전 알림.
//
// 여기서 보는 것 셋이다. **막지 않는가**, **공유 단추를 알아보는가**,
// **엉뚱한 것을 공유 단추로 보지 않는가**.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import content from '../../../packages/content/ui.ko.json'
import { SHARE_NOTICE_MS, createShareNotice, isShareControl, listenForShare } from '../lib/share'

const C = content.share

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
})

/** `html` 을 붙이고 `#t` 를 돌려준다. */
function put(html: string): Element {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.append(host)
  const el = host.querySelector('#t')
  if (!el) throw new Error('#t 가 없다')
  return el
}

describe('공유 단추 알아보기', () => {
  it.each([
    ['영어 클래스', '<button id="t" class="btn_share">공유</button>'],
    ['밑줄로 이어진 이름', '<a id="t" class="u_cbox_copy">x</a>'],
    ['aria-label', '<button id="t" aria-label="URL 복사"></button>'],
    ['title', '<button id="t" title="링크 복사"></button>'],
    ['data 속성', '<button id="t" data-action="sns-share"></button>'],
    ['단추에 적힌 짧은 말', '<button id="t">공유하기</button>'],
    ['퍼가기', '<button id="t">퍼가기</button>'],
  ])('%s 를 알아본다', (_이름, html) => {
    expect(isShareControl(put(html))).toBe(true)
  })

  it('단추 안의 아이콘을 눌러도 알아본다 — 클릭은 가장 안쪽에 닿는다', () => {
    const icon = put('<button class="btn_share"><span id="t" class="ico"></span></button>')
    expect(isShareControl(icon)).toBe(true)
  })

  it.each([
    ['copyright — `copy` 를 품고 있지만 낱말이 다르다', '<small id="t" class="copyright">(c) 2026</small>'],
    ['평범한 링크', '<a id="t" class="link_news" href="/x">기사</a>'],
    ['본문 문단', '<p id="t">정부는 이 자료를 공유했다고 밝혔다. 관계자는 ...</p>'],
    ['빈 요소', '<div id="t"></div>'],
  ])('%s 는 공유 단추가 아니다', (_이름, html) => {
    expect(isShareControl(put(html))).toBe(false)
  })

  it('글자가 긴 요소는 보지 않는다 — 본문에 "공유" 가 있다고 단추가 되지 않는다', () => {
    const 긴글 = '이 자료를 공유한 것은 사실이라고 관계자가 말했다. ' + 'x'.repeat(50)
    expect(isShareControl(put(`<p id="t">${긴글}</p>`))).toBe(false)
  })

  it('아무것도 주지 않으면 false 다', () => {
    expect(isShareControl(null)).toBe(false)
  })
})

describe('듣기', () => {
  it('공유 단추 클릭을 잡는다', () => {
    const 부름: number[] = []
    const stop = listenForShare(() => 부름.push(1), document)
    put('<button id="t" class="btn_share">공유</button>').dispatchEvent(
      new Event('click', { bubbles: true }),
    )
    expect(부름).toHaveLength(1)
    stop()
  })

  it('copy 이벤트도 잡는다 — 본문에서 주소를 긁어 복사하는 길', () => {
    const 부름: number[] = []
    const stop = listenForShare(() => 부름.push(1), document)
    document.dispatchEvent(new Event('copy', { bubbles: true }))
    expect(부름).toHaveLength(1)
    stop()
  })

  it('**막지 않는다** — 누른 것은 그대로 일어난다', () => {
    const stop = listenForShare(() => {}, document)
    const btn = put('<button id="t" class="btn_share">공유</button>')
    let 사이트가받았나 = false
    btn.addEventListener('click', () => { 사이트가받았나 = true })

    const e = new Event('click', { bubbles: true, cancelable: true })
    btn.dispatchEvent(e)

    expect(사이트가받았나).toBe(true)
    expect(e.defaultPrevented).toBe(false)
    stop()
  })

  it('사이트가 stopPropagation 을 해도 잡는다 — capture 로 듣는다', () => {
    const 부름: number[] = []
    const stop = listenForShare(() => 부름.push(1), document)
    const btn = put('<button id="t" class="btn_share">공유</button>')
    btn.addEventListener('click', (e) => e.stopPropagation())
    btn.dispatchEvent(new Event('click', { bubbles: true }))
    expect(부름).toHaveLength(1)
    stop()
  })

  it('그만두면 더 듣지 않는다', () => {
    const 부름: number[] = []
    const stop = listenForShare(() => 부름.push(1), document)
    const btn = put('<button id="t" class="btn_share">공유</button>')
    btn.dispatchEvent(new Event('click', { bubbles: true }))
    stop()
    btn.dispatchEvent(new Event('click', { bubbles: true }))
    document.dispatchEvent(new Event('copy', { bubbles: true }))
    expect(부름).toHaveLength(1)
  })
})

describe('알림 상자', () => {
  it('처음에는 떠 있지 않다', () => {
    expect(createShareNotice(document).el.hidden).toBe(true)
  })

  it('ChatKHU 가 쓴 문구를 그대로 쓴다', () => {
    const n = createShareNotice(document)
    n.show()
    expect(n.el.textContent ?? '').toContain(C.message)
    expect(n.el.textContent ?? '').toContain(C.dismiss)
  })

  it('**단정하지 않는다** — 가짜·허위·거짓 같은 말을 쓰지 않는다', () => {
    const n = createShareNotice(document)
    n.show()
    const 글 = n.el.textContent ?? ''
    expect(글.length).toBeGreaterThan(0)
    for (const 금지 of ['가짜', '허위', '거짓', '조작']) expect(글).not.toContain(금지)
  })

  it('저절로 사라진다', () => {
    const n = createShareNotice(document)
    n.show()
    expect(n.el.hidden).toBe(false)
    vi.advanceTimersByTime(SHARE_NOTICE_MS - 1)
    expect(n.el.hidden).toBe(false)
    vi.advanceTimersByTime(1)
    expect(n.el.hidden).toBe(true)
  })

  it('말풍선보다 오래 떠 있다 — 막 무언가를 하려는 순간에 끼어드는 말이다', async () => {
    const { TOAST_MS } = await import('../lib/toast')
    expect(SHARE_NOTICE_MS).toBeGreaterThan(TOAST_MS)
  })

  it('닫기를 누르면 사라진다', () => {
    const n = createShareNotice(document)
    n.show()
    const ok = n.el.querySelector('button')
    if (!ok) throw new Error('닫기 단추가 없다')
    ok.dispatchEvent(new Event('click', { bubbles: true }))
    expect(n.el.hidden).toBe(true)
  })

  it('다시 띄우면 시계가 다시 간다', () => {
    const n = createShareNotice(document)
    n.show()
    vi.advanceTimersByTime(SHARE_NOTICE_MS - 100)
    n.show()
    vi.advanceTimersByTime(200)
    expect(n.el.hidden).toBe(false)
  })
})
