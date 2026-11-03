// 본문에서 찾은 **글자**를 기사 화면의 **자리**로 바꾼다.
//
// ## 왜 그냥 찾을 수 없나
//
// 우리가 들고 있는 본문(`extract.ts` 의 `article.body`)은 화면의 글자와 같지 않다.
// 추출할 때 공백을 하나로 줄이고(`\s+` → ' '), 줄을 다듬고, `<br>` 자리에 개행을
// 심는다. 그래서 "집어 온 문장" 을 DOM 에서 그대로 `indexOf` 하면 거의 못 찾는다.
//
// ## 그래서 공백을 아예 지우고 맞춘다
//
// 양쪽에서 공백을 **전부** 없앤 뒤 맞춘다. `<p>가</p><p>나</p>` 는 DOM 에서 "가나",
// 추출본에서는 "가 나" 인데 둘 다 "가나" 가 되어 같아진다. 공백을 하나로 *줄이는*
// 것으로는 이 차이를 못 넘는다 — 블록 경계마다 공백이 있는 쪽과 없는 쪽이 갈린다.
//
// 짧은 글자를 찾으면 엉뚱한 곳에 걸릴 수 있지만, 우리가 찾는 것은 **문장**이라
// 사실상 일어나지 않는다. `MIN_NEEDLE` 로 한 번 더 막는다.

/** 이보다 짧은 것은 찾지 않는다. 공백을 지운 길이 기준. */
const MIN_NEEDLE = 6

/** 글자를 가져오지 않는 요소. 화면에 글로 보이지 않는 것들이다. */
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'])

/** 공백을 전부 없앤다. */
export const squeeze = (s: string): string => s.replace(/\s+/g, '')

interface Spot {
  node: Text
  /** 그 텍스트 노드 안에서의 자리 */
  offset: number
}

/** `root` 아래 글자를 공백 없이 이어 붙인 것과, 글자마다 어디서 왔는지. */
export interface TextMap {
  /** 공백을 없앤 글 */
  text: string
  /** `text[i]` 가 온 자리. 길이는 `text` 와 같다 */
  spots: Spot[]
}

/** `root` 아래의 글자를 훑어 자리표를 만든다. */
export function mapText(root: Node): TextMap {
  const doc = root.ownerDocument ?? (root as Document)
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n: Node) {
      const parent = n.parentElement
      if (parent && SKIP.has(parent.tagName)) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })

  let text = ''
  const spots: Spot[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const node = n as Text
    const raw = node.data
    for (let i = 0; i < raw.length; i += 1) {
      const ch = raw[i] ?? ''
      if (/\s/.test(ch)) continue
      text += ch
      spots.push({ node, offset: i })
    }
  }
  return { text, spots }
}

/**
 * `needle` 이 있는 자리를 전부 찾아 범위로 돌려준다.
 *
 * **DOM 을 건드리지 않는다.** `Range` 는 자리를 가리킬 뿐이라 기사 화면이 바뀌지
 * 않는다 — 글자를 `<mark>` 로 감싸면 그 사이트의 스크립트가 깨질 수 있다
 * (docs/security/secure-coding.md 4절의 "주입은 Shadow DOM 안에" 와 같은 뜻이다).
 */
export function findRanges(root: Node, needle: string, map?: TextMap): Range[] {
  const want = squeeze(needle)
  if (want.length < MIN_NEEDLE) return []

  const { text, spots } = map ?? mapText(root)
  const doc = root.ownerDocument ?? (root as Document)
  const out: Range[] = []

  for (let from = 0; ; ) {
    const i = text.indexOf(want, from)
    if (i < 0) break
    const a = spots[i]
    const b = spots[i + want.length - 1]
    if (a && b) {
      const r = doc.createRange()
      r.setStart(a.node, a.offset)
      // 끝은 **그 글자 다음**이다. 마지막 글자를 품으려면 하나 더 간다.
      r.setEnd(b.node, b.offset + 1)
      out.push(r)
    }
    from = i + want.length
  }
  return out
}
