// ② 포털 목록 동그라미. **제목만 보고 판단한 것을 제목 옆에 표시한다**
// (docs/requirements.md 4절).
//
// ## 이 표시가 하는 일은 하나다 — 낚시성 제목을 본다
//
// ②가 묻는 항목은 둘뿐이고 둘 다 제목만 본다 (judgment-items.json 의
// `request_group.portal_list`).
//
//   - `clickbait_headline` — 내용을 감추거나("그 이유는") 부풀리는지("충격")
//   - `spread_inducement` — 퍼뜨리라고 재촉하는지("꼭 공유하세요")
//
// 둘 다 **제목이 클릭을 끌어내려고 쓰는 표현**이고, 그것이 이 기능의 전부다.
// **기사 내용이 어떤지는 말하지 않는다** — 본문을 읽지 않았다.
//
// 판단 스키마도 이 말을 쓴다 (`clickbait_headline` 의 criteria 가 "낚시성 표현 일부",
// "낚시성 표현 뚜렷함"). **사용자에게 보이는 문구만 다르다** — packages/content 는
// "끌어당기는 표현" 이라고 적는다. "낚시" 는 기자가 미끼를 던졌다는 뜻이라 매체를
// 탓하는 말로 읽히고, 그것은 제품이 하지 않기로 한 일이다 (docs/product.md 2절).
// **한쪽에 맞춰 다른 쪽을 고치지 않는다.** 두 말은 읽는 사람이 다르다.
//
// 목록은 훑는 자리다. 거기서 할 수 있는 가장 정직한 일은 "이 제목이 당신을 끌려고
// 하는가" 한 가지이고, 그 이상을 말하면 제목만 보고 기사를 평가하는 꼴이 된다.
//
// 그런데 **아이콘만으로는 그 뜻이 전해지지 않는다.** 그래서 화면 오른쪽 아래에
// 범례를 띄운다 (`createLegend`). 한 번 닫으면 다시 뜨지 않는다.
//
// 여기는 **화면에 닿지 않는 부분만** 둔다 — 어떤 링크가 기사인가, 동그라미를 어떻게 그릴 것인가.
// 실제 DOM 조작과 스크롤 추적은 entrypoints/portal.ts 에 있다. 그래야 테스트에서 부를 수 있다.
import { normalizeUrl } from './cache'
import { createIcon } from './icon'
import { LEVEL_ICON, inkFor } from './item-view'
import { isArticleUrl } from '../match-patterns'
import type { IconName } from './icon-data'
import type { DisplayLevel } from './protocol'

/**
 * 우리가 넣은 요소를 알아보는 이름. **페이지와 겹치지 않는 식별자를 쓴다**
 * (docs/security/secure-coding.md 4절).
 */
export const MARK_CLASS = 'genuearly-portal-mark'

/**
 * 제목으로 볼 최소 글자 수.
 *
 * 포털 목록은 같은 기사를 **여러 번 건다** — 썸네일 이미지, 제목, "더보기". 그중 글자가
 * 거의 없는 링크에 동그라미를 달면 이미지 위에 점 하나가 떠 있게 된다.
 * **측정으로 정한 값이 아니다.**
 */
export const MIN_HEADLINE_CHARS = 8

export interface PortalTitle {
  /** 원래 주소. 판단 요청과 캐시 키에 쓴다 */
  url: string
  headline: string
  anchor: HTMLAnchorElement
}

/**
 * 목록에서 **기사 제목 링크**를 골라낸다.
 *
 * **클래스 이름으로 찾지 않는다.** 포털의 클래스(`sa_text_title` 같은)는 예고 없이 바뀌고,
 * 바뀌면 ②가 조용히 아무것도 안 하게 된다. 대신 **링크가 가리키는 주소**를 본다 —
 * 그 주소가 ①이 배지를 띄울 수 있는 기사면 제목 링크다. 포털이 화면을 다시 그려도
 * 기사 주소의 모양은 그대로다.
 *
 * 같은 기사를 가리키는 링크가 여럿이면 **글자가 가장 긴 것**을 제목으로 본다.
 * 썸네일 링크는 글자가 없고 제목 링크에는 제목이 통째로 들어 있다.
 */
export function collectTitles(root: ParentNode): PortalTitle[] {
  const byUrl = new Map<string, PortalTitle>()
  for (const a of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = a.href
    if (!isArticleUrl(href)) continue
    const headline = (a.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (headline.length < MIN_HEADLINE_CHARS) continue
    let key: string
    try {
      key = normalizeUrl(href)
    } catch {
      continue
    }
    const prev = byUrl.get(key)
    if (!prev || headline.length > prev.headline.length) {
      byUrl.set(key, { url: href, headline, anchor: a })
    }
  }
  return [...byUrl.values()]
}

/**
 * 동그라미의 근거. **제목만 본 것과 본문까지 본 것을 같은 생김새로 그리면 안 된다**
 * (requirements.md 4-3절).
 */
export type MarkBasis = 'headline' | 'full'

export interface MarkLook {
  /** 어느 아이콘을 쓸 것인가 */
  icon: IconName
  color: string
  /** 진한 벌(Filled)로 그리는가. 본문까지 본 판단일 때만 채운다 */
  filled: boolean
}

/**
 * 단계와 근거를 생김새로.
 *
 * **색으로 가르지 않는다.** 단계는 **아이콘 모양**이 가르고 색은 거든다 —
 * 세모 느낌표(주의) · 눈(확인) · 가로줄(신호 없음) · 물음표(보류) · 점 셋(도는 중).
 * 근거의 세기는 **굵기**가 가른다: 테두리 벌 = 제목만, 진한 벌 = 본문까지.
 * 둘 다 색각 이상에서도 구분된다.
 *
 * 전에는 1.5px 테두리를 두른 동그라미 안에 글자 기호를 넣었다. 테두리를 없앴다 —
 * 목록 한 화면에 서른 개가 뜨는데 가는 선 서른 줄이 글자보다 먼저 보였다
 * (taste-skill tells.md 4절: 가는 선은 구조가 아니다).
 *
 * > TODO: 근거의 차이를 **글자로도** 알려 줘야 한다. 지금은 생김새뿐이라 화면을 읽어 주는
 * > 도구에는 "제목만 보았다" 가 전달되지 않는다. "제목만" 에 해당하는 문구를
 * > ChatKHU 로 받아야 한다 (GE-16 의 4차).
 */
export function markLook(level: DisplayLevel, basis: MarkBasis, dark = false): MarkLook {
  return {
    icon: LEVEL_ICON[level],
    color: inkFor(level, dark),
    // 판단 중(점 셋)은 아직 근거가 없다. 근거가 생기기 전에 진하게 그리지 않는다.
    filled: basis === 'full' && level !== 'PENDING',
  }
}

/** 목록 제목 옆 표시의 변 길이(px). 제목 글자(보통 15~17px)보다 작게 둔다. */
const MARK_SIZE = 15

/**
 * 동그라미 하나를 만든다.
 *
 * **Shadow DOM 안에 둔다** (secure-coding.md 4절) — 포털의 CSS 가 우리 표시를 망가뜨리지 않고,
 * 우리 것도 목록 화면을 망가뜨리지 않는다. `mode: 'closed'` 라 포털 스크립트가 읽을 수도 없다.
 *
 * **`<style>` 요소를 넣지 않는다.** 포털 페이지의 CSP `style-src` 에 걸릴 수 있다.
 * 스타일은 전부 CSSOM(`el.style`)으로 준다 — CSP 가 막지 않는 길이다.
 * `innerHTML` 도 쓰지 않는다. 제목에 `<img onerror=…>` 가 들어 있을 수 있다.
 *
 * **어두운 화면을 `matchMedia` 로 본다.** 여기서는 CSS 미디어 쿼리를 쓸 수 없다 —
 * 스타일이 전부 인라인이기 때문이다. 밝은 쪽 색을 그대로 쓰면 어두운 목록에서
 * `#247b50` 이 2.4:1 로 가라앉는다 (lib/item-view.ts 의 `LEVEL_INK_DARK`).
 */
export function createMark(doc: Document) {
  const host = doc.createElement('span')
  host.className = MARK_CLASS
  // 글자 흐름 안에 끼어들되 줄 높이를 밀지 않는다.
  host.style.setProperty('display', 'inline-block')
  host.style.setProperty('vertical-align', 'middle')
  host.style.setProperty('margin-inline-end', '4px')

  const shadow = host.attachShadow({ mode: 'closed' })
  const dark = doc.defaultView?.matchMedia('(prefers-color-scheme: dark)').matches ?? false

  function render(level: DisplayLevel, basis: MarkBasis, label: string): void {
    const look = markLook(level, basis, dark)
    const svg = createIcon(doc, look.icon, {
      size: MARK_SIZE,
      color: look.color,
      filled: look.filled,
    })
    // 목록 화면이 주인공이다. 표시가 제목보다 세면 안 된다 (requirements.md 4-2절).
    // **Shadow DOM 안에 둔다** — host 에 걸면 포털 스크립트가 우리 표시를 읽을 수 있다.
    svg.style.setProperty('opacity', '0.95')
    shadow.replaceChildren(svg)
    // 화면을 읽어 주는 도구와 마우스를 올렸을 때. **문구는 packages/content 가 원본이다.**
    host.setAttribute('role', 'img')
    host.setAttribute('aria-label', label)
    host.title = label
  }

  return { host, render }
}

// ── 범례 ────────────────────────────────────────────────

/** 범례 요소를 알아보는 이름. 표시와 마찬가지로 페이지와 겹치지 않는 이름을 쓴다. */
export const LEGEND_CLASS = 'genuearly-portal-legend'

/**
 * 접어 뒀다는 것을 적어 두는 칸. **`local` 이다** — 브라우저를 닫아도 접힌 채다.
 *
 * 전에는 `portalLegendSeen` 이었고 "한 번 닫았으면 다시 띄우지 않는다" 는 뜻이었다.
 * **그것이 잘못이었다** — 제목 옆 아이콘은 영원히 뜨는데 설명은 한 번 닫으면 볼 길이
 * 없었다. 이제 없애지 않고 접는다. 접혀 있어도 제목 줄은 남아 있어 언제든 펼 수 있다.
 */
export const LEGEND_COLLAPSED_KEY = 'portalLegendCollapsed'

/** 범례에 줄을 세우는 차례. 걸린 것이 위다 — 사용자가 먼저 묻는 것이 그쪽이다. */
export const LEGEND_LEVELS = ['CAUTION', 'CHECK', 'SAFE', 'UNDETERMINED', 'PENDING'] as const

/**
 * 지난번에 접어 뒀는가.
 *
 * **못 읽으면 "접혀 있다" 로 친다.** 저장소가 막힌 사용자에게 페이지마다 펼쳐진
 * 상자가 뜨는 것보다, 접힌 줄 하나가 뜨는 편이 덜 성가시다. 펴는 길은 남아 있다.
 */
export async function legendCollapsed(): Promise<boolean> {
  try {
    const got = (await browser.storage.local.get(LEGEND_COLLAPSED_KEY)) as Record<string, unknown>
    return got[LEGEND_COLLAPSED_KEY] === true
  } catch {
    return true
  }
}

/** 접었는지 펼쳤는지 적어 둔다. 못 적어도 이번 페이지에서는 접힌다. */
export async function setLegendCollapsed(collapsed: boolean): Promise<void> {
  try {
    await browser.storage.local.set({ [LEGEND_COLLAPSED_KEY]: collapsed })
  } catch {
    /* 다음에 펼쳐진 채로 뜬다. 성가실 뿐 해롭지 않다 */
  }
}

/**
 * 범례 상자를 만든다. **`createMark` 와 같은 모양이다** — 호스트 하나, 닫힌 Shadow,
 * 글은 전부 `textContent`.
 *
 * 포털 페이지 위에 우리 상자를 얹는 일이라 **스타일이 새어 나가지도 들어오지도 않아야**
 * 한다. 포털의 `* { box-sizing }` 하나에도 모양이 무너진다.
 */
export function createLegend(
  doc: Document,
  copy: {
    title: string
    lede: string
    levels: Record<string, string>
    solid: string
    collapse: string
    expand: string
  },
  /** 접거나 편 뒤에 불린다. 적어 두는 일은 부르는 쪽이 한다 */
  onToggle: (collapsed: boolean) => void,
  시작할때접힘 = false,
) {
  const host = doc.createElement('div')
  host.className = LEGEND_CLASS
  const shadow = host.attachShadow({ mode: 'closed' })
  const dark = doc.defaultView?.matchMedia('(prefers-color-scheme: dark)').matches ?? false

  const style = doc.createElement('style')
  style.textContent = `
    :host { all: initial; }
    .box {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 2147483000;
      width: 280px;
      max-width: calc(100vw - 32px);
      box-sizing: border-box;
      padding: 14px 16px;
      border-radius: 10px;
      background: ${dark ? '#1a1a1c' : '#ffffff'};
      color: ${dark ? '#ffffff' : '#1a1a1c'};
      border: 1px solid ${dark ? '#333336' : '#e3e3e6'};
      box-shadow: 0 6px 24px rgba(0, 0, 0, ${dark ? '0.5' : '0.14'});
      font: 400 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "Malgun Gothic", sans-serif;
    }
    /* 접으면 제목 줄만 남으므로 폭도 글자에 맞춘다 */
    .box.collapsed { width: auto; }
    .head { display: flex; align-items: center; gap: 8px; }
    .title { flex: 1; font-size: 13px; font-weight: 600; margin: 0; }
    .x {
      flex: none; width: 24px; height: 24px; padding: 0;
      display: flex; align-items: center; justify-content: center;
      font: inherit; line-height: 1; cursor: pointer;
      color: ${dark ? '#b4b4b4' : '#5f6368'};
      background: none; border: 0; border-radius: 6px;
    }
    .x:hover { color: ${dark ? '#ffffff' : '#1a1a1c'}; }
    .x:focus-visible { outline: 0; box-shadow: 0 0 0 3px rgba(2, 182, 127, 0.4); }
    .lede, .solid { margin: 6px 0 0; font-size: 12px; color: ${dark ? '#b4b4b4' : '#5f6368'}; }
    .rows { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 6px; }
    .row { display: flex; align-items: center; gap: 8px; }
    .what { font-size: 12px; }
    .rule { margin: 10px 0 0; padding-top: 8px; border-top: 1px solid ${dark ? '#333336' : '#e3e3e6'}; }
    @media (prefers-reduced-motion: no-preference) {
      .box { animation: rise 0.18s ease-out; }
    }
    @keyframes rise { from { transform: translateY(8px); opacity: 0; } }
  `

  const box = doc.createElement('div')
  box.className = 'box'
  box.setAttribute('role', 'complementary')

  const head = doc.createElement('div')
  head.className = 'head'
  const h = doc.createElement('p')
  h.className = 'title'
  h.textContent = copy.title
  const x = doc.createElement('button')
  x.className = 'x'
  x.type = 'button'
  x.textContent = '✕'
  // **없애지 않고 접는다.** 제목 줄은 늘 남아 있어 언제든 펼 수 있다.
  // **글자가 아니라 아이콘이다.** 나머지 표시와 같은 그림을 쓴다 (lib/icon-data.ts).
  // 접혀 있으면 아래쪽(V) — 누르면 내려온다. 펴져 있으면 위쪽(ㅅ) — 누르면 접힌다.
  const chevron = createIcon(doc, 'chevron-down', { size: 14 })
  x.replaceChildren(chevron)

  let 접힘 = 시작할때접힘
  const 그린다 = (): void => {
    chevron.style.setProperty('transform', 접힘 ? 'none' : 'rotate(180deg)')
    x.setAttribute('aria-label', 접힘 ? copy.expand : copy.collapse)
    x.setAttribute('aria-expanded', String(!접힘))
    for (const el of [lede, rows, solid]) el.hidden = 접힘
    // **접으면 제목 줄만 남는다.** 폭도 글자에 맞춰 줄인다 — 280px 짜리 빈 상자가
    // 남아 있으면 접은 것으로 보이지 않는다.
    box.classList.toggle('collapsed', 접힘)
  }
  x.addEventListener('click', () => {
    접힘 = !접힘
    그린다()
    onToggle(접힘)
  })
  head.append(h, x)
  box.append(head)

  const lede = doc.createElement('p')
  lede.className = 'lede'
  lede.textContent = copy.lede
  box.append(lede)

  const rows = doc.createElement('ul')
  rows.className = 'rows'
  for (const level of LEGEND_LEVELS) {
    const what = copy.levels[level]
    if (!what) continue
    const li = doc.createElement('li')
    li.className = 'row'
    // **표시와 똑같은 아이콘을 쓴다.** 범례가 화면과 다르면 범례가 아니다.
    const look = markLook(level, 'headline', dark)
    const svg = createIcon(doc, look.icon, { size: MARK_SIZE, color: look.color, filled: look.filled })
    const text = doc.createElement('span')
    text.className = 'what'
    text.textContent = what
    li.append(svg, text)
    rows.append(li)
  }
  box.append(rows)

  const solid = doc.createElement('p')
  solid.className = 'solid rule'
  solid.textContent = copy.solid
  box.append(solid)

  그린다()
  shadow.append(style, box)
  // `box` 를 함께 돌려준다. Shadow 가 닫혀 있어 바깥에서는 안이 보이지 않는데,
  // **이 상자는 글이 전부라 그리는 내용을 검사로 지켜야 한다** — `createMark` 는
  // 아이콘 하나뿐이라 그럴 것이 없었다. 부르는 쪽은 `host` 와 `close` 만 쓴다.
  return { host, box, remove: () => host.remove() }
}
