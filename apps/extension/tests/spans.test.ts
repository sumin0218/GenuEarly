// @vitest-environment happy-dom
//
// 본문에서 찾은 글자를 기사 화면의 자리로 바꾸는 부분.
//
// 여기서 보는 것은 **추출본과 화면의 글자가 다른데도 찾아내는가**다. 추출할 때
// 공백을 줄이고 `<br>` 자리에 개행을 심으므로, 그대로 `indexOf` 하면 못 찾는다.
import { describe, expect, it } from 'vitest'
import { findRanges, mapText, squeeze } from '../lib/spans'

/** `html` 을 담은 요소를 만든다. */
function host(html: string): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = html
  document.body.replaceChildren(el)
  return el
}

describe('자리표', () => {
  it('공백을 전부 지운다', () => {
    expect(mapText(host('<p>가 나\n다\t라</p>')).text).toBe('가나다라')
  })

  it('글자마다 어디서 왔는지 안다', () => {
    const el = host('<p>가나</p>')
    const m = mapText(el)
    expect(m.spots).toHaveLength(2)
    expect(m.spots[0]?.node.data).toBe('가나')
    expect(m.spots[0]?.offset).toBe(0)
    expect(m.spots[1]?.offset).toBe(1)
  })

  it('script·style 안의 글자는 가져오지 않는다', () => {
    const el = host('<p>본문</p><script>var a = "스크립트"</script><style>.x{}</style>')
    expect(mapText(el).text).toBe('본문')
  })
})

describe('범위 찾기', () => {
  it('한 텍스트 노드 안에서 찾는다', () => {
    const el = host('<p>관계자에 따르면 그렇다고 알려졌다.</p>')
    const rs = findRanges(el, '그렇다고 알려졌다')
    expect(rs).toHaveLength(1)
    expect(squeeze(rs[0]?.toString() ?? '')).toBe('그렇다고알려졌다')
  })

  it('**블록 경계를 넘어 찾는다** — 추출본에는 공백이 있고 화면에는 없다', () => {
    // 추출본: "앞 문장이다. 뒤 문장이다." (블록마다 개행을 심으므로 공백이 생긴다)
    // 화면:   "앞 문장이다.뒤 문장이다."  (textContent 는 경계를 무시한다)
    const el = host('<p>앞 문장이다.</p><p>뒤 문장이다.</p>')
    const rs = findRanges(el, '앞 문장이다. 뒤 문장이다.')
    expect(rs).toHaveLength(1)
  })

  it('<br> 로 갈린 줄도 찾는다', () => {
    const el = host('<p>첫 줄이고<br>둘째 줄이다</p>')
    expect(findRanges(el, '첫 줄이고 둘째 줄이다')).toHaveLength(1)
  })

  it('가운데 태그가 끼어 있어도 찾는다', () => {
    const el = host('<p>이것은 <b>굵은</b> 글씨가 섞인 문장이다</p>')
    const rs = findRanges(el, '이것은 굵은 글씨가 섞인 문장이다')
    expect(rs).toHaveLength(1)
    expect(squeeze(rs[0]?.toString() ?? '')).toBe('이것은굵은글씨가섞인문장이다')
  })

  it('여러 번 나오면 여러 범위를 돌려준다', () => {
    const el = host('<p>같은 문장이 또 있다</p><p>그리고 같은 문장이 또 있다</p>')
    expect(findRanges(el, '같은 문장이 또 있다')).toHaveLength(2)
  })

  it('없으면 빈 배열이다', () => {
    expect(findRanges(host('<p>본문이 여기 있다</p>'), '여기에 없는 문장이다')).toEqual([])
  })

  it('**짧은 것은 찾지 않는다** — 엉뚱한 곳에 걸린다', () => {
    const el = host('<p>가나다라마바사</p>')
    expect(findRanges(el, '가나')).toEqual([])
    expect(findRanges(el, '가나다라마바')).toHaveLength(1)
  })

  it('찾은 범위가 그 글자를 정확히 품는다 — 한 글자도 더 먹지 않는다', () => {
    const el = host('<p>앞말 찾을문장이다 뒷말</p>')
    const r = findRanges(el, '찾을문장이다')[0]
    expect(r?.toString()).toBe('찾을문장이다')
  })

  it('DOM 을 건드리지 않는다', () => {
    const el = host('<p>관계자에 따르면 그렇다고 알려졌다.</p>')
    const before = el.innerHTML
    findRanges(el, '그렇다고 알려졌다')
    expect(el.innerHTML).toBe(before)
  })

  it('자리표를 다시 쓸 수 있다 — 문장마다 훑지 않는다', () => {
    const el = host('<p>첫째 문장이다. 둘째 문장이다.</p>')
    const m = mapText(el)
    expect(findRanges(el, '첫째 문장이다', m)).toHaveLength(1)
    expect(findRanges(el, '둘째 문장이다', m)).toHaveLength(1)
  })
})
