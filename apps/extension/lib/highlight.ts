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

/** 칠한 자리 하나에 붙는 사유. 한 문장이 여러 항목에 걸리면 여럿이 된다. */
export interface Why {
  /** 항목 이름. "확인하기 어려운 주장" 처럼 */
  item: string
  /** 왜 걸렸는지 한 문장. 없으면 항목 이름만 보여 준다 */
  reason?: string
  /** 이 사유의 단계. 빨강이 노랑보다 먼저 온다 */
  level: MarkLevel
}

/** 칠하는 두 단계. 🔴 와 🟡 다 — 🟢·⚪ 는 칠하지 않는다. */
export type MarkLevel = 'CAUTION' | 'CHECK'

/** 칠할 것 하나. */
export interface Mark {
  /** 글에 있는 글자. 그대로 찾는다 */
  text: string
  /**
   * 이 자리의 단계. **여러 사유가 겹치면 가장 센 것**이다 —
   * 빨강과 노랑이 함께 나오면 빨강으로 칠한다 (lib/marks.ts 의 merge).
   */
  level: MarkLevel
  /** 왜 칠했는지. 빨강이 앞에 온다. 같은 단계면 나온 순서 그대로다 */
  whys: Why[]
  /** 어느 글에서 찾을 것인가. 없으면 본문이다 */
  where?: 'headline' | 'body'
}

/** 칠할 곳. 제목 요소가 없는 사이트도 있다 (`headlineMeta` 로 읽은 경우). */
export interface Roots {
  body?: Node | null
  headline?: Node | null
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
  // 사유마다 한 덩이. 한 문장이 여러 항목에 걸리면 여럿이 뜬다.
  const tipList = doc.createElement('div')
  tipList.className = 'ge-hl__tip-list'
  tip.append(tipList)

  const el = doc.createElement('div')
  el.append(layer, tip)

  let boxes: Box[] = []
  /** 지금 칠한 것. 다시 잴 때 쓴다 */
  let painted: { mark: Mark; ranges: Range[] }[] = []
  let roots: Roots = {}
  let last못찾음: { text: string; where: string; 글자수: number }[] = []
  let frame = 0

  function showTip(b: Box): void {
    tipList.replaceChildren()
    for (const why of b.mark.whys) {
      const row = doc.createElement('div')
      row.className = 'ge-hl__tip-row'
      row.dataset.level = why.level
      const name = doc.createElement('div')
      name.className = 'ge-hl__tip-item'
      name.textContent = why.item
      row.append(name)
      if (why.reason) {
        const text = doc.createElement('div')
        text.className = 'ge-hl__tip-why'
        text.textContent = why.reason
        row.append(text)
      }
      tipList.append(row)
    }
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
          box.dataset.level = mark.level
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

  // **글자가 밀리는 것을 듣는다.** 포털 기사는 사진이 늦게 와서 그만큼 본문이
  // 내려간다. 스크롤·창 크기만 듣고 있으면 칠이 엉뚱한 줄에 남는다.
  // `ResizeObserver` 는 글 상자의 높이가 바뀔 때 불린다 — 사진 로딩, 글꼴 교체,
  // 늦게 붙는 광고가 모두 여기에 걸린다.
  const RO = (win as unknown as { ResizeObserver?: typeof ResizeObserver } | undefined)?.ResizeObserver
  const watcher = RO ? new RO(() => relayout()) : undefined

  return {
    el,
    /** 지금 칠한 상자 수. 검사가 본다 */
    count: () => boxes.length,
    /** `marks` 를 `where` 안에서 찾아 칠한다. 전에 칠한 것은 지운다. */
    paint(where: Roots, marks: readonly Mark[]): void {
      roots = where
      // 자리표는 글마다 **한 번만** 만든다. 대목마다 다시 훑으면 긴 기사에서 느리다.
      const maps = new Map<Node, ReturnType<typeof mapText>>()
      const mapFor = (n: Node) => {
        const got = maps.get(n)
        if (got) return got
        const made = mapText(n)
        maps.set(n, made)
        return made
      }
      watcher?.disconnect()
      for (const n of [where.body, where.headline]) {
        if (n instanceof Element) watcher?.observe(n)
      }
      painted = []
      /** 못 찾은 대목. **화면만 보면 "안 칠해졌다" 하나로 보이므로 적어 둔다** */
      const 못찾음: { text: string; where: string; 글자수: number }[] = []
      for (const mark of marks) {
        const node = mark.where === 'headline' ? where.headline : where.body
        if (!node) {
          못찾음.push({ text: mark.text.slice(0, 40), where: `${mark.where ?? 'body'}(요소없음)`, 글자수: 0 })
          continue
        }
        const ranges = findRanges(node, mark.text, mapFor(node))
        if (ranges.length) painted.push({ mark, ranges })
        else {
          못찾음.push({
            text: mark.text.slice(0, 40),
            where: mark.where ?? 'body',
            글자수: mapFor(node).text.length,
          })
        }
      }
      last못찾음 = 못찾음
      layout()
    },
    /** 못 찾은 대목. 왜 안 칠해졌는지 가릴 때 본다 */
    missed: () => last못찾음,
    /** 다시 잰다. 글꼴이 늦게 와서 글자가 밀리는 경우에 부른다 */
    remeasure(): void {
      if (roots.body || roots.headline) relayout()
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
      watcher?.disconnect()
      if (frame) cancelAnimationFrame(frame)
      this.clear()
    },
  }
}
