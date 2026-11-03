// 기사 본문에 **형광펜을 칠하고**, 올려놓으면 왜 칠했는지 보여 준다.
//
// ## 기사 DOM 을 건드리지 않는다
//
// 글자를 `<mark>` 로 감싸는 길을 쓰지 않는다. 그 사이트의 스크립트가 자기 DOM 을
// 세고 있을 수 있고, 우리가 노드를 쪼개면 거기서 깨진다. 되돌릴 때도 완전히
// 되돌아가지 않는다 (docs/security/secure-coding.md 4절).
//
// 대신 `Range.getClientRects()` 로 **글자가 놓인 자리**를 받아, 그 위에 우리
// Shadow DOM 안의 반투명 상자를 덮는다. 기사 쪽에는 아무 일도 일어나지 않는다.
//
// ## 그래서 따라다녀야 한다
//
// 상자는 화면 좌표에 떠 있으므로 스크롤·크기 변경·글꼴 로딩으로 글자가 움직이면
// 어긋난다. 그래서 다시 잰다. **프레임마다 재지 않는다** — `requestAnimationFrame`
// 으로 한 프레임에 한 번으로 묶는다.
import { findRanges, mapText } from './spans'

/** 칠할 것 하나. */
export interface Mark {
  /** 본문에 있는 글자. 그대로 찾는다 */
  text: string
  /** 항목 이름. "확인하기 어려운 주장" 처럼 */
  item: string
  /** 왜 걸렸는지 한 문장. 없으면 항목 이름만 보여 준다 */
  reason?: string
}

/** 상자 하나가 들고 있는 것. */
interface Box {
  el: HTMLElement
  mark: Mark
}

/**
 * 형광펜 레이어.
 *
 * 배지·말풍선과 같은 Shadow DOM 안에 산다. `paint` 를 부르면 그 전에 칠한 것은
 * 지우고 다시 칠한다 — 덧칠하려면 부르는 쪽이 목록을 합쳐서 넘긴다.
 */
export function createHighlighter(doc: Document = document) {
  const layer = doc.createElement('div')
  layer.className = 'ge-hl'
  // **마우스를 받지 않는다.** 레이어가 기사를 덮고 있어서, 여기서 받으면 기사의
  // 링크를 누를 수 없게 된다. 상자 하나하나만 `pointer-events: auto` 로 켠다.
  layer.setAttribute('aria-hidden', 'true')

  const tip = doc.createElement('div')
  tip.className = 'ge-hl__tip'
  tip.setAttribute('role', 'status')
  tip.hidden = true
  const tipItem = doc.createElement('div')
  tipItem.className = 'ge-hl__tip-item'
  const tipWhy = doc.createElement('div')
  tipWhy.className = 'ge-hl__tip-why'
  tip.append(tipItem, tipWhy)

  const el = doc.createElement('div')
  el.append(layer, tip)

  let boxes: Box[] = []
  /** 지금 칠한 것. 다시 잴 때 쓴다 */
  let painted: { mark: Mark; ranges: Range[] }[] = []
  let root: Node | null = null
  let frame = 0

  function showTip(b: Box): void {
    tipItem.textContent = b.mark.item
    tipWhy.textContent = b.mark.reason ?? ''
    tipWhy.hidden = !b.mark.reason
    tip.hidden = false
    // 상자 위에 띄운다. 위가 좁으면 아래로 내린다.
    const r = b.el.getBoundingClientRect()
    tip.style.setProperty('left', `${Math.max(8, r.left)}px`)
    const above = r.top > 90
    tip.style.setProperty('top', above ? `${r.top - 8}px` : `${r.bottom + 8}px`)
    tip.dataset.place = above ? 'above' : 'below'
  }
  const hideTip = (): void => { tip.hidden = true }

  /** 자리를 다시 재서 상자를 그린다. */
  function layout(): void {
    for (const b of boxes) b.el.remove()
    boxes = []
    for (const { mark, ranges } of painted) {
      for (const r of ranges) {
        for (const rect of Array.from(r.getClientRects())) {
          // 글자가 접혀 보이지 않는 줄은 폭·높이가 0 으로 온다. 그릴 것이 없다.
          if (rect.width <= 0 || rect.height <= 0) continue
          const box = doc.createElement('span')
          box.className = 'ge-hl__box'
          box.style.setProperty('left', `${rect.left}px`)
          box.style.setProperty('top', `${rect.top}px`)
          box.style.setProperty('width', `${rect.width}px`)
          box.style.setProperty('height', `${rect.height}px`)
          const b: Box = { el: box, mark }
          box.addEventListener('mouseenter', () => showTip(b))
          box.addEventListener('mouseleave', hideTip)
          // 손가락으로도 볼 수 있게. **막지 않는다** — 기사의 링크를 가로채지 않도록
          // 글자 위가 아니라 우리 상자에서만 일어나는 일이다.
          box.addEventListener('click', () => showTip(b))
          layer.append(box)
          boxes.push(b)
        }
      }
    }
  }

  /** 한 프레임에 한 번만 다시 잰다. */
  const relayout = (): void => {
    if (frame) return
    frame = requestAnimationFrame(() => { frame = 0; layout() })
  }

  const onScroll = (): void => { hideTip(); relayout() }
  const win = doc.defaultView
  win?.addEventListener('scroll', onScroll, { passive: true, capture: true })
  win?.addEventListener('resize', onScroll, { passive: true })

  return {
    el,
    /** 지금 칠한 상자 수. 검사가 본다 */
    count: () => boxes.length,
    /**
     * `marks` 를 `where` 안에서 찾아 칠한다. 전에 칠한 것은 지운다.
     *
     * 자리표는 **한 번만** 만든다. 문장마다 본문을 다시 훑으면 긴 기사에서 느리다.
     */
    paint(where: Node, marks: readonly Mark[]): void {
      root = where
      const map = mapText(where)
      painted = []
      for (const mark of marks) {
        const ranges = findRanges(where, mark.text, map)
        if (ranges.length) painted.push({ mark, ranges })
      }
      layout()
    },
    /** 다시 잰다. 글꼴이 늦게 와서 글자가 밀리는 경우에 부른다 */
    remeasure(): void {
      if (root) relayout()
    },
    clear(): void {
      painted = []
      hideTip()
      layout()
    },
    /** 듣기를 그만둔다 */
    destroy(): void {
      win?.removeEventListener('scroll', onScroll, { capture: true })
      win?.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
      this.clear()
    },
  }
}
